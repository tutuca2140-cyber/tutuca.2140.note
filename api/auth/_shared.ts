import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "app_session_id";

export function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não configurada");
  }
  return neon(databaseUrl);
}

let authColumnsPromise: Promise<void> | null = null;
export function ensureAuthUserColumns() {
  if (authColumnsPromise) return authColumnsPromise;
  const sql = getSql();
  authColumnsPromise = (async () => {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "dashboardOnly" boolean DEFAULT false NOT NULL`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer DEFAULT 0 NOT NULL`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "accountOwnerId" integer`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canManageUsers" boolean DEFAULT false NOT NULL`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canManageDatabases" boolean DEFAULT false NOT NULL`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canDeleteCashFlow" boolean DEFAULT false NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS users_account_owner_idx ON users ("accountOwnerId")`;
  })().catch((error) => {
    authColumnsPromise = null;
    throw error;
  });
  return authColumnsPromise;
}

export function makeSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function readCookie(req: any, name: string) {
  const header = String(req?.headers?.cookie ?? "");
  const parts = header.split(";").map((part: string) => part.trim());

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;

    const key = decodeURIComponent(part.slice(0, idx));
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }

  return null;
}

export function setSessionCookie(
  res: any,
  token: string,
  maxAgeSeconds: number
) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(
      token
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
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
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: any) {
  if (req?.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req?.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
