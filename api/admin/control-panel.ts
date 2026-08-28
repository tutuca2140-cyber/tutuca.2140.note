import {
  getSql,
  readCookie,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../auth/_shared.js";

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

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (!token) {
      return sendJson(res, 401, { success: false, message: "Sessão não encontrada." });
    }

    const sql = getSql();
    const session = await sql`
      SELECT u.id, u.username, u.role, u."isActive"
        FROM local_sessions s
        JOIN users u ON u.id = s."userId"
       WHERE s.token = ${token}
         AND s."expiresAt" > NOW()
       LIMIT 1
    `;
    const currentUser = session[0] as any;
    if (!currentUser?.isActive || currentUser.role !== "super_admin") {
      return sendJson(res, 403, {
        success: false,
        message: "Painel disponível somente para o Super Administrador.",
      });
    }

    await ensureTables();

    const [
      usersSummary,
      subscriptionsSummary,
      accessSummary,
      sessionsSummary,
      operationalSummary,
      databaseSummary,
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
          COUNT(*) FILTER (WHERE status IN ('active', 'paid'))::int AS active,
          COALESCE(SUM("priceCents"), 0)::bigint AS "selectedValueCents",
          COALESCE(SUM("priceCents") FILTER (WHERE status = 'pending_payment'), 0)::bigint AS "pendingValueCents",
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
      },
      recentAccess,
      users: userRows,
      recentAudits,
    });
  } catch (error) {
    console.error("[admin/control-panel]", error);
    return sendJson(res, 500, {
      success: false,
      message: "Não foi possível carregar o painel de controle.",
    });
  }
}
