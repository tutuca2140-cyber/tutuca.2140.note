import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import {
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

neonConfig.webSocketConstructor = WebSocket;

type AdminUser = {
  id: number;
  username: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
};

type IdMap = Map<number, number>;

const DATABASE_TABLES = [
  "agents",
  "clients",
  "vehicles",
  "products",
  "loans",
  "vehicleFinancings",
  "vehicle_sales",
  "payments",
  "loan_interest_history",
  "cash_flow",
] as const;

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function getAuthenticatedAdmin(client: Client, req: any): Promise<AdminUser | null> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;

  const result = await client.query(
    `SELECT u.id, u.username, u.email, u.role, u."isActive"
       FROM local_sessions s
       JOIN users u ON u.id = s."userId"
      WHERE s.token = $1
        AND s."expiresAt" > NOW()
      LIMIT 1`,
    [token]
  );

  const user = result.rows[0] as AdminUser | undefined;
  if (!user?.isActive) return null;
  if (user.role !== "admin" && user.role !== "super_admin") return null;
  return user;
}

async function getAccessRows(client: Client, user: AdminUser) {
  if (user.role === "super_admin") return [] as Array<{ databaseId: number }>;
  const result = await client.query(
    `SELECT "databaseId" FROM user_database_access WHERE "userId" = $1 ORDER BY id`,
    [user.id]
  );
  return result.rows.map(row => ({ databaseId: Number(row.databaseId) }));
}

function canAccessDatabase(user: AdminUser, accessRows: Array<{ databaseId: number }>, databaseId: number) {
  if (user.role === "super_admin") return true;
  // Compatibilidade com administradores antigos sem vínculos explícitos.
  if (user.role === "admin" && accessRows.length === 0) return true;
  return accessRows.some(row => row.databaseId === databaseId);
}

function remapId(value: unknown, map: IdMap | undefined, required = false) {
  if (value === null || value === undefined) return value;
  if (!map) return value;
  const mapped = map.get(Number(value));
  if (mapped !== undefined) return mapped;
  if (required) throw new Error(`Não foi possível reconstruir um vínculo interno da cópia.`);
  return null;
}

async function insertRow(client: Client, table: string, row: Record<string, any>) {
  const entries = Object.entries(row).filter(([key]) => key !== "id");
  const columns = entries.map(([key]) => quoteIdent(key)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  const result = await client.query(
    `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${placeholders}) RETURNING id`,
    values
  );
  return Number(result.rows[0].id);
}

async function cloneTable(
  client: Client,
  table: string,
  sourceDatabaseId: number,
  targetDatabaseId: number,
  mappings: Record<string, { map?: IdMap; required?: boolean }> = {}
) {
  const source = await client.query(
    `SELECT * FROM ${quoteIdent(table)} WHERE "databaseId" = $1 ORDER BY id`,
    [sourceDatabaseId]
  );

  const idMap: IdMap = new Map();
  for (const sourceRow of source.rows as Array<Record<string, any>>) {
    const row = { ...sourceRow, databaseId: targetDatabaseId };
    for (const [column, config] of Object.entries(mappings)) {
      if (Object.prototype.hasOwnProperty.call(row, column)) {
        row[column] = remapId(row[column], config.map, Boolean(config.required));
      }
    }
    const newId = await insertRow(client, table, row);
    idMap.set(Number(sourceRow.id), newId);
  }

  return { map: idMap, count: source.rows.length };
}

async function writeAudit(
  client: Client,
  user: AdminUser,
  action: string,
  databaseId: number,
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO "auditLogs"
       ("userId", username, action, entity, "entityId", "databaseId", details, status)
     VALUES ($1, $2, $3, 'databases', $4, $4, $5, 'success')`,
    [
      user.id,
      user.username || user.email || "Administrador",
      action,
      databaseId,
      JSON.stringify(details),
    ]
  );
}

async function duplicateDatabase(
  client: Client,
  user: AdminUser,
  sourceDatabaseId: number,
  name: string,
  description?: string
) {
  const accessRows = await getAccessRows(client, user);
  if (!canAccessDatabase(user, accessRows, sourceDatabaseId)) {
    throw Object.assign(new Error("Você não tem acesso a este banco de dados."), { statusCode: 403 });
  }
  if (user.role === "admin" && accessRows.length >= 3) {
    throw Object.assign(
      new Error("Este administrador já está vinculado ao limite de três bancos. Ajuste os vínculos antes de duplicar."),
      { statusCode: 400 }
    );
  }

  const source = await client.query(`SELECT * FROM databases WHERE id = $1 LIMIT 1`, [sourceDatabaseId]);
  const sourceDatabase = source.rows[0];
  if (!sourceDatabase) {
    throw Object.assign(new Error("Banco de dados não encontrado."), { statusCode: 404 });
  }

  await client.query("BEGIN");
  try {
    const created = await client.query(
      `INSERT INTO databases (name, description, type, "isActive", "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, 'copia', false, $3, NOW(), NOW())
       RETURNING *`,
      [name, description ?? sourceDatabase.description ?? null, user.id]
    );
    const targetDatabase = created.rows[0];
    const targetDatabaseId = Number(targetDatabase.id);

    const agents = await cloneTable(client, "agents", sourceDatabaseId, targetDatabaseId);
    const clients = await cloneTable(client, "clients", sourceDatabaseId, targetDatabaseId, {
      indicatorAgentId: { map: agents.map },
    });
    const vehicles = await cloneTable(client, "vehicles", sourceDatabaseId, targetDatabaseId);
    const products = await cloneTable(client, "products", sourceDatabaseId, targetDatabaseId);
    const loans = await cloneTable(client, "loans", sourceDatabaseId, targetDatabaseId, {
      clientId: { map: clients.map, required: true },
      agentId: { map: agents.map },
    });
    const financings = await cloneTable(client, "vehicleFinancings", sourceDatabaseId, targetDatabaseId, {
      clientId: { map: clients.map, required: true },
      vehicleId: { map: vehicles.map },
      productId: { map: products.map },
      agentId: { map: agents.map },
    });
    const sales = await cloneTable(client, "vehicle_sales", sourceDatabaseId, targetDatabaseId, {
      clientId: { map: clients.map },
      vehicleId: { map: vehicles.map, required: true },
      agentId: { map: agents.map },
    });
    const payments = await cloneTable(client, "payments", sourceDatabaseId, targetDatabaseId, {
      loanId: { map: loans.map },
      vehicleFinancingId: { map: financings.map },
      agentId: { map: agents.map },
    });
    const interestHistory = await cloneTable(
      client,
      "loan_interest_history",
      sourceDatabaseId,
      targetDatabaseId,
      { loanId: { map: loans.map, required: true } }
    );
    const cashFlow = await cloneTable(client, "cash_flow", sourceDatabaseId, targetDatabaseId, {
      clientId: { map: clients.map },
      loanId: { map: loans.map },
      vehicleId: { map: vehicles.map },
      vehicleSaleId: { map: sales.map },
      paymentId: { map: payments.map },
      agentId: { map: agents.map },
    });

    if (user.role === "admin" && accessRows.length > 0) {
      await client.query(
        `INSERT INTO user_database_access ("userId", "databaseId", "isActive") VALUES ($1, $2, false)`,
        [user.id, targetDatabaseId]
      );
    }

    const counts = {
      agents: agents.count,
      clients: clients.count,
      vehicles: vehicles.count,
      products: products.count,
      loans: loans.count,
      financings: financings.count,
      sales: sales.count,
      payments: payments.count,
      interestHistory: interestHistory.count,
      cashFlow: cashFlow.count,
    };

    await writeAudit(client, user, "duplicate_database", targetDatabaseId, {
      sourceDatabaseId,
      sourceName: sourceDatabase.name,
      newName: name,
      counts,
    });

    await client.query("COMMIT");
    return { database: targetDatabase, counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return sendJson(res, 503, { success: false, message: "Banco principal não configurado." });
  }

  const client = new Client(databaseUrl);
  try {
    await client.connect();
    const user = await getAuthenticatedAdmin(client, req);
    if (!user) {
      return sendJson(res, 403, { success: false, message: "Acesso restrito a administradores." });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action ?? "").trim();
    const databaseId = Number(body?.databaseId);
    if (!Number.isInteger(databaseId) || databaseId <= 0) {
      return sendJson(res, 400, { success: false, message: "Banco de dados inválido." });
    }

    const accessRows = await getAccessRows(client, user);
    if (!canAccessDatabase(user, accessRows, databaseId)) {
      return sendJson(res, 403, { success: false, message: "Você não tem acesso a este banco de dados." });
    }

    if (action === "update") {
      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      if (!name || name.length > 255) {
        return sendJson(res, 400, { success: false, message: "Informe um nome válido com até 255 caracteres." });
      }

      const updated = await client.query(
        `UPDATE databases
            SET name = $1, description = $2, "updatedAt" = NOW()
          WHERE id = $3
          RETURNING *`,
        [name, description || null, databaseId]
      );
      if (!updated.rows[0]) {
        return sendJson(res, 404, { success: false, message: "Banco de dados não encontrado." });
      }
      await writeAudit(client, user, "update_database", databaseId, {
        name,
        description: description || null,
      });
      return sendJson(res, 200, { success: true, database: updated.rows[0] });
    }

    if (action === "duplicate") {
      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      if (!name || name.length > 255) {
        return sendJson(res, 400, { success: false, message: "Informe um nome válido para a cópia." });
      }
      const duplicated = await duplicateDatabase(client, user, databaseId, name, description || undefined);
      return sendJson(res, 200, { success: true, ...duplicated });
    }

    return sendJson(res, 400, { success: false, message: "Ação não reconhecida." });
  } catch (error: any) {
    console.error("[database-admin]", error);
    if (error?.code === "23505") {
      return sendJson(res, 409, {
        success: false,
        message: "Já existe um banco de dados com esse nome.",
      });
    }
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: error instanceof Error ? error.message : "Não foi possível concluir a operação.",
    });
  } finally {
    try {
      await client.end();
    } catch {
      // conexão já encerrada
    }
  }
}
