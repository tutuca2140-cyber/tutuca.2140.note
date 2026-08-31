import crypto from "node:crypto";
import { getSql, readJsonBody, sendJson } from "../auth/_shared.js";

const MERCADO_PAGO_API = "https://api.mercadopago.com";

function headerValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function queryValue(req: any, name: string) {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function parseSignature(value: string) {
  const result: Record<string, string> = {};
  for (const part of value.split(",")) {
    const [key, raw] = part.split("=", 2);
    if (key && raw) result[key.trim()] = raw.trim();
  }
  return result;
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateWebhookSignature(req: any, body: any) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "").trim();
  if (!secret) throw Object.assign(new Error("Webhook secret não configurado."), { statusCode: 503 });

  const xSignature = headerValue(req, "x-signature");
  const xRequestId = headerValue(req, "x-request-id");
  const parts = parseSignature(xSignature);
  const ts = parts.ts;
  const receivedHash = parts.v1;
  if (!ts || !receivedHash) return false;

  const queryDataId = queryValue(req, "data.id") || queryValue(req, "data_id");
  const bodyDataId = body?.data?.id == null ? "" : String(body.data.id);
  const dataId = (queryDataId || bodyDataId).toLowerCase();

  let manifest = "";
  if (dataId) manifest += `id:${dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const calculated = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return safeEqualHex(calculated, receivedHash);
}

async function ensureMercadoPagoColumns() {
  const sql = getSql();
  await sql`
    ALTER TABLE commercial_subscriptions
      ADD COLUMN IF NOT EXISTS provider varchar(40),
      ADD COLUMN IF NOT EXISTS "providerSubscriptionId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "checkoutUrl" text,
      ADD COLUMN IF NOT EXISTS "externalReference" varchar(160),
      ADD COLUMN IF NOT EXISTS "lastPaymentStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "lastPaymentId" varchar(120),
      ADD COLUMN IF NOT EXISTS "lastWebhookAt" timestamptz
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS commercial_subscriptions_provider_subscription_uidx
      ON commercial_subscriptions ("providerSubscriptionId")
      WHERE "providerSubscriptionId" IS NOT NULL
  `;
}

async function mercadoPagoGet(path: string) {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  if (!accessToken) throw Object.assign(new Error("Mercado Pago não configurado."), { statusCode: 503 });

  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(`Mercado Pago retornou ${response.status}.`), {
      statusCode: 502,
      providerResponse: data,
    });
  }
  return data as any;
}

function internalStatus(providerStatus: string) {
  switch (providerStatus) {
    case "authorized":
      return "active";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "pending":
    default:
      return "pending_payment";
  }
}

async function syncPreapproval(subscriptionId: string) {
  const resource = await mercadoPagoGet(`/preapproval/${encodeURIComponent(subscriptionId)}`);
  const providerStatus = String(resource?.status ?? "pending");
  const externalReference = String(resource?.external_reference ?? "");
  const mappedStatus = internalStatus(providerStatus);
  const sql = getSql();

  const updated = await sql`
    UPDATE commercial_subscriptions
       SET provider = 'mercadopago',
           "providerSubscriptionId" = ${String(resource?.id ?? subscriptionId)},
           "providerStatus" = ${providerStatus},
           "checkoutUrl" = ${resource?.init_point ? String(resource.init_point) : null},
           "externalReference" = ${externalReference || null},
           status = ${mappedStatus},
           "lastWebhookAt" = NOW(),
           "updatedAt" = NOW()
     WHERE "providerSubscriptionId" = ${String(resource?.id ?? subscriptionId)}
        OR "externalReference" = ${externalReference || "__none__"}
     RETURNING "userId", status
  `;

  const row = updated[0] as any;
  if (row?.userId) {
    await sql`
      UPDATE users
         SET "isActive" = ${mappedStatus === "active"},
             "updatedAt" = NOW()
       WHERE id = ${Number(row.userId)}
         AND "loginMethod" = 'commercial_signup'
    `;
    if (mappedStatus !== "active") {
      await sql`DELETE FROM local_sessions WHERE "userId" = ${Number(row.userId)}`;
    }
  }
}

async function syncAuthorizedPayment(paymentId: string) {
  const resource = await mercadoPagoGet(`/authorized_payments/${encodeURIComponent(paymentId)}`);
  const preapprovalId = String(resource?.preapproval_id ?? "");
  if (!preapprovalId) return;

  const paymentStatus = String(resource?.status ?? resource?.payment?.status ?? "unknown");
  const sql = getSql();
  await sql`
    UPDATE commercial_subscriptions
       SET "lastPaymentStatus" = ${paymentStatus},
           "lastPaymentId" = ${String(resource?.id ?? paymentId)},
           "lastWebhookAt" = NOW(),
           "updatedAt" = NOW()
     WHERE "providerSubscriptionId" = ${preapprovalId}
  `;

  await syncPreapproval(preapprovalId);
}

async function syncPayment(paymentId: string) {
  const resource = await mercadoPagoGet(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const metadataPreapproval = String(
    resource?.metadata?.preapproval_id ?? resource?.subscription_id ?? resource?.preapproval_id ?? ""
  );
  const externalReference = String(resource?.external_reference ?? "");
  const paymentStatus = String(resource?.status ?? "unknown");
  const sql = getSql();

  const rows = await sql`
    UPDATE commercial_subscriptions
       SET "lastPaymentStatus" = ${paymentStatus},
           "lastPaymentId" = ${String(resource?.id ?? paymentId)},
           "lastWebhookAt" = NOW(),
           "updatedAt" = NOW()
     WHERE (${metadataPreapproval || "__none__"} <> '__none__' AND "providerSubscriptionId" = ${metadataPreapproval || "__none__"})
        OR (${externalReference || "__none__"} <> '__none__' AND "externalReference" = ${externalReference || "__none__"})
     RETURNING "providerSubscriptionId"
  `;

  const preapprovalId = String((rows[0] as any)?.providerSubscriptionId ?? metadataPreapproval);
  if (preapprovalId) await syncPreapproval(preapprovalId);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    const body = req?.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    if (!validateWebhookSignature(req, body)) {
      return sendJson(res, 401, { success: false, message: "Assinatura do webhook inválida." });
    }

    await ensureMercadoPagoColumns();
    const type = String(body?.type ?? queryValue(req, "type") ?? "").trim();
    const dataId = String(body?.data?.id ?? queryValue(req, "data.id") ?? queryValue(req, "data_id") ?? "").trim();

    if (!dataId) return sendJson(res, 200, { success: true, ignored: true });

    if (type === "subscription_preapproval") {
      await syncPreapproval(dataId);
    } else if (type === "subscription_authorized_payment") {
      await syncAuthorizedPayment(dataId);
    } else if (type === "payment") {
      await syncPayment(dataId);
    }

    return sendJson(res, 200, { success: true });
  } catch (error: any) {
    console.error("[webhooks/mercadopago]", error?.providerResponse ?? error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: "Não foi possível processar a notificação do Mercado Pago.",
    });
  }
}
