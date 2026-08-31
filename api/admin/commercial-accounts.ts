import bcrypt from "bcrypt";
import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../auth/_shared.js";

const MERCADO_PAGO_API = "https://api.mercadopago.com";
const PLAN_CONFIG = {
  basic: { label: "Basic", limit: 1, priceCents: 2990 },
  plus: { label: "Plus", limit: 3, priceCents: 4990 },
} as const;

type PlanId = keyof typeof PLAN_CONFIG;

function isPlan(value: unknown): value is PlanId {
  return value === "basic" || value === "plus";
}

async function ensureTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS commercial_subscriptions (
      id bigserial PRIMARY KEY,
      "userId" integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan varchar(20) NOT NULL,
      "priceCents" integer NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending_payment',
      source varchar(40) NOT NULL DEFAULT 'commercial_signup',
      "provisionedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE commercial_subscriptions ADD COLUMN IF NOT EXISTS "provisionedAt" timestamptz`;
  await sql`
    CREATE TABLE IF NOT EXISTS site_access_logs (
      id bigserial PRIMARY KEY,
      "userId" integer REFERENCES users(id) ON DELETE SET NULL,
      path varchar(500) NOT NULL,
      referrer varchar(1000),
      "ipAddress" varchar(120),
      "userAgent" text,
      "createdAt" timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS site_access_logs_user_idx ON site_access_logs ("userId", "createdAt" DESC)`;
}

async function getSuperAdmin(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.name, u.role, u."isActive", u."passwordHash"
      FROM local_sessions s
      JOIN users u ON u.id = s."userId"
     WHERE s.token = ${token}
       AND s."expiresAt" > NOW()
     LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive || user.role !== "super_admin") return null;
  return user;
}

async function listCommercialAccounts() {
  const sql = getSql();
  const rows = await sql`
    WITH account_users AS (
      SELECT id AS "userId", id AS "ownerId"
        FROM users
       WHERE "loginMethod" = 'commercial_signup'
      UNION ALL
      SELECT id AS "userId", "accountOwnerId" AS "ownerId"
        FROM users
       WHERE "loginMethod" = 'commercial_subuser'
         AND "accountOwnerId" IS NOT NULL
    ), usage_summary AS (
      SELECT
        au."ownerId",
        MAX(sal."createdAt") AS "lastAccessAt",
        COUNT(DISTINCT (sal."userId"::text || ':' || FLOOR(EXTRACT(EPOCH FROM sal."createdAt") / 300)::bigint::text))::int AS "usageBuckets"
      FROM account_users au
      JOIN site_access_logs sal ON sal."userId" = au."userId"
      GROUP BY au."ownerId"
    )
    SELECT
      u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",
      cs.plan, cs."priceCents", cs.status, cs."provisionedAt", cs."updatedAt" AS "subscriptionUpdatedAt",
      COUNT(uda.id)::int AS "databaseCount",
      COALESCE(string_agg(d.name, ', ' ORDER BY uda."createdAt", d.id), '') AS "databaseNames",
      usage."lastAccessAt",
      COALESCE(usage."usageBuckets", 0)::int * 5 AS "usageMinutes"
    FROM users u
    JOIN commercial_subscriptions cs ON cs."userId" = u.id
    LEFT JOIN user_database_access uda ON uda."userId" = u.id
    LEFT JOIN databases d ON d.id = uda."databaseId"
    LEFT JOIN usage_summary usage ON usage."ownerId" = u.id
    WHERE u."loginMethod" = 'commercial_signup'
    GROUP BY
      u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",
      cs.plan, cs."priceCents", cs.status, cs."provisionedAt", cs."updatedAt",
      usage."lastAccessAt", usage."usageBuckets"
    ORDER BY
      CASE WHEN cs.status = 'pending_payment' THEN 0 WHEN cs.status = 'past_due' THEN 1 ELSE 2 END,
      u."createdAt" DESC
  `;

  const accounts = rows.map((row: any) => {
    const planValue = String(row.plan || "");
    const plan: PlanId | null = isPlan(planValue) ? planValue : null;
    const usageMinutes = Number(row.usageMinutes || 0);
    return {
      ...row,
      usageMinutes,
      usageHours: Number((usageMinutes / 60).toFixed(2)),
      databaseLimit: plan ? PLAN_CONFIG[plan].limit : 0,
      paymentState:
        row.status === "active" || row.status === "paid"
          ? "paid"
          : row.status === "past_due"
            ? "unpaid"
            : "pending",
    };
  });

  return {
    accounts,
    summary: {
      total: accounts.length,
      pending: accounts.filter((item: any) => item.status === "pending_payment").length,
      overdue: accounts.filter((item: any) => item.status === "past_due").length,
      active: accounts.filter((item: any) => item.status === "active" || item.status === "paid").length,
      monthlyActiveCents: accounts
        .filter((item: any) => item.status === "active" || item.status === "paid")
        .reduce((sum: number, item: any) => sum + Number(item.priceCents || 0), 0),
      totalUsageMinutes: accounts.reduce((sum: number, item: any) => sum + Number(item.usageMinutes || 0), 0),
    },
  };
}

async function getCommercialAccount(userId: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id, u.username, u.name, u.email, u."loginMethod", u."isActive",
      cs.plan, cs."priceCents", cs.status, cs."provisionedAt",
      cs."providerSubscriptionId", cs.provider, cs."billingMethod"
    FROM users u
    JOIN commercial_subscriptions cs ON cs."userId" = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const target = rows[0] as any;
  if (!target || target.loginMethod !== "commercial_signup") {
    throw Object.assign(new Error("Conta comercial não encontrada."), { statusCode: 404 });
  }
  return target;
}

async function writeSubscriptionAudit(admin: any, target: any, action: string, details: any) {
  const sql = getSql();
  await sql`
    INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
    VALUES (
      ${admin.id}, ${admin.username || admin.email || "Super Admin"}, ${action},
      'commercial_subscriptions', ${target.id}, ${JSON.stringify(details)}, 'success', NOW()
    )
  `;
}

async function approveCommercialAccount(userId: number, admin: any) {
  const sql = getSql();
  const target = await getCommercialAccount(userId);
  const planValue = String(target.plan || "");
  if (!isPlan(planValue)) throw Object.assign(new Error("Plano comercial inválido para esta conta."), { statusCode: 409 });
  const config = PLAN_CONFIG[planValue];
  await sql`UPDATE users SET "isActive" = true, "failedLoginAttempts" = 0, "updatedAt" = NOW() WHERE id = ${userId}`;
  await sql`UPDATE commercial_subscriptions SET status = 'active', "updatedAt" = NOW() WHERE "userId" = ${userId}`;
  await writeSubscriptionAudit(admin, target, "approve_commercial_account", {
    plan: planValue,
    databaseLimit: config.limit,
    provisioning: "first_login",
    alreadyProvisioned: Boolean(target.provisionedAt),
  });
  return {
    plan: planValue,
    planLabel: config.label,
    databaseLimit: config.limit,
    alreadyProvisioned: Boolean(target.provisionedAt),
  };
}

async function setPaymentStatus(userId: number, admin: any, status: "active" | "past_due") {
  const sql = getSql();
  const target = await getCommercialAccount(userId);
  const planValue = String(target.plan || "");
  if (!isPlan(planValue)) throw Object.assign(new Error("Plano comercial inválido para esta conta."), { statusCode: 409 });
  await sql`UPDATE users SET "isActive" = true, "failedLoginAttempts" = 0, "updatedAt" = NOW() WHERE id = ${userId}`;
  await sql`UPDATE commercial_subscriptions SET status = ${status}, "updatedAt" = NOW() WHERE "userId" = ${userId}`;
  await writeSubscriptionAudit(
    admin,
    target,
    status === "past_due" ? "mark_subscription_past_due" : "mark_subscription_paid",
    {
      previousStatus: target.status,
      newStatus: status,
      accessMode: status === "past_due" ? "dashboard_only" : "full_plan_access",
    }
  );
  return { status, plan: planValue, planLabel: PLAN_CONFIG[planValue].label };
}

async function cancelMercadoPagoSubscription(providerSubscriptionId: string) {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  if (!accessToken || !providerSubscriptionId) return;
  const response = await fetch(`${MERCADO_PAGO_API}/preapproval/${encodeURIComponent(providerSubscriptionId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    console.error("[admin/commercial-accounts/cancel-provider]", data);
    throw Object.assign(new Error("Não foi possível cancelar a cobrança no Mercado Pago. A conta não foi excluída por segurança."), { statusCode: 502 });
  }
}

async function deleteUnpaidCommercialAccount(userId: number, admin: any, password: string) {
  const sql = getSql();
  const target = await getCommercialAccount(userId);
  if (target.status !== "past_due" && target.status !== "pending_payment") {
    throw Object.assign(new Error("Só é permitido excluir clientes sem pagamento confirmado."), { statusCode: 409 });
  }
  if (!password || !admin.passwordHash) {
    throw Object.assign(new Error("Digite a senha do Super Administrador para confirmar a exclusão."), { statusCode: 400 });
  }
  const passwordOk = await bcrypt.compare(password, String(admin.passwordHash));
  if (!passwordOk) {
    throw Object.assign(new Error("Senha do Super Administrador incorreta. A conta não foi excluída."), { statusCode: 403 });
  }

  const providerSubscriptionId = String(target.providerSubscriptionId || "").trim();
  if (target.provider === "mercadopago" && providerSubscriptionId) {
    await cancelMercadoPagoSubscription(providerSubscriptionId);
  }

  const childRows = await sql`
    SELECT id FROM users
    WHERE "loginMethod" = 'commercial_subuser' AND "accountOwnerId" = ${userId}
  `;
  const childIds = childRows.map((row: any) => Number(row.id)).filter((id: number) => Number.isInteger(id) && id > 0);

  for (const childId of childIds) {
    await sql`DELETE FROM local_sessions WHERE "userId" = ${childId}`;
    await sql`DELETE FROM user_database_access WHERE "userId" = ${childId}`;
    await sql`DELETE FROM site_access_logs WHERE "userId" = ${childId}`;
    await sql`DELETE FROM "auditLogs" WHERE "userId" = ${childId}`;
  }

  await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
  await sql`DELETE FROM user_database_access WHERE "userId" = ${userId}`;
  await sql`DELETE FROM site_access_logs WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "auditLogs" WHERE "userId" = ${userId}`;
  await sql`DELETE FROM users WHERE "loginMethod" = 'commercial_subuser' AND "accountOwnerId" = ${userId}`;
  await sql`DELETE FROM commercial_subscriptions WHERE "userId" = ${userId}`;
  const deleted = await sql`
    DELETE FROM users
    WHERE id = ${userId} AND "loginMethod" = 'commercial_signup'
    RETURNING id, username
  `;
  if (!deleted[0]) throw Object.assign(new Error("Conta comercial não encontrada para exclusão."), { statusCode: 404 });

  await writeSubscriptionAudit(admin, target, "delete_unpaid_commercial_account", {
    deletedUsername: target.username,
    previousStatus: target.status,
    providerSubscriptionCancelled: Boolean(providerSubscriptionId),
    deletedSubusers: childIds.length,
  });

  return { username: String(target.username || "cliente"), deletedSubusers: childIds.length };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { success: false, message: "Método não permitido." });
    }

    const admin = await getSuperAdmin(req);
    if (!admin) return sendJson(res, 403, { success: false, message: "Área exclusiva do Super Administrador." });
    await ensureTables();

    if (req.method === "GET") {
      const data = await listCommercialAccounts();
      return sendJson(res, 200, { success: true, ...data });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action ?? "approve");
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return sendJson(res, 400, { success: false, message: "Usuário inválido." });

    if (action === "approve") {
      const approval = await approveCommercialAccount(userId, admin);
      return sendJson(res, 200, {
        success: true,
        approval,
        message: approval.alreadyProvisioned
          ? `Conta ${approval.planLabel} aprovada e ativa. Os bancos já estavam provisionados.`
          : `Conta ${approval.planLabel} aprovada e ativa. Os ${approval.databaseLimit} banco(s) do plano serão criados automaticamente no primeiro login do contratante.`,
      });
    }

    if (action === "mark_unpaid") {
      const payment = await setPaymentStatus(userId, admin, "past_due");
      return sendJson(res, 200, {
        success: true,
        payment,
        message: "Assinatura marcada como aguardando pagamento. O cliente poderá entrar, mas ficará restrito ao Dashboard.",
      });
    }

    if (action === "mark_paid") {
      const payment = await setPaymentStatus(userId, admin, "active");
      return sendJson(res, 200, {
        success: true,
        payment,
        message: "Pagamento confirmado. As funções do plano foram liberadas novamente.",
      });
    }

    if (action === "delete_unpaid") {
      const deleted = await deleteUnpaidCommercialAccount(userId, admin, String(body?.password ?? ""));
      return sendJson(res, 200, {
        success: true,
        deleted,
        message: `Conta de ${deleted.username} excluída com segurança.`,
      });
    }

    return sendJson(res, 400, { success: false, message: "Ação comercial não reconhecida." });
  } catch (error: any) {
    console.error("[admin/commercial-accounts]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: error instanceof Error ? error.message : "Não foi possível concluir a operação comercial.",
    });
  }
}
