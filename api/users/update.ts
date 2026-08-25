import { getSql, readJsonBody, requireSuperAdmin, sendJson } from "../auth/_shared.js";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido." });
  try {
    const admin = await requireSuperAdmin(req, res); if (!admin) return;
    const body = await readJsonBody(req);
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return sendJson(res, 400, { success: false, message: "Usuário inválido." });
    const sql = getSql();
    const rows = await sql`SELECT id, username FROM users WHERE id = ${userId} LIMIT 1`;
    const target = rows[0] as any;
    if (!target) return sendJson(res, 404, { success: false, message: "Usuário não encontrado." });
    if (String(target.username).toLowerCase() === "draco") return sendJson(res, 403, { success: false, message: "Draco é uma conta protegida." });

    const role = body?.role === "admin" ? "admin" : "user";
    const isActive = body?.isActive !== false;

    await sql`
      UPDATE users SET
        role = ${role},
        "canView" = ${body?.canView !== false},
        "canInsert" = ${Boolean(body?.canInsert)},
        "canEdit" = ${Boolean(body?.canEdit)},
        "canDelete" = ${Boolean(body?.canDelete)},
        "canGenerateReports" = ${Boolean(body?.canGenerateReports)},
        "canAccessSettings" = ${role === "admin" ? Boolean(body?.canAccessSettings) : false},
        "isActive" = ${isActive},
        "updatedAt" = NOW()
      WHERE id = ${userId}
    `;
    if (!isActive) await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("[users/update]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível atualizar o usuário." });
  }
}
