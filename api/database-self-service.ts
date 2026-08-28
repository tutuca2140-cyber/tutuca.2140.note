import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import {
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

neonConfig.webSocketConstructor = WebSocket;

const RECOVERY_HOURS = 48;
const MEMORY_TABLES = [
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

const DELETE_ORDER = [
  "cash_flow",
  "payments",
  "loan_interest_history",
  "vehicleFinancings",
  "vehicle_sales",
  "loans",
  "vehicles",
  "products",
  "clients",
  "agents",
] as const;

type SessionUser = {
  id: number;
  username: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  dashboardOnly: boolean;
};

type SnapshotPayload = Record<string, Array<Record<string, unknown>>>;

const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

async function ensureBackupTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS database_memory_backups (
      id bigserial PRIMARY KEY,
      "databaseId" integer NOT NULL,
      "userId" integer NOT NULL,
      payload jsonb NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'active',
      "createdAt" timestamptz NOT NULL DEFAULT NOW(),
      "expiresAt" timestamptz NOT NULL,
      "restoredAt" timestamptz
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS database_memory_backups_database_idx
      ON database_memory_backups ("databaseId", "createdAt" DESC)
  `);
  await client.query(
    `DELETE FROM database_memory_backups WHERE "expiresAt" <= NOW()`
  );
}

async function getSessionUser(client: Client, req: any): Promise<SessionUser | null> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const result = await client.query(
    `SELECT u.id, u.username, u.email, u.role, u."isActive", u."dashboardOnly"
       FROM local_sessions s
       JOIN users u ON u.id = s."userId"
      WHERE s.token = $1 AND s."expiresAt" > NOW()
      LIMIT 1`,
    [token]
  );
  const user = result.rows[0] as SessionUser | undefined;
  if (!user?.isActive) return null;
  return user;
}

async function assertDatabaseAccess(client: Client, user: SessionUser, databaseId: number) {
  const database = await client.query(
    `SELECT * FROM databases WHERE id = $1 LIMIT 1`,
    [databaseId]
  );
  if (!database.rows[0]) {
    throw Object.assign(new Error("Banco de dados não encontrado."), { statusCode: 404 });
  }

  if (user.role === "super_admin") return database.rows[0];

  const access = await client.query(
    `SELECT id FROM user_database_access WHERE "userId" = $1 AND "databaseId" = $2 LIMIT 1`,
    [user.id, databaseId]
  );
  if (!access.rows[0]) {
    throw Object.assign(new Error("Você só pode administrar um banco vinculado à sua conta."), {
      statusCode: 403,
    });
  }
  return database.rows[0];
}

async function deleteOperationalMemory(client: Client, databaseId: number) {
  for (const table of DELETE_ORDER) {
    await client.query(
      `DELETE FROM ${quoteIdent(table)} WHERE "databaseId" = $1`,
      [databaseId]
    );
  }
}

async function readSnapshot(client: Client, databaseId: number): Promise<SnapshotPayload> {
  const payload: SnapshotPayload = {};
  for (const table of MEMORY_TABLES) {
    const result = await client.query(
      `SELECT * FROM ${quoteIdent(table)} WHERE "databaseId" = $1 ORDER BY id`,
      [databaseId]
    );
    payload[table] = result.rows as Array<Record<string, unknown>>;
  }
  return payload;
}

async function insertSnapshotRow(
  client: Client,
  table: string,
  row: Record<string, unknown>
) {
  const entries = Object.entries(row);
  if (!entries.length) return;
  const columns = entries.map(([key]) => quoteIdent(key)).join(", ");
  const values = entries.map(([, value]) => value);
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(
    `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${placeholders})`,
    values
  );
}

async function restoreSnapshot(client: Client, payload: SnapshotPayload) {
  for (const table of MEMORY_TABLES) {
    for (const row of payload[table] ?? []) {
      await insertSnapshotRow(client, table, row);
    }
  }
}

async function writeAudit(
  client: Client,
  user: SessionUser,
  action: string,
  databaseId: number | null,
  details: Record<string, unknown>
) {
  await client.query(
    `INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", "databaseId", details, status)
     VALUES ($1, $2, $3, 'databases', $4, $4, $5, 'success')`,
    [
      user.id,
      user.username || user.email || "Usuário",
      action,
      databaseId,
      JSON.stringify(details),
    ]
  );
}

async function getRecoveryStatus(client: Client, databaseId: number) {
  const result = await client.query(
    `SELECT id, status, "createdAt", "expiresAt", "restoredAt"
       FROM database_memory_backups
      WHERE "databaseId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 1`,
    [databaseId]
  );
  const backup = result.rows[0];
  const active =
    backup && backup.status === "active" && new Date(backup.expiresAt).getTime() > Date.now();
  return {
    canRestore: Boolean(active),
    canClearAgain: !backup || new Date(backup.createdAt).getTime() + RECOVERY_HOURS * 60 * 60 * 1000 <= Date.now(),
    createdAt: backup?.createdAt ?? null,
    recoveryUntil: active ? backup.expiresAt : null,
    status: backup?.status ?? null,
  };
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
    const user = await getSessionUser(client, req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }
    if (user.dashboardOnly && user.role !== "super_admin") {
      return sendJson(res, 403, {
        success: false,
        message: "Este usuário possui acesso somente ao dashboard.",
      });
    }

    await ensureBackupTable(client);
    const body = await readJsonBody(req);
    const action = String(body?.action ?? "").trim();
    const databaseId = Number(body?.databaseId);
    if (!Number.isInteger(databaseId) || databaseId <= 0) {
      return sendJson(res, 400, { success: false, message: "Banco de dados inválido." });
    }

    const database = await assertDatabaseAccess(client, user, databaseId);

    if (action === "status") {
      const recovery = await getRecoveryStatus(client, databaseId);
      const otherAccess = await client.query(
        `SELECT COUNT(*)::int AS count FROM user_database_access WHERE "databaseId" = $1 AND "userId" <> $2`,
        [databaseId, user.id]
      );
      return sendJson(res, 200, {
        success: true,
        database,
        recovery,
        sharedWithOtherUsers: Number(otherAccess.rows[0]?.count || 0) > 0,
      });
    }

    if (action === "update") {
      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      if (!name || name.length > 255) {
        return sendJson(res, 400, {
          success: false,
          message: "Informe um nome válido com até 255 caracteres.",
        });
      }
      const result = await client.query(
        `UPDATE databases SET name = $1, description = $2, "updatedAt" = NOW() WHERE id = $3 RETURNING *`,
        [name, description || null, databaseId]
      );
      await writeAudit(client, user, "self_update_database", databaseId, {
        previousName: database.name,
        name,
      });
      return sendJson(res, 200, { success: true, database: result.rows[0] });
    }

    if (action === "clear") {
      const confirmation = String(body?.confirmation ?? "").trim().toUpperCase();
      if (confirmation !== "LIMPAR") {
        return sendJson(res, 400, {
          success: false,
          message: "Digite LIMPAR para confirmar a redefinição da memória.",
        });
      }

      const recovery = await getRecoveryStatus(client, databaseId);
      if (!recovery.canClearAgain) {
        return sendJson(res, 429, {
          success: false,
          message: "A memória deste banco só pode ser redefinida novamente após 48 horas.",
          recovery,
        });
      }

      await client.query("BEGIN");
      try {
        const payload = await readSnapshot(client, databaseId);
        const expiresAt = new Date(Date.now() + RECOVERY_HOURS * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO database_memory_backups
            ("databaseId", "userId", payload, status, "createdAt", "expiresAt")
           VALUES ($1, $2, $3::jsonb, 'active', NOW(), $4)`,
          [databaseId, user.id, JSON.stringify(payload), expiresAt]
        );
        await deleteOperationalMemory(client, databaseId);
        await client.query(`UPDATE databases SET "updatedAt" = NOW() WHERE id = $1`, [databaseId]);
        await writeAudit(client, user, "clear_database_memory", databaseId, {
          recoveryHours: RECOVERY_HOURS,
          recoveryUntil: expiresAt.toISOString(),
        });
        await client.query("COMMIT");
        return sendJson(res, 200, {
          success: true,
          message: "Memória limpa. A cópia de segurança pode ser restaurada por até 48 horas.",
          recoveryUntil: expiresAt,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    if (action === "restore") {
      const backup = await client.query(
        `SELECT id, payload, "expiresAt"
           FROM database_memory_backups
          WHERE "databaseId" = $1 AND status = 'active' AND "expiresAt" > NOW()
          ORDER BY "createdAt" DESC
          LIMIT 1`,
        [databaseId]
      );
      if (!backup.rows[0]) {
        return sendJson(res, 410, {
          success: false,
          message: "Não existe uma memória recuperável dentro do prazo de 48 horas.",
        });
      }

      await client.query("BEGIN");
      try {
        await deleteOperationalMemory(client, databaseId);
        const payload = backup.rows[0].payload as SnapshotPayload;
        await restoreSnapshot(client, payload);
        await client.query(
          `UPDATE database_memory_backups SET status = 'restored', "restoredAt" = NOW() WHERE id = $1`,
          [backup.rows[0].id]
        );
        await client.query(`UPDATE databases SET "updatedAt" = NOW() WHERE id = $1`, [databaseId]);
        await writeAudit(client, user, "restore_database_memory", databaseId, {
          backupId: backup.rows[0].id,
        });
        await client.query("COMMIT");
        return sendJson(res, 200, {
          success: true,
          message: "Memória anterior restaurada com sucesso.",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    if (action === "delete") {
      const confirmation = String(body?.confirmation ?? "").trim();
      if (confirmation !== String(database.name)) {
        return sendJson(res, 400, {
          success: false,
          message: "Digite exatamente o nome do banco para confirmar a exclusão.",
        });
      }

      if (user.role !== "super_admin") {
        const otherAccess = await client.query(
          `SELECT COUNT(*)::int AS count FROM user_database_access WHERE "databaseId" = $1 AND "userId" <> $2`,
          [databaseId, user.id]
        );
        if (Number(otherAccess.rows[0]?.count || 0) > 0) {
          return sendJson(res, 409, {
            success: false,
            message: "Este banco está compartilhado com outro usuário. Somente o Super Admin pode excluí-lo.",
          });
        }
      }

      await client.query("BEGIN");
      try {
        await deleteOperationalMemory(client, databaseId);
        await client.query(`DELETE FROM user_database_access WHERE "databaseId" = $1`, [databaseId]);
        await client.query(`DELETE FROM database_memory_backups WHERE "databaseId" = $1`, [databaseId]);
        await client.query(`DELETE FROM "auditLogs" WHERE "databaseId" = $1`, [databaseId]);
        await client.query(`DELETE FROM databases WHERE id = $1`, [databaseId]);
        await writeAudit(client, user, "self_delete_database", null, {
          deletedDatabaseId: databaseId,
          deletedDatabaseName: database.name,
        });
        await client.query("COMMIT");
        return sendJson(res, 200, {
          success: true,
          message: "Banco de dados excluído definitivamente.",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return sendJson(res, 400, { success: false, message: "Ação não reconhecida." });
  } catch (error: any) {
    console.error("[database-self-service]", error);
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
