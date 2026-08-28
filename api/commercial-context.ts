import {
  ensureAuthUserColumns,
  getSql,
  readCookie,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    await ensureAuthUserColumns();
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (!token) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT
        u.id,
        u.username,
        u.role,
        u."loginMethod",
        u."accountOwnerId",
        u."canManageUsers",
        u."canManageDatabases",
        u."canDeleteCashFlow",
        u."isActive"
      FROM local_sessions s
      JOIN users u ON u.id = s."userId"
      WHERE s.token = ${token}
        AND s."expiresAt" > NOW()
      LIMIT 1
    `;
    const user = rows[0] as any;
    if (!user?.isActive) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }

    if (user.role === "super_admin") {
      return sendJson(res, 200, {
        success: true,
        commercial: false,
        isSuperAdmin: true,
        isOwner: false,
        plan: null,
        status: null,
        ownerId: null,
        teamLimit: null,
        permissions: {
          canManageUsers: true,
          canManageDatabases: true,
          canDeleteCashFlow: true,
        },
      });
    }

    const isOwner = user.loginMethod === "commercial_signup";
    const isSubuser = user.loginMethod === "commercial_subuser" && Number(user.accountOwnerId) > 0;
    if (!isOwner && !isSubuser) {
      return sendJson(res, 200, {
        success: true,
        commercial: false,
        isSuperAdmin: false,
        isOwner: false,
        plan: null,
        status: null,
        ownerId: null,
        teamLimit: null,
        permissions: {
          canManageUsers: false,
          canManageDatabases: false,
          canDeleteCashFlow: false,
        },
      });
    }

    const ownerId = isOwner ? Number(user.id) : Number(user.accountOwnerId);
    const subscriptions = await sql`
      SELECT plan, status, "priceCents"
      FROM commercial_subscriptions
      WHERE "userId" = ${ownerId}
      LIMIT 1
    `;
    const subscription = subscriptions[0] as any;
    const plan = subscription?.plan === "plus" ? "plus" : subscription?.plan === "basic" ? "basic" : null;
    const active = subscription?.status === "active" || subscription?.status === "paid";

    return sendJson(res, 200, {
      success: true,
      commercial: true,
      isSuperAdmin: false,
      isOwner,
      plan,
      status: subscription?.status ?? null,
      ownerId,
      teamLimit: plan === "plus" ? 5 : 0,
      databaseLimit: plan === "plus" ? 3 : plan === "basic" ? 1 : 0,
      permissions: {
        canManageUsers: Boolean(active && plan === "plus" && (isOwner || user.canManageUsers)),
        canManageDatabases: Boolean(active && (isOwner || user.canManageDatabases)),
        canDeleteCashFlow: Boolean(active && (isOwner || user.canDeleteCashFlow)),
      },
    });
  } catch (error) {
    console.error("[commercial-context]", error);
    return sendJson(res, 500, {
      success: false,
      message: "Não foi possível consultar as permissões comerciais.",
    });
  }
}
