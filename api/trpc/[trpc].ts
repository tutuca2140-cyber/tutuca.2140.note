import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { neon } from "@neondatabase/serverless";
import { appRouter } from "../_backend/server/routers";

function readCookie(req: any, name: string) {
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

async function createContext(opts: any) {
  let user: any = null;
  const databaseUrl = process.env.DATABASE_URL;

  try {
    const token = readCookie(opts.req, "app_session_id");
    if (token && databaseUrl) {
      const sql = neon(databaseUrl);
      const rows = await sql`
        SELECT
          u.id,
          u."openId",
          u.username,
          u."passwordHash",
          u.name,
          u.email,
          u."loginMethod",
          u.role,
          u."canView",
          u."canInsert",
          u."canEdit",
          u."canDelete",
          u."canGenerateReports",
          u."canAccessSettings",
          u."isActive",
          u."emailVerified",
          u."createdAt",
          u."updatedAt",
          u."lastSignedIn"
        FROM local_sessions s
        INNER JOIN users u ON u.id = s."userId"
        WHERE s.token = ${token}
          AND s."expiresAt" > NOW()
          AND u."isActive" = true
        LIMIT 1
      `;
      user = rows[0] ?? null;
    }
  } catch (error) {
    console.error("[trpc/context]", error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;
