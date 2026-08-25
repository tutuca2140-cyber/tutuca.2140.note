import bcrypt from "bcrypt";
import { getSql, readJsonBody, requireSuperAdmin, sendJson } from "../auth/_shared.js";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido." });
  try {
    const admin = await requireSuperAdmin(req, res); if (!admin) return;
    const body = await readJsonBody(req);
    const userId = Number(body?.userId);
    const password = String(body?.password ?? "");
    if (!Number.isInteger(userId) || userId <= 0) return sendJson(res, 400, { success: false, message: "Usuário inválido." });
    if (password.length < 6) return sendJson(res, 400, { success: false, message: "A senha deve ter no mínimo 6 caracteres." });

    const sql = getSql();
    const rows = await sql`SELECT id, username FROM users WHERE id = ${userId} LIMIT 1`;
    const target = rows[0] as any;
    if (!target) return sendJson(res, 404, { success: false, message: "Usuário não encontrado." });
    if (String(target.username).toLowerCase() === "draco") return sendJson(res, 403, { success: false, message: "A senha do Draco não pode ser alterada nesta tela." });

    const passwordHash = await bcrypt.hash(password, 12);
    await sql`UPDATE users SET "passwordHash" = ${passwordHash}, "updatedAt" = NOW() WHERE id = ${userId}`;
    await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
    return sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("[users/reset-password]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível redefinir a senha." });
  }
}
