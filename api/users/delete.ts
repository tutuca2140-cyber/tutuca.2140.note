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
    if (String(target.username).toLowerCase() === "draco") return sendJson(res, 403, { success: false, message: "Draco não pode ser excluído." });

    await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
    await sql`DELETE FROM password_reset_tokens WHERE "userId" = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("[users/delete]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível excluir o usuário." });
  }
}
