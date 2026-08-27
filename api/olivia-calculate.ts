import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";
import { solveOliviaCalculation } from "./olivia-calculators.js";

async function hasOliviaAccess(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return false;
  const sql = getSql();
  const rows = await sql`
    SELECT u.role,u."isActive",u."oliviaEnabled"
    FROM local_sessions s
    JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">now()
    LIMIT 1
  `;
  const user = rows[0] as any;
  return Boolean(
    user?.isActive && (user.role === "super_admin" || user.oliviaEnabled === true)
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método não permitido." });
  }

  try {
    if (!(await hasOliviaAccess(req))) {
      return sendJson(res, 403, { error: "Acesso à Olivia não autorizado." });
    }
    const body = await readJsonBody(req);
    const message = String(body?.message ?? "").trim().slice(0, 4000);
    if (!message) return sendJson(res, 400, { error: "Mensagem vazia." });

    const calculation = solveOliviaCalculation(message);
    return sendJson(res, 200, calculation
      ? { handled: true, ...calculation }
      : { handled: false });
  } catch (error) {
    console.error("[Olivia Calculate]", error);
    return sendJson(res, 500, { error: "Não consegui calcular essa solicitação." });
  }
}
