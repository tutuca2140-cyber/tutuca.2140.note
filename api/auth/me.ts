import { getAuthenticatedUser, sendJson } from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return sendJson(res, 401, { authenticated: false });
    return sendJson(res, 200, { authenticated: true, user });
  } catch (error) {
    console.error("[auth/me]", error);
    return sendJson(res, 500, { authenticated: false, message: "Falha ao validar sessão." });
  }
}
