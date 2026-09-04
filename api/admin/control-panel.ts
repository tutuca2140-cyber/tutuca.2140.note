import { getAuthorizedAdmin } from "../../server/admin-access.js";
import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../auth/_shared.js";

const NEON_STORAGE_LIMIT_BYTES = 536_870_912; // 512 MiB - limite lógico atual do plano Neon Free.
const NEON_PLAN_NAME = "Free";

let tablesPromise: Promise<void> | null = null;

function ensureTables() {
  if (tablesPromise) return tablesPromise;
  const sql = getSql();
  tablesPromise = (async () => {
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
    await sql`
      CREATE TABLE IF NOT EXISTS commercial_subscriptions (
        id bigserial PRIMARY KEY,
        "userId" integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        plan varchar(20) NOT NULL,
        "priceCents" integer NOT NULL,
        status varchar(30) NOT NULL DEFAULT 'pending_payment',
        source varchar(40) NOT NULL DEFAULT 'commercial_signup',
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `;
  })().catch(error => {
    tablesPromise = null;
    throw error;
  });
  return tablesPromise;
}

async function deleteInternalUser(userId: number, currentUser: any) {
  const sql = getSql();
  const targetRows = await sql`
    SELECT id, username, email, name, role, "loginMethod"
      FROM users
     WHERE id = ${userId}
     LIMIT 1
  `;
  const target = targetRows[0] as any;

  if (!target) {
    throw Object.assign(new Error("Usuário não encontrado."), {
      statusCode: 404,
    });
  }
  if (
    target.role === "super_admin" ||
    String(target.username || "").toLowerCase() === "draco"
  ) {
    throw Object.assign(
      new Error("O Super Administrador protegido não pode ser excluído."),
      { statusCode: 403 }
    );
  }
  if (
    target.loginMethod === "commercial_signup" ||
    target.loginMethod === "commercial_subuser"
  ) {
    throw Object.assign(
      new Error(
        "Contas comerciais não podem ser excluídas por esta área de usuários internos."
      ),
      { statusCode: 403 }
    );
  }

  // Exclui somente a conta e seus vínculos de acesso. Bancos e dados operacionais são preservados.
  await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
  await sql`DELETE FROM password_reset_tokens WHERE "userId" = ${userId}`;
  await sql`DELETE FROM user_database_access WHERE "userId" = ${userId}`;
  await sql`UPDATE site_access_logs SET "userId" = NULL WHERE "userId" = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;

  await sql`
    INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
    VALUES (
      ${currentUser.id},
      ${currentUser.username || "Super Admin"},
      'delete_internal_user',
      'users',
      ${userId},
      ${JSON.stringify({
        deletedUsername: target.username,
        deletedEmail: target.email,
        deletedName: target.name,
        preservedOperationalData: true,
      })},
      'success',
      NOW()
    )
  `;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, {
      success: false,
      message: "Método não permitido.",
    });
  }

  try {
    const currentUser = await getAuthorizedAdmin(req, "control");
    if (!currentUser)
      return sendJson(res, 403, {
        success: false,
        message: "Sem autorização para o Painel de Controle.",
      });
    const sql = getSql();

    await ensureTables();

    if (req.method === "POST") {
      if (currentUser.role !== "super_admin")
        return sendJson(res, 403, {
          success: false,
          message: "Somente o Super Admin pode excluir usuários internos.",
        });
      const body = await readJsonBody(req);
      const action = String(body?.action ?? "").trim();
      const userId = Number(body?.userId);
      if (action !== "delete_internal_user") {
        return sendJson(res, 400, {
          success: false,
          message: "Ação administrativa não reconhecida.",
        });
      }
      if (!Number.isInteger(userId) || userId <= 0) {
        return sendJson(res, 400, {
          success: false,
          message: "Usuário inválido.",
        });
      }
      await deleteInternalUser(userId, currentUser);
      return sendJson(res, 200, {
        success: true,
        message:
          "Usuário excluído do sistema. Bancos e dados operacionais foram preservados.",
      });
    }

    const [
      usersSummary,
      subscriptionsSummary,
      accessSummary,
      sessionsSummary,
      operationalSummary,
      databaseSummary,
      storageSummary,
      onlineUsers,
      recentAccess,
      userRows,
      recentAudits,
    ] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
          COUNT(*) FILTER (WHERE "isActive" = false)::int AS inactive,
          COUNT(*) FILTER (WHERE "loginMethod" = 'commercial_signup')::int AS commercial,
          COUNT(*) FILTER (WHERE COALESCE("loginMethod", 'local') <> 'commercial_signup')::int AS internal,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
        FROM users
        WHERE role <> 'super_admin'
      `,
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE plan = 'basic')::int AS basic,
          COUNT(*) FILTER (WHERE plan = 'plus')::int AS plus,
          COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'past_due')::int AS overdue,
          COUNT(*) FILTER (WHERE status IN ('active', 'paid'))::int AS active,
          COALESCE(SUM("priceCents"), 0)::bigint AS "selectedValueCents",
          COALESCE(SUM("priceCents") FILTER (WHERE status IN ('pending_payment', 'past_due')), 0)::bigint AS "pendingValueCents",
          COALESCE(SUM("priceCents") FILTER (WHERE status IN ('active', 'paid')), 0)::bigint AS "activeMonthlyValueCents"
        FROM commercial_subscriptions
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" >= date_trunc('day', NOW()))::int AS today,
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - interval '7 days')::int AS seven_days,
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - interval '30 days')::int AS thirty_days,
          COUNT(*) FILTER (WHERE "userId" IS NOT NULL AND "createdAt" >= NOW() - interval '30 days')::int AS authenticated_30d,
          COUNT(*) FILTER (WHERE "userId" IS NULL AND "createdAt" >= NOW() - interval '30 days')::int AS anonymous_30d
        FROM site_access_logs
      `,
      sql`
        SELECT COUNT(*)::int AS active
          FROM local_sessions
         WHERE "expiresAt" > NOW()
      `,
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM clients) AS clients,
          (SELECT COUNT(*)::int FROM loans WHERE status IN ('ativo', 'atrasado')) AS active_loans,
          COALESCE(SUM(CASE WHEN type = 'ENTRADA' THEN amount::numeric ELSE 0 END), 0) AS entries,
          COALESCE(SUM(CASE WHEN type = 'SAIDA' THEN amount::numeric ELSE 0 END), 0) AS exits,
          COALESCE(SUM(CASE WHEN type = 'ENTRADA' THEN amount::numeric ELSE -amount::numeric END), 0) AS balance
        FROM cash_flow
      `,
      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "isActive" = true)::int AS active
        FROM databases
      `,
      sql`
        SELECT pg_database_size(current_database())::bigint AS "usedBytes"
      `,
      sql`
        SELECT
          u.id,
          u."supportId",
          u.name,
          u.username,
          u.email,
          MAX(a."createdAt") AS "lastActivityAt",
          (array_agg(a.path ORDER BY a."createdAt" DESC))[1] AS path
        FROM site_access_logs a
        JOIN users u ON u.id = a."userId"
        WHERE a."createdAt" >= NOW() - interval '2 minutes 30 seconds'
        GROUP BY u.id, u."supportId", u.name, u.username, u.email
        ORDER BY "lastActivityAt" DESC
      `,
      sql`
        SELECT
          a.id,
          a.path,
          a.referrer,
          a."ipAddress",
          a."userAgent",
          a."createdAt",
          u.username,
          u.email,
          u.name
        FROM site_access_logs a
        LEFT JOIN users u ON u.id = a."userId"
        ORDER BY a."createdAt" DESC
        LIMIT 100
      `,
      sql`
        SELECT
          u.id,
          u."supportId",
          u.username,
          u.email,
          u.name,
          u.role,
          u."isActive",
          u."loginMethod",
          u."createdAt",
          u."lastSignedIn",
          cs.plan,
          cs."priceCents",
          cs.status AS "subscriptionStatus",
          EXISTS (
            SELECT 1 FROM local_sessions s
             WHERE s."userId" = u.id AND s."expiresAt" > NOW()
          ) AS "hasActiveSession",
          COALESCE((
            SELECT COUNT(*)::int FROM user_database_access uda
             WHERE uda."userId" = u.id
          ), 0) AS "databaseCount",
          COALESCE((
            SELECT string_agg(d.name, ', ' ORDER BY d.name)
              FROM user_database_access uda
              JOIN databases d ON d.id = uda."databaseId"
             WHERE uda."userId" = u.id
          ), '') AS "databaseNames"
        FROM users u
        LEFT JOIN commercial_subscriptions cs ON cs."userId" = u.id
        WHERE u.role <> 'super_admin'
        ORDER BY u."createdAt" DESC
      `,
      sql`
        SELECT id, username, action, entity, "databaseId", details, status, "createdAt"
          FROM "auditLogs"
         ORDER BY "createdAt" DESC
         LIMIT 30
      `,
    ]);

    const usedBytes = Math.max(
      0,
      Number((storageSummary[0] as any)?.usedBytes || 0)
    );
    const remainingBytes = Math.max(0, NEON_STORAGE_LIMIT_BYTES - usedBytes);
    const usedPercent = Math.min(
      100,
      Number(((usedBytes / NEON_STORAGE_LIMIT_BYTES) * 100).toFixed(2))
    );

    return sendJson(res, 200, {
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        users: usersSummary[0] ?? {},
        subscriptions: subscriptionsSummary[0] ?? {},
        accesses: accessSummary[0] ?? {},
        sessions: sessionsSummary[0] ?? {},
        operations: operationalSummary[0] ?? {},
        databases: databaseSummary[0] ?? {},
        storage: {
          provider: "Neon",
          projectName: "notenote-database",
          plan: NEON_PLAN_NAME,
          usedBytes,
          remainingBytes,
          limitBytes: NEON_STORAGE_LIMIT_BYTES,
          usedPercent,
        },
      },
      recentAccess,
      onlineUsers,
      users: userRows,
      recentAudits,
    });
  } catch (error: any) {
    console.error("[admin/control-panel]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação do painel de controle.",
    });
  }
}
