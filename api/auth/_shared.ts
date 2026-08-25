import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "app_session_id";

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");
  return neon(databaseUrl);
}

export function makeSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function readCookie(req: any, name: string) {
  const header = String(req?.headers?.cookie ?? "");
  for (const rawPart of header.split(";")) {
    const part = rawPart.trim();
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(part.slice(0, idx));
    if (key === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}

export function setSessionCookie(res: any, token: string, maxAgeSeconds: number) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  );
}

export function clearSessionCookie(res: any) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: any) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string" && req.body.length > 0) return JSON.parse(req.body);

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function getAuthenticatedUser(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;

  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id, u.username, u.name, u.email, u.role,
      u."canView", u."canInsert", u."canEdit", u."canDelete",
      u."canGenerateReports", u."canAccessSettings", u."isActive"
    FROM local_sessions s
    INNER JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token}
      AND s."expiresAt" > NOW()
      AND u."isActive" = true
    LIMIT 1
  `;
  return (rows[0] as any) ?? null;
}

export async function requireSuperAdmin(req: any, res: any) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    return null;
  }
  if (user.role !== "super_admin" || String(user.username).toLowerCase() !== "draco") {
    sendJson(res, 403, { success: false, message: "Acesso exclusivo do Super Administrador." });
    return null;
  }
  return user;
}
