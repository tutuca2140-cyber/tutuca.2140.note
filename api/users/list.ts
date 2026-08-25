import { getSql, requireSuperAdmin, sendJson } from "../auth/_shared.js";
export default async function handler(req: any, res: any) {
  if (req.method !== "GET") return sendJson(res, 405, { success: false, message: "Método não permitido." });
  try {
    const admin = await requireSuperAdmin(req, res); if (!admin) return;
    const sql = getSql();
    const users = await sql`
      SELECT id, username, name, email, role,
        "canView", "canInsert", "canEdit", "canDelete",
        "canGenerateReports", "canAccessSettings", "isActive",
        "createdAt", "lastSignedIn"
      FROM users
      ORDER BY CASE WHEN lower(username) = 'draco' THEN 0 ELSE 1 END, "createdAt" DESC
    `;
    return sendJson(res, 200, { success: true, users });
  } catch (error) {
    console.error("[users/list]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível carregar os usuários." });
  }
}
