import bcrypt from "bcrypt";
import { getSql, readJsonBody, requireSuperAdmin, sendJson } from "../auth/_shared.js";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido." });
  try {
    const admin = await requireSuperAdmin(req, res); if (!admin) return;
    const body = await readJsonBody(req);
    const username = String(body?.username ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim() || null;
    const password = String(body?.password ?? "");
    const role = body?.role === "admin" ? "admin" : "user";

    if (username.length < 3) return sendJson(res, 400, { success: false, message: "Usuário deve ter no mínimo 3 caracteres." });
    if (!name) return sendJson(res, 400, { success: false, message: "Informe o nome." });
    if (password.length < 6) return sendJson(res, 400, { success: false, message: "A senha deve ter no mínimo 6 caracteres." });
    if (username.toLowerCase() === "draco") return sendJson(res, 409, { success: false, message: "O usuário Draco é reservado." });

    const sql = getSql();
    const existing = await sql`
      SELECT id FROM users
      WHERE lower(username) = lower(${username})
         OR (${email}::text IS NOT NULL AND lower(email) = lower(${email}))
      LIMIT 1
    `;
    if (existing.length) return sendJson(res, 409, { success: false, message: "Usuário ou e-mail já cadastrado." });

    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`
      INSERT INTO users (
        username, "passwordHash", name, email, "loginMethod", role,
        "canView", "canInsert", "canEdit", "canDelete",
        "canGenerateReports", "canAccessSettings", "isActive",
        "emailVerified", "createdAt", "updatedAt", "lastSignedIn"
      ) VALUES (
        ${username}, ${passwordHash}, ${name}, ${email}, 'local', ${role},
        ${body?.canView !== false}, ${Boolean(body?.canInsert)}, ${Boolean(body?.canEdit)},
        ${Boolean(body?.canDelete)}, ${Boolean(body?.canGenerateReports)},
        ${role === "admin" ? Boolean(body?.canAccessSettings) : false},
        true, false, NOW(), NOW(), NOW()
      )
      RETURNING id, username, name, email, role
    `;
    return sendJson(res, 201, { success: true, user: rows[0] });
  } catch (error) {
    console.error("[users/create]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível criar o usuário." });
  }
}
