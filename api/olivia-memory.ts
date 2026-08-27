import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

async function ensureOliviaMemorySchema() {
  const sql = getSql();
  await sql`ALTER TABLE olivia_settings ADD COLUMN IF NOT EXISTS "continuityCoefficient" integer DEFAULT 90 NOT NULL`;
  await sql`ALTER TABLE olivia_settings ADD COLUMN IF NOT EXISTS "memoryEnabled" boolean DEFAULT true NOT NULL`;
  await sql`ALTER TABLE olivia_settings ADD COLUMN IF NOT EXISTS "voiceEnabled" boolean DEFAULT true NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS olivia_conversations (
      id serial PRIMARY KEY,
      "userId" integer NOT NULL,
      "databaseId" integer NOT NULL,
      role varchar(16) NOT NULL CHECK (role IN ('user','assistant')),
      content text NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS olivia_conversations_user_db_created_idx ON olivia_conversations ("userId", "databaseId", "createdAt" DESC)`;
}

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sessions = await sql`
    SELECT u.id, u.username, u.name, u.role, u."isActive", u."oliviaEnabled"
    FROM local_sessions s
    JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token} AND s."expiresAt" > now()
    LIMIT 1
  `;
  const user = sessions[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;

  let database: any;
  if (user.role === "super_admin") {
    const rows = await sql`SELECT id, name FROM databases WHERE "isActive" = true LIMIT 1`;
    database = rows[0];
  } else {
    const rows = await sql`
      SELECT d.id, d.name
      FROM user_database_access uda
      JOIN databases d ON d.id = uda."databaseId"
      WHERE uda."userId" = ${user.id} AND uda."isActive" = true
      LIMIT 1
    `;
    database = rows[0];
    if (!database) {
      const fallback = await sql`
        SELECT d.id, d.name
        FROM user_database_access uda
        JOIN databases d ON d.id = uda."databaseId"
        WHERE uda."userId" = ${user.id}
        LIMIT 1
      `;
      database = fallback[0];
    }
  }
  if (!database) return null;
  return { user, database };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureOliviaMemorySchema();
    const context = await getContext(req);
    if (!context) return sendJson(res, 403, { error: "Acesso à Olivia não autorizado." });
    const sql = getSql();
    const settingsRows = await sql`
      SELECT "continuityCoefficient", "memoryEnabled", "voiceEnabled"
      FROM olivia_settings
      LIMIT 1
    `;
    const settings = (settingsRows[0] ?? {
      continuityCoefficient: 90,
      memoryEnabled: true,
      voiceEnabled: true,
    }) as any;

    if (req.method === "GET") {
      if (!settings.memoryEnabled) {
        return sendJson(res, 200, { messages: [], settings });
      }
      const depth = clamp(Math.round(Number(settings.continuityCoefficient || 90) / 6), 4, 20);
      const rows = await sql`
        SELECT id, role, content, "createdAt"
        FROM olivia_conversations
        WHERE "userId" = ${context.user.id} AND "databaseId" = ${context.database.id}
        ORDER BY "createdAt" DESC, id DESC
        LIMIT ${depth * 2}
      `;
      return sendJson(res, 200, {
        messages: [...rows].reverse(),
        settings,
        databaseName: context.database.name,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (body?.action === "configure") {
        if (context.user.role !== "super_admin") {
          return sendJson(res, 403, { error: "Somente o Super Admin pode configurar a continuidade da Olivia." });
        }
        const coefficient = clamp(Number(body.continuityCoefficient ?? 90), 0, 100);
        const memoryEnabled = body.memoryEnabled !== false;
        const voiceEnabled = body.voiceEnabled !== false;
        await sql`
          UPDATE olivia_settings
          SET "continuityCoefficient" = ${coefficient},
              "memoryEnabled" = ${memoryEnabled},
              "voiceEnabled" = ${voiceEnabled},
              "updatedBy" = ${context.user.id},
              "updatedAt" = now()
        `;
        return sendJson(res, 200, { success: true, continuityCoefficient: coefficient, memoryEnabled, voiceEnabled });
      }

      if (!settings.memoryEnabled) return sendJson(res, 200, { success: true, stored: false });
      const userMessage = String(body?.userMessage ?? "").trim().slice(0, 4000);
      const assistantMessage = String(body?.assistantMessage ?? "").trim().slice(0, 8000);
      if (!userMessage || !assistantMessage) {
        return sendJson(res, 400, { error: "Troca de conversa incompleta." });
      }
      await sql`INSERT INTO olivia_conversations ("userId", "databaseId", role, content) VALUES (${context.user.id}, ${context.database.id}, 'user', ${userMessage})`;
      await sql`INSERT INTO olivia_conversations ("userId", "databaseId", role, content) VALUES (${context.user.id}, ${context.database.id}, 'assistant', ${assistantMessage})`;
      return sendJson(res, 200, { success: true, stored: true });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Método não permitido." });
  } catch (error) {
    console.error("[Olivia Memory]", error);
    return sendJson(res, 500, { error: "Não foi possível acessar a memória da Olivia." });
  }
}
