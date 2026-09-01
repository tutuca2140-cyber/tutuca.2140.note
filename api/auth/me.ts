import {
  getSql,
  ensureAuthUserColumns,
  readCookie,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, message: "Método não permitido" });
  }

  try {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (!token) {
      return sendJson(res, 401, { authenticated: false });
    }

    await ensureAuthUserColumns();
    const sql = getSql();

    const rows = await sql`
      SELECT
        u.id,
        u.username,
        u.name,
        u.email,
        u.role,
        u."canView",
        u."canInsert",
        u."canEdit",
        u."canDelete",
        u."canGenerateReports",
        u."canAccessSettings",
        u."dashboardOnly",
        u."adminCanControlPanel",
        u."adminCanSubscriptions",
        u."adminCanMarketing",
        u."adminCanSupport",
        u."adminCanUsers",
        u."adminCanDatabases",
        u."adminCanAudit",
        u."isActive"
      FROM local_sessions s
      INNER JOIN users u ON u.id = s."userId"
      WHERE s.token = ${token}
        AND s."expiresAt" > NOW()
      LIMIT 1
    `;

    const user = rows[0] as any;

    if (!user || !user.isActive) {
      return sendJson(res, 401, { authenticated: false });
    }

    return sendJson(res, 200, {
      authenticated: true,
      user,
    });
  } catch (error) {
    console.error("[auth/me]", error);
    return sendJson(res, 500, {
      authenticated: false,
      message: "Falha ao validar sessão.",
    });
  }
}
