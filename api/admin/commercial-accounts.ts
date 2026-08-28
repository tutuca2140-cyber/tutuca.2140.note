import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../auth/_shared.js";

neonConfig.webSocketConstructor = WebSocket;

const PLAN_CONFIG = {
  basic: { label: "Basic", limit: 1, priceCents: 2990 },
  plus: { label: "Plus", limit: 3, priceCents: 4990 },
} as const;

type PlanId = keyof typeof PLAN_CONFIG;

function isPlan(value: unknown): value is PlanId {
  return value === "basic" || value === "plus";
}

function databaseName(username: string, position: number) {
  return position === 1
    ? `Principal - ${username}`
    : `Principal - ${username} #${position}`;
}

async function ensureTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS commercial_subscriptions (
      id bigserial PRIMARY KEY,
      "userId" integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan varchar(20) NOT NULL,
      "priceCents" integer NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending_payment',
      source varchar(40) NOT NULL DEFAULT 'commercial_signup',
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "updatedAt" timestamptz NOT NULL DEFAULT NOW()
    )
  `;
}

async function getSuperAdmin(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.name, u.role, u."isActive"
      FROM local_sessions s
      JOIN users u ON u.id = s."userId"
     WHERE s.token = ${token}
       AND s."expiresAt" > NOW()
     LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive || user.role !== "super_admin") return null;
  return user;
}

async function listCommercialAccounts() {
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id,
      u.username,
      u.name,
      u.email,
      u."isActive",
      u."createdAt",
      cs.plan,
      cs."priceCents",
      cs.status,
      cs."updatedAt" AS "subscriptionUpdatedAt",
      COUNT(uda.id)::int AS "databaseCount",
      COALESCE(
        string_agg(d.name, ', ' ORDER BY uda."createdAt", d.id),
        ''
      ) AS "databaseNames"
    FROM users u
    JOIN commercial_subscriptions cs ON cs."userId" = u.id
    LEFT JOIN user_database_access uda ON uda."userId" = u.id
    LEFT JOIN databases d ON d.id = uda."databaseId"
    WHERE u."loginMethod" = 'commercial_signup'
    GROUP BY
      u.id, u.username, u.name, u.email, u."isActive", u."createdAt",
      cs.plan, cs."priceCents", cs.status, cs."updatedAt"
    ORDER BY
      CASE WHEN cs.status = 'pending_payment' THEN 0 ELSE 1 END,
      u."createdAt" DESC
  `;

  const accounts = rows.map((row: any) => ({
    ...row,
    databaseLimit: isPlan(row.plan) ? PLAN_CONFIG[row.plan].limit : 0,
  }));

  return {
    accounts,
    summary: {
      total: accounts.length,
      pending: accounts.filter((item: any) => item.status === "pending_payment").length,
      active: accounts.filter((item: any) => item.status === "active" || item.status === "paid").length,
      monthlyActiveCents: accounts
        .filter((item: any) => item.status === "active" || item.status === "paid")
        .reduce((sum: number, item: any) => sum + Number(item.priceCents || 0), 0),
    },
  };
}

async function approveCommercialAccount(userId: number, admin: any) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw Object.assign(new Error("Banco principal não configurado."), {
      statusCode: 503,
    });
  }

  const client = new Client(databaseUrl);
  let inTransaction = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    inTransaction = true;

    const targetResult = await client.query(
      `SELECT
         u.id,
         u.username,
         u.name,
         u.email,
         u."loginMethod",
         u."isActive",
         cs.plan,
         cs."priceCents",
         cs.status
       FROM users u
       JOIN commercial_subscriptions cs ON cs."userId" = u.id
       WHERE u.id = $1
       FOR UPDATE OF u, cs`,
      [userId]
    );
    const target = targetResult.rows[0] as any;

    if (!target || target.loginMethod !== "commercial_signup") {
      throw Object.assign(new Error("Conta comercial não encontrada."), {
        statusCode: 404,
      });
    }
    if (!isPlan(target.plan)) {
      throw Object.assign(new Error("Plano comercial inválido para esta conta."), {
        statusCode: 409,
      });
    }

    const config = PLAN_CONFIG[target.plan];
    const username = String(target.username || target.name || `usuario-${target.id}`).trim();

    const existingAccess = await client.query(
      `SELECT uda.id, uda."databaseId", uda."isActive", d.name
         FROM user_database_access uda
         JOIN databases d ON d.id = uda."databaseId"
        WHERE uda."userId" = $1
        ORDER BY uda."createdAt", uda.id`,
      [userId]
    );

    if (existingAccess.rows.length > config.limit) {
      throw Object.assign(
        new Error(
          `Esta conta já possui ${existingAccess.rows.length} bancos, acima do limite do plano ${config.label}. Corrija os vínculos antes de aprovar.`
        ),
        { statusCode: 409 }
      );
    }

    const createdDatabases: Array<{ id: number; name: string }> = [];
    for (let position = existingAccess.rows.length + 1; position <= config.limit; position++) {
      const name = databaseName(username, position);
      const collision = await client.query(
        `SELECT id FROM databases WHERE lower(name) = lower($1) LIMIT 1`,
        [name]
      );
      if (collision.rows[0]) {
        throw Object.assign(
          new Error(
            `Já existe um banco chamado “${name}”. Renomeie esse banco antes de aprovar esta conta para preservar a criação automática.`
          ),
          { statusCode: 409 }
        );
      }

      const created = await client.query(
        `INSERT INTO databases
          (name, description, type, "isActive", "createdBy", "createdAt", "updatedAt")
         VALUES ($1, $2, 'novo', false, $3, NOW(), NOW())
         RETURNING id, name`,
        [
          name,
          `Banco criado automaticamente pelo plano ${config.label} do usuário ${username}.`,
          userId,
        ]
      );
      const database = created.rows[0] as any;
      const shouldBeActive =
        existingAccess.rows.length === 0 && createdDatabases.length === 0;
      await client.query(
        `INSERT INTO user_database_access
          ("userId", "databaseId", "isActive", "createdAt")
         VALUES ($1, $2, $3, NOW())`,
        [userId, database.id, shouldBeActive]
      );
      createdDatabases.push({ id: Number(database.id), name: database.name });
    }

    const allAccess = await client.query(
      `SELECT uda.id, uda."databaseId", uda."isActive", d.name
         FROM user_database_access uda
         JOIN databases d ON d.id = uda."databaseId"
        WHERE uda."userId" = $1
        ORDER BY uda."createdAt", uda.id`,
      [userId]
    );

    if (allAccess.rows.length !== config.limit) {
      throw Object.assign(
        new Error(
          `Não foi possível provisionar os ${config.limit} bancos previstos pelo plano ${config.label}.`
        ),
        { statusCode: 500 }
      );
    }

    if (!allAccess.rows.some((row: any) => row.isActive)) {
      await client.query(
        `UPDATE user_database_access
            SET "isActive" = true
          WHERE id = $1`,
        [allAccess.rows[0].id]
      );
    }

    await client.query(
      `UPDATE users
          SET "isActive" = true,
              "failedLoginAttempts" = 0,
              "updatedAt" = NOW()
        WHERE id = $1`,
      [userId]
    );
    await client.query(
      `UPDATE commercial_subscriptions
          SET status = 'active', "updatedAt" = NOW()
        WHERE "userId" = $1`,
      [userId]
    );

    await client.query(
      `INSERT INTO "auditLogs"
        ("userId", username, action, entity, "entityId", details, status, "createdAt")
       VALUES ($1, $2, 'approve_commercial_account', 'users', $3, $4, 'success', NOW())`,
      [
        admin.id,
        admin.username || admin.email || "Super Admin",
        userId,
        JSON.stringify({
          plan: target.plan,
          databaseLimit: config.limit,
          createdDatabases,
          databaseNames: allAccess.rows.map((row: any) => row.name),
        }),
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return {
      plan: target.plan,
      planLabel: config.label,
      databaseLimit: config.limit,
      createdDatabases,
      databases: allAccess.rows.map((row: any) => ({
        id: Number(row.databaseId),
        name: row.name,
      })),
    };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // mantém o erro original
      }
    }
    throw error;
  } finally {
    try {
      await client.end();
    } catch {
      // conexão já encerrada
    }
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, {
        success: false,
        message: "Método não permitido.",
      });
    }

    const admin = await getSuperAdmin(req);
    if (!admin) {
      return sendJson(res, 403, {
        success: false,
        message: "Área exclusiva do Super Administrador.",
      });
    }

    await ensureTables();

    if (req.method === "GET") {
      const data = await listCommercialAccounts();
      return sendJson(res, 200, { success: true, ...data });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action ?? "approve");
    const userId = Number(body?.userId);
    if (action !== "approve") {
      return sendJson(res, 400, {
        success: false,
        message: "Ação comercial não reconhecida.",
      });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return sendJson(res, 400, {
        success: false,
        message: "Usuário inválido.",
      });
    }

    const approval = await approveCommercialAccount(userId, admin);
    return sendJson(res, 200, {
      success: true,
      approval,
      message:
        approval.createdDatabases.length > 0
          ? `Conta aprovada. ${approval.createdDatabases.length} banco(s) criado(s) automaticamente pelo plano ${approval.planLabel}.`
          : `Conta aprovada. Os bancos previstos pelo plano ${approval.planLabel} já estavam provisionados.`,
    });
  } catch (error: any) {
    console.error("[admin/commercial-accounts]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação comercial.",
    });
  }
}
