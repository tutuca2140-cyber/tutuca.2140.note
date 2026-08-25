import { createLoginCaptcha } from "../../shared/login-captcha.js";
import { sendJson } from "./_shared.js";

export default function handler(req: any, res: any) {
  if (req.method !== "GET") return sendJson(res, 405, { success: false, message: "Método não permitido" });
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return sendJson(res, 200, { success: true, ...createLoginCaptcha() });
}
