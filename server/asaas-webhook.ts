import crypto from "node:crypto";
import { getSql, readJsonBody, sendJson } from "../api/auth/_shared.js";

function headerValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateWebhook(req: any) {
  const expected = String(process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
  if (!expected) throw Object.assign(new Error("Token do webhook Asaas não configurado."), { statusCode: 503 });
  const received = headerValue(req, "asaas-access-token").trim();
  return Boolean(received) && safeEqual(received, expected);
}

async function ensureAsaasColumns() {
  const sql = getSql();
  await sql`
    ALTER TABLE commercial_subscriptions
      ADD COLUMN IF NOT EXISTS provider varchar(40),
      ADD COLUMN IF NOT EXISTS "providerSubscriptionId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerCheckoutId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerCustomerId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "externalReference" varchar(160),
      ADD COLUMN IF NOT EXISTS "lastPaymentStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "lastPaymentId" varchar(120),
      ADD COLUMN IF NOT EXISTS "lastWebhookAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "billingMethod" varchar(30) NOT NULL DEFAULT 'card_monthly',
      ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "paidUntil" timestamptz
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asaas_webhook_events (
      id varchar(160) PRIMARY KEY,
      event varchar(100) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT NOW()
    )
  `;
}

async function updateUserAccess(userId: number, enabled: boolean) {
  const sql = getSql();
  await sql`UPDATE users SET "isActive"=${enabled}, "updatedAt"=NOW() WHERE id=${userId} AND "loginMethod"='commercial_signup'`;
  if (!enabled) await sql`DELETE FROM local_sessions WHERE "userId"=${userId}`;
}

async function locateSubscription(externalReference: string, subscriptionId: string, paymentId: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT "userId", "billingMethod", "trialEndsAt", "paidUntil", status
    FROM commercial_subscriptions
    WHERE provider='asaas'
      AND (
        (${externalReference || "__none__"} <> '__none__' AND "externalReference"=${externalReference || "__none__"})
        OR (${subscriptionId || "__none__"} <> '__none__' AND "providerSubscriptionId"=${subscriptionId || "__none__"})
        OR (${paymentId || "__none__"} <> '__none__' AND "lastPaymentId"=${paymentId || "__none__"})
      )
    LIMIT 1
  `;
  return rows[0] as any;
}

async function handlePaymentEvent(event: string, payment: any) {
  const paymentId = String(payment?.id ?? "");
  const externalReference = String(payment?.externalReference ?? payment?.external_reference ?? "");
  const subscriptionId = String(payment?.subscription ?? "");
  const row = await locateSubscription(externalReference, subscriptionId, paymentId);
  if (!row) return;

  const trialActive = row?.trialEndsAt && new Date(row.trialEndsAt).getTime() > Date.now();
  const success = event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED";
  const failure = [
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "PAYMENT_REFUNDED",
    "PAYMENT_PARTIALLY_REFUNDED",
    "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
    "PAYMENT_BANK_SLIP_CANCELLED",
    "PAYMENT_CHARGEBACK_REQUESTED",
  ].includes(event);

  let nextStatus = String(row.status || "pending_payment");
  if (success) nextStatus = "active";
  else if (failure) nextStatus = trialActive ? "active" : "past_due";

  const annualPixPaid = success && String(row.billingMethod) === "pix_annual";
  const sql = getSql();
  const updated = await sql`
    UPDATE commercial_subscriptions SET
      "providerStatus"=${String(payment?.status ?? event)},
      "providerSubscriptionId"=COALESCE(NULLIF(${subscriptionId}, ''), "providerSubscriptionId"),
      "externalReference"=COALESCE(NULLIF(${externalReference}, ''), "externalReference"),
      "lastPaymentId"=COALESCE(NULLIF(${paymentId}, ''), "lastPaymentId"),
      "lastPaymentStatus"=${event},
      status=${nextStatus},
      "paidUntil"=CASE
        WHEN ${annualPixPaid} THEN NOW() + INTERVAL '1 year'
        ELSE "paidUntil"
      END,
      "lastWebhookAt"=NOW(), "updatedAt"=NOW()
    WHERE "userId"=${Number(row.userId)}
    RETURNING "userId", status
  `;
  const current = updated[0] as any;
  if (current?.userId) await updateUserAccess(Number(current.userId), String(current.status) === "active");
}

async function handleSubscriptionEvent(event: string, subscription: any) {
  const subscriptionId = String(subscription?.id ?? "");
  const externalReference = String(subscription?.externalReference ?? subscription?.external_reference ?? "");
  const row = await locateSubscription(externalReference, subscriptionId, "");
  if (!row) return;

  const trialActive = row?.trialEndsAt && new Date(row.trialEndsAt).getTime() > Date.now();
  const inactive = event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED";
  const nextStatus = inactive ? (trialActive ? "active" : "canceled") : String(row.status || "active");
  const sql = getSql();
  const updated = await sql`
    UPDATE commercial_subscriptions SET
      "providerSubscriptionId"=COALESCE(NULLIF(${subscriptionId}, ''), "providerSubscriptionId"),
      "externalReference"=COALESCE(NULLIF(${externalReference}, ''), "externalReference"),
      "providerStatus"=${event}, status=${nextStatus}, "lastWebhookAt"=NOW(), "updatedAt"=NOW()
    WHERE "userId"=${Number(row.userId)}
    RETURNING "userId", status
  `;
  const current = updated[0] as any;
  if (current?.userId) await updateUserAccess(Number(current.userId), String(current.status) === "active");
}

export async function handleAsaasWebhook(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    if (!validateWebhook(req)) return sendJson(res, 401, { success: false, message: "Token do webhook inválido." });
    const body = req?.body && typeof req.body === "object" ? req.body : await readJsonBody(req);
    const event = String(body?.event ?? "").trim();
    const eventId = String(body?.id ?? "").trim();
    if (!event) return sendJson(res, 200, { success: true, ignored: true });

    await ensureAsaasColumns();
    const sql = getSql();
    if (eventId) {
      const inserted = await sql`
        INSERT INTO asaas_webhook_events (id, event, "createdAt")
        VALUES (${eventId}, ${event}, NOW())
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (!inserted[0]) return sendJson(res, 200, { success: true, duplicate: true });
    }

    if (event.startsWith("PAYMENT_")) await handlePaymentEvent(event, body?.payment ?? {});
    else if (event.startsWith("SUBSCRIPTION_")) await handleSubscriptionEvent(event, body?.subscription ?? {});

    return sendJson(res, 200, { success: true });
  } catch (error: any) {
    console.error("[webhooks/asaas]", error);
    return sendJson(res, Number(error?.statusCode || 500), { success: false, message: "Não foi possível processar a notificação do Asaas." });
  }
}
