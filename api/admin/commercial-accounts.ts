import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../auth/_shared.js";

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
  await sql`
    ALTER TABLE commercial_subscriptions
    ADD COLUMN IF NOT EXISTS "provisionedAt" timestamptz
  `;
}

async function getSuperAdmin(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.name, u.role, u."isActive"
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
    SELECT
      u.id,
      u.username,
      u.name,
      u.email,
      u."isActive",
      u."createdAt",
      cs.plan,
      cs."priceCents",
      cs.status,
      cs."provisionedAt",
      cs."updatedAt" AS "subscriptionUpdatedAt",
      COUNT(uda.id)::int AS "databaseCount",
      COALESCE(
        string_agg(d.name, ', ' ORDER BY uda."createdAt", d.id),
        ''
      ) AS "databaseNames"
    FROM users u
    JOIN commercial_subscriptions cs ON cs."userId" = u.id
    LEFT JOIN user_database_access uda ON uda."userId" = u.id
    LEFT JOIN databases d ON d.id = uda."databaseId"
    WHERE u."loginMethod" = 'commercial_signup'
    GROUP BY
      u.id, u.username, u.name, u.email, u."isActive", u."createdAt",
      cs.plan, cs."priceCents", cs.status, cs."provisionedAt", cs."updatedAt"
    ORDER BY
      CASE WHEN cs.status = 'pending_payment' THEN 0 ELSE 1 END,
      u."createdAt" DESC
  `;

  const accounts = rows.map((row: any) => {
    const planValue = String(row.plan || "");
    const plan: PlanId | null = isPlan(planValue) ? planValue : null;
    return {
      ...row,
      databaseLimit: plan ? PLAN_CONFIG[plan].limit : 0,
    };
  });

  return {
    accounts,
    summary: {
      total: accounts.length,
      pending: accounts.filter((item: any) => item.status === "pending_payment").length,
      active: accounts.filter((item: any) => item.status === "active" || item.status === "paid").length,
      monthlyActiveCents: accounts
        .filter((item: any) => item.status === "active" || item.status === "paid")
        .reduce((sum: number, item: any) => sum + Number(item.priceCents || 0), 0),
    },
  };
}

async function approveCommercialAccount(userId: number, admin: any) {
  const sql = getSql();
  const targetRows = await sql`
    SELECT
      u.id, u.username, u.name, u.email, u."loginMethod", u."isActive",
      cs.plan, cs."priceCents", cs.status, cs."provisionedAt"
    FROM users u
    JOIN commercial_subscriptions cs ON cs."userId" = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const target = targetRows[0] as any;

  if (!target || target.loginMethod !== "commercial_signup") {
    throw Object.assign(new Error("Conta comercial não encontrada."), {
      statusCode: 404,
    });
  }

  const planValue = String(target.plan || "");
  if (!isPlan(planValue)) {
    throw Object.assign(new Error("Plano comercial inválido para esta conta."), {
      statusCode: 409,
    });
  }

  const plan: PlanId = planValue;
  const config = PLAN_CONFIG[plan];

  await sql`
    UPDATE users
       SET "isActive" = true,
           "failedLoginAttempts" = 0,
           "updatedAt" = NOW()
     WHERE id = ${userId}
  `;
  await sql`
    UPDATE commercial_subscriptions
       SET status = 'active', "updatedAt" = NOW()
     WHERE "userId" = ${userId}
  `;

  await sql`
    INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
    VALUES (
      ${admin.id},
      ${admin.username || admin.email || "Super Admin"},
      'approve_commercial_account',
      'users',
      ${userId},
      ${JSON.stringify({
        plan,
        databaseLimit: config.limit,
        provisioning: "first_login",
        alreadyProvisioned: Boolean(target.provisionedAt),
      })},
      'success',
      NOW()
    )
  `;

  return {
    plan,
    planLabel: config.label,
    databaseLimit: config.limit,
    alreadyProvisioned: Boolean(target.provisionedAt),
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, {
        success: false,
        message: "Método não permitido.",
      });
    }

    const admin = await getSuperAdmin(req);
    if (!admin) {
      return sendJson(res, 403, {
        success: false,
        message: "Área exclusiva do Super Administrador.",
      });
    }

    await ensureTables();

    if (req.method === "GET") {
      const data = await listCommercialAccounts();
      return sendJson(res, 200, { success: true, ...data });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action ?? "approve");
    const userId = Number(body?.userId);
    if (action !== "approve") {
      return sendJson(res, 400, {
        success: false,
        message: "Ação comercial não reconhecida.",
      });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return sendJson(res, 400, {
        success: false,
        message: "Usuário inválido.",
      });
    }

    const approval = await approveCommercialAccount(userId, admin);
    return sendJson(res, 200, {
      success: true,
      approval,
      message: approval.alreadyProvisioned
        ? `Conta ${approval.planLabel} aprovada e ativa. Os bancos já estavam provisionados.`
        : `Conta ${approval.planLabel} aprovada e ativa. Os ${approval.databaseLimit} banco(s) do plano serão criados automaticamente no primeiro login do contratante.`,
    });
  } catch (error: any) {
    console.error("[admin/commercial-accounts]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação comercial.",
    });
  }
}
