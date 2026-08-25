import {
  clearSessionCookie, getSql, readCookie, sendJson, SESSION_COOKIE_NAME,
} from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }
  try {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (token) {
      const sql = getSql();
      await sql`DELETE FROM local_sessions WHERE token = ${token}`;
    }
  } catch (error) {
    console.error("[auth/logout]", error);
  } finally {
    clearSessionCookie(res);
  }
  return sendJson(res, 200, { success: true });
}
