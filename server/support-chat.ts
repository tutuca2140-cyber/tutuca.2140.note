import { ensureAuthUserColumns, getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME } from "../api/auth/_shared.js";

type UserRow = {
  id: number;
  name?: string;
  username?: string;
  email?: string;
  role: string;
  isActive: boolean;
  loginMethod?: string;
  accountOwnerId?: number | null;
  supportId?: string | null;
};

let tablesPromise: Promise<void> | null = null;

function ensureTables() {
  if (tablesPromise) return tablesPromise;
  const sql = getSql();
  tablesPromise = (async () => {
    await ensureAuthUserColumns();
    await sql`
      CREATE TABLE IF NOT EXISTS support_threads (
        id bigserial PRIMARY KEY,
        "subscriberUserId" integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'open',
        "lastUserMessageAt" timestamptz NOT NULL DEFAULT NOW(),
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id bigserial PRIMARY KEY,
        "threadId" bigint NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
        "senderUserId" integer REFERENCES users(id) ON DELETE SET NULL,
        "senderRole" varchar(20) NOT NULL,
        message text NOT NULL,
        "readAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS support_threads_arrival_idx ON support_threads ("lastUserMessageAt" DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages ("threadId", "createdAt")`;
  })().catch((error) => {
    tablesPromise = null;
    throw error;
  });
  return tablesPromise;
}

function cleanText(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

async function getSessionUser(req: any): Promise<UserRow | null> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id,u.name,u.username,u.email,u.role,u."isActive",u."loginMethod",u."accountOwnerId",u."supportId"
    FROM local_sessions s
    JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">NOW()
    LIMIT 1
  `;
  return (rows[0] as any) || null;
}

async function getSubscriber(user: UserRow) {
  const sql = getSql();
  if (user.loginMethod === "commercial_signup") return user;
  if (!user.accountOwnerId) return null;
  const rows = await sql`
    SELECT id,name,username,email,role,"isActive","loginMethod","accountOwnerId","supportId"
    FROM users
    WHERE id=${Number(user.accountOwnerId)} AND "loginMethod"='commercial_signup'
    LIMIT 1
  `;
  return (rows[0] as any) || null;
}

async function getThreadMessages(threadId: number) {
  const sql = getSql();
  return sql`
    SELECT m.id,m."senderRole",m.message,m."createdAt",u.name AS "senderName"
    FROM support_messages m
    LEFT JOIN users u ON u.id=m."senderUserId"
    WHERE m."threadId"=${threadId}
    ORDER BY m."createdAt" ASC,m.id ASC
  `;
}

export async function handleSupportChat(req: any, res: any) {
  try {
    await ensureTables();
    const user = await getSessionUser(req);
    if (!user) return sendJson(res, 401, { success: false, message: "Sessão expirada." });

    const sql = getSql();
    const queryAction = cleanText(Array.isArray(req?.query?.action) ? req.query.action[0] : req?.query?.action, 50).toLowerCase();

    if (user.role === "super_admin") {
      if (req.method === "GET" && (!queryAction || queryAction === "list")) {
        const threads = await sql`
          SELECT
            t.id,t.status,t."lastUserMessageAt",t."createdAt",t."updatedAt",
            u.id AS "subscriberUserId",u.name,u.username,u.email,u."supportId",
            u."isActive" AS "accountActive",
            EXISTS(
              SELECT 1 FROM local_sessions s
              WHERE s."userId"=u.id AND s."expiresAt">NOW()
            ) AS "sessionActive",
            (
              SELECT COUNT(*)::int FROM support_messages m
              WHERE m."threadId"=t.id AND m."senderRole"='user' AND m."readAt" IS NULL
            ) AS "unreadCount",
            (
              SELECT m2.message FROM support_messages m2
              WHERE m2."threadId"=t.id
              ORDER BY m2."createdAt" DESC,m2.id DESC LIMIT 1
            ) AS "lastMessage"
          FROM support_threads t
          JOIN users u ON u.id=t."subscriberUserId"
          ORDER BY t."lastUserMessageAt" DESC,t.id DESC
        `;
        return sendJson(res, 200, { success: true, threads });
      }

      if (req.method === "GET" && queryAction === "thread") {
        const threadId = Math.trunc(Number(Array.isArray(req?.query?.threadId) ? req.query.threadId[0] : req?.query?.threadId));
        if (!threadId) return sendJson(res, 400, { success: false, message: "Atendimento inválido." });
        const rows = await sql`
          SELECT t.*,u.name,u.username,u.email,u."supportId",u."isActive" AS "accountActive",
            EXISTS(SELECT 1 FROM local_sessions s WHERE s."userId"=u.id AND s."expiresAt">NOW()) AS "sessionActive"
          FROM support_threads t
          JOIN users u ON u.id=t."subscriberUserId"
          WHERE t.id=${threadId}
          LIMIT 1
        `;
        if (!rows[0]) return sendJson(res, 404, { success: false, message: "Atendimento não encontrado." });
        await sql`UPDATE support_messages SET "readAt"=COALESCE("readAt",NOW()) WHERE "threadId"=${threadId} AND "senderRole"='user'`;
        const messages = await getThreadMessages(threadId);
        return sendJson(res, 200, { success: true, thread: rows[0], messages });
      }

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        const action = cleanText(body?.action, 30).toLowerCase();
        const threadId = Math.trunc(Number(body?.threadId));
        if (!threadId) return sendJson(res, 400, { success: false, message: "Atendimento inválido." });
        const existing = await sql`SELECT id FROM support_threads WHERE id=${threadId} LIMIT 1`;
        if (!existing[0]) return sendJson(res, 404, { success: false, message: "Atendimento não encontrado." });

        if (action === "reply") {
          const message = cleanText(body?.message);
          if (!message) return sendJson(res, 400, { success: false, message: "Digite uma mensagem." });
          await sql`
            INSERT INTO support_messages ("threadId","senderUserId","senderRole",message,"readAt")
            VALUES (${threadId},${user.id},'super_admin',${message},NOW())
          `;
          await sql`UPDATE support_threads SET status='open',"updatedAt"=NOW() WHERE id=${threadId}`;
          return sendJson(res, 201, { success: true });
        }

        if (action === "close" || action === "reopen") {
          const status = action === "close" ? "closed" : "open";
          await sql`UPDATE support_threads SET status=${status},"updatedAt"=NOW() WHERE id=${threadId}`;
          return sendJson(res, 200, { success: true });
        }
      }

      return sendJson(res, 400, { success: false, message: "Ação de suporte inválida." });
    }

    const subscriber = await getSubscriber(user);
    if (!subscriber) return sendJson(res, 403, { success: false, message: "O chat de suporte está disponível para contas assinantes do Note Note." });

    if (req.method === "GET") {
      const threadRows = await sql`SELECT * FROM support_threads WHERE "subscriberUserId"=${Number(subscriber.id)} LIMIT 1`;
      const thread = threadRows[0] as any;
      const messages = thread ? await getThreadMessages(Number(thread.id)) : [];
      if (thread) await sql`UPDATE support_messages SET "readAt"=COALESCE("readAt",NOW()) WHERE "threadId"=${Number(thread.id)} AND "senderRole"='super_admin'`;
      return sendJson(res, 200, {
        success: true,
        supportId: subscriber.supportId,
        name: subscriber.name || subscriber.username,
        thread: thread || null,
        messages,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const message = cleanText(body?.message);
      if (!message) return sendJson(res, 400, { success: false, message: "Digite uma mensagem para o suporte." });
      const rows = await sql`
        INSERT INTO support_threads ("subscriberUserId",status,"lastUserMessageAt","updatedAt")
        VALUES (${Number(subscriber.id)},'open',NOW(),NOW())
        ON CONFLICT ("subscriberUserId") DO UPDATE
        SET status='open',"lastUserMessageAt"=NOW(),"updatedAt"=NOW()
        RETURNING id
      `;
      const threadId = Number((rows[0] as any).id);
      await sql`
        INSERT INTO support_messages ("threadId","senderUserId","senderRole",message)
        VALUES (${threadId},${user.id},'user',${message})
      `;
      return sendJson(res, 201, { success: true, threadId });
    }

    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  } catch (error: any) {
    console.error("[support-chat]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: error instanceof Error ? error.message : "Erro no suporte.",
    });
  }
}
