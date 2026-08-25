import { getSql, sendJson } from "./auth/_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, message: "Método não permitido." });
  }
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    return sendJson(res, 200, {
      ok: true,
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health]", error);
    return sendJson(res, 500, {
      ok: false,
      database: "error",
      message: "Falha na conexão com o banco.",
    });
  }
}
