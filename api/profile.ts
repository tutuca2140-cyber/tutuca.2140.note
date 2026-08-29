import bcrypt from "bcrypt";
import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import {
  clearSessionCookie,
  ensureAuthUserColumns,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

neonConfig.webSocketConstructor = WebSocket;

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUsername(value: string) {
  return /^[A-Za-z0-9._-]{3,40}$/.test(value);
}

function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

function normalizeWhatsapp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function isValidWhatsapp(value: string) {
  const digits = normalizeWhatsapp(value);
  return digits.length === 11 && digits[2] === "9" && digits[0] !== "0";
}

function isFullName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function getViewer(client: Client, req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const result = await client.query(
    `SELECT
       u.id, u.username, u.name, u.email, u.whatsapp, u.role, u."loginMethod",
       u."accountOwnerId", u."passwordHash", u."isActive", u."createdAt",
       s.token AS "sessionToken"
     FROM local_sessions s
     JOIN users u ON u.id = s."userId"
     WHERE s.token = $1 AND s."expiresAt" > NOW()
     LIMIT 1`,
    [token]
  );
  const user = result.rows[0] as any;
  return user?.isActive ? user : null;
}

async function getProfile(client: Client, user: any) {
  let plan: string | null = null;
  let subscriptionStatus: string | null = null;
  let priceCents: number | null = null;

  const ownerId =
    user.loginMethod === "commercial_signup"
      ? Number(user.id)
      : user.loginMethod === "commercial_subuser" && Number(user.accountOwnerId) > 0
        ? Number(user.accountOwnerId)
        : null;

  if (ownerId) {
    const result = await client.query(
      `SELECT plan, status, "priceCents"
         FROM commercial_subscriptions
        WHERE "userId" = $1
        LIMIT 1`,
      [ownerId]
    );
    const subscription = result.rows[0] as any;
    if (subscription) {
      plan = String(subscription.plan || "") || null;
      subscriptionStatus = String(subscription.status || "") || null;
      priceCents = Number(subscription.priceCents || 0);
    }
  }

  return {
    id: Number(user.id),
    name: String(user.name || ""),
    username: String(user.username || ""),
    email: String(user.email || ""),
    whatsapp: String(user.whatsapp || ""),
    role: String(user.role || "user"),
    loginMethod: String(user.loginMethod || "local"),
    createdAt: user.createdAt ?? null,
    commercial: ownerId !== null,
    commercialOwner: user.loginMethod === "commercial_signup",
    editable: user.loginMethod === "commercial_signup",
    canDeleteAccount: user.loginMethod === "commercial_signup",
    plan,
    subscriptionStatus,
    priceCents,
  };
}

async function updateProfile(client: Client, req: any, res: any, user: any) {
  if (user.loginMethod !== "commercial_signup") {
    return sendJson(res, 403, {
      success: false,
      message: "Esta conta é administrada pelo responsável que a criou e não pode alterar seus dados por esta área.",
    });
  }

  const body = await readJsonBody(req);
  const name = String(body?.name ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const whatsapp = normalizeWhatsapp(String(body?.whatsapp ?? ""));
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!isFullName(name) || name.length > 200) {
    return sendJson(res, 400, {
      success: false,
      message: "Informe nome e sobrenome completos.",
    });
  }
  if (!isValidUsername(username)) {
    return sendJson(res, 400, {
      success: false,
      message: "O nome de usuário deve ter de 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.",
    });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, { success: false, message: "Informe um e-mail válido." });
  }
  if (!isValidWhatsapp(whatsapp)) {
    return sendJson(res, 400, {
      success: false,
      message: "Informe um WhatsApp brasileiro válido com DDD e celular iniciado por 9.",
    });
  }
  if (newPassword && !isValidPassword(newPassword)) {
    return sendJson(res, 400, {
      success: false,
      message: "A nova senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
    });
  }

  const changingSensitiveData =
    username.toLowerCase() !== String(user.username || "").toLowerCase() ||
    email.toLowerCase() !== String(user.email || "").toLowerCase() ||
    Boolean(newPassword);

  if (changingSensitiveData) {
    if (!currentPassword || !user.passwordHash) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe sua senha atual para alterar usuário, e-mail ou senha.",
      });
    }
    const passwordOk = await bcrypt.compare(currentPassword, String(user.passwordHash));
    if (!passwordOk) {
      return sendJson(res, 401, { success: false, message: "Senha atual incorreta." });
    }
  }

  const collision = await client.query(
    `SELECT id, username, email
       FROM users
      WHERE id <> $1
        AND (lower(username) = lower($2) OR lower(email) = lower($3))
      LIMIT 1`,
    [user.id, username, email]
  );
  if (collision.rows[0]) {
    const sameUsername =
      String(collision.rows[0].username || "").toLowerCase() === username.toLowerCase();
    return sendJson(res, 409, {
      success: false,
      message: sameUsername ? "Este nome de usuário já está em uso." : "Este e-mail já está cadastrado.",
    });
  }

  let passwordHash = String(user.passwordHash || "");
  if (newPassword) passwordHash = await bcrypt.hash(newPassword, 12);

  await client.query(
    `UPDATE users
        SET name = $1,
            username = $2,
            email = $3,
            whatsapp = $4,
            "passwordHash" = $5,
            "failedLoginAttempts" = 0,
            "updatedAt" = NOW()
      WHERE id = $6`,
    [name, username, email, whatsapp, passwordHash, user.id]
  );

  if (newPassword) {
    await client.query(
      `DELETE FROM local_sessions WHERE "userId" = $1 AND token <> $2`,
      [user.id, user.sessionToken]
    );
    await client.query(
      `UPDATE password_reset_tokens SET "usedAt" = NOW()
        WHERE "userId" = $1 AND "usedAt" IS NULL`,
      [user.id]
    );
  }

  await client.query(
    `INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
     VALUES ($1, $2, 'update_own_profile', 'users', $1, $3, 'success', NOW())`,
    [
      user.id,
      username,
      JSON.stringify({
        nameChanged: name !== String(user.name || ""),
        usernameChanged: username !== String(user.username || ""),
        emailChanged: email !== String(user.email || ""),
        whatsappChanged: whatsapp !== normalizeWhatsapp(String(user.whatsapp || "")),
        passwordChanged: Boolean(newPassword),
      }),
    ]
  );

  const refreshed = await client.query(
    `SELECT id, username, name, email, whatsapp, role, "loginMethod", "accountOwnerId", "createdAt"
       FROM users WHERE id = $1 LIMIT 1`,
    [user.id]
  );

  return sendJson(res, 200, {
    success: true,
    profile: await getProfile(client, refreshed.rows[0]),
    message: "Perfil atualizado com sucesso.",
  });
}

async function deleteOwnedDatabase(client: Client, databaseId: number) {
  for (const table of DELETE_ORDER) {
    await client.query(`DELETE FROM ${quoteIdent(table)} WHERE "databaseId" = $1`, [databaseId]);
  }
  await client.query(`DELETE FROM user_database_access WHERE "databaseId" = $1`, [databaseId]);
  await client.query(`DELETE FROM database_memory_backups WHERE "databaseId" = $1`, [databaseId]);
  await client.query(`DELETE FROM "auditLogs" WHERE "databaseId" = $1`, [databaseId]);
  await client.query(`DELETE FROM databases WHERE id = $1`, [databaseId]);
}

async function deleteCommercialAccount(client: Client, req: any, res: any, user: any) {
  if (user.loginMethod !== "commercial_signup") {
    return sendJson(res, 403, {
      success: false,
      message: "Somente o contratante principal pode excluir a própria conta comercial.",
    });
  }

  const body = await readJsonBody(req);
  const confirmation = String(body?.confirmation ?? "").trim().toUpperCase();
  const currentPassword = String(body?.currentPassword ?? "");

  if (confirmation !== "EXCLUIR CONTA") {
    return sendJson(res, 400, {
      success: false,
      message: "Digite EXCLUIR CONTA para confirmar a exclusão definitiva.",
    });
  }
  if (!currentPassword || !user.passwordHash) {
    return sendJson(res, 400, { success: false, message: "Informe sua senha atual." });
  }
  const passwordOk = await bcrypt.compare(currentPassword, String(user.passwordHash));
  if (!passwordOk) {
    return sendJson(res, 401, { success: false, message: "Senha atual incorreta." });
  }

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

  await client.query("BEGIN");
  try {
    const databases = await client.query(
      `SELECT id, name FROM databases WHERE "createdBy" = $1 ORDER BY id`,
      [user.id]
    );
    const members = await client.query(
      `SELECT id FROM users
        WHERE "loginMethod" = 'commercial_subuser' AND "accountOwnerId" = $1`,
      [user.id]
    );
    const memberIds = members.rows.map((row: any) => Number(row.id));

    await client.query(
      `INSERT INTO "auditLogs"
        ("userId", username, action, entity, "entityId", details, status, "createdAt")
       VALUES ($1, $2, 'delete_own_commercial_account', 'users', $1, $3, 'success', NOW())`,
      [
        user.id,
        user.username || user.email || "Contratante",
        JSON.stringify({
          ownedDatabaseIds: databases.rows.map((row: any) => Number(row.id)),
          additionalUsers: memberIds.length,
          requestedByOwner: true,
        }),
      ]
    );

    for (const database of databases.rows as any[]) {
      await deleteOwnedDatabase(client, Number(database.id));
    }

    for (const memberId of memberIds) {
      await client.query(`DELETE FROM local_sessions WHERE "userId" = $1`, [memberId]);
      await client.query(`DELETE FROM password_reset_tokens WHERE "userId" = $1`, [memberId]);
      await client.query(`DELETE FROM user_database_access WHERE "userId" = $1`, [memberId]);
      await client.query(
        `UPDATE users
            SET username = 'deleted-member-' || id || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
                email = NULL,
                name = 'Conta excluída',
                whatsapp = NULL,
                "passwordHash" = NULL,
                "loginMethod" = 'deleted_account',
                "accountOwnerId" = NULL,
                "canView" = false,
                "canInsert" = false,
                "canEdit" = false,
                "canDelete" = false,
                "canGenerateReports" = false,
                "canAccessSettings" = false,
                "canManageUsers" = false,
                "canManageDatabases" = false,
                "canDeleteCashFlow" = false,
                "dashboardOnly" = true,
                "isActive" = false,
                "updatedAt" = NOW()
          WHERE id = $1`,
        [memberId]
      );
    }

    await client.query(`DELETE FROM local_sessions WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM password_reset_tokens WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM user_database_access WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM commercial_subscriptions WHERE "userId" = $1`, [user.id]);

    await client.query(
      `UPDATE users
          SET username = 'deleted-account-' || id || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
              email = NULL,
              name = 'Conta excluída',
              whatsapp = NULL,
              "passwordHash" = NULL,
              "loginMethod" = 'deleted_account',
              "accountOwnerId" = NULL,
              "canView" = false,
              "canInsert" = false,
              "canEdit" = false,
              "canDelete" = false,
              "canGenerateReports" = false,
              "canAccessSettings" = false,
              "canManageUsers" = false,
              "canManageDatabases" = false,
              "canDeleteCashFlow" = false,
              "dashboardOnly" = true,
              "isActive" = false,
              "updatedAt" = NOW()
        WHERE id = $1`,
      [user.id]
    );

    await client.query("COMMIT");
    clearSessionCookie(res);
    return sendJson(res, 200, {
      success: true,
      message: "Sua conta e os dados pertencentes a ela foram excluídos do Note Note.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  if (!["GET", "POST", "DELETE"].includes(String(req.method))) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return sendJson(res, 503, { success: false, message: "Banco principal não configurado." });
  }

  const client = new Client(databaseUrl);
  try {
    await ensureAuthUserColumns();
    await client.connect();
    const user = await getViewer(client, req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }

    if (req.method === "GET") {
      return sendJson(res, 200, {
        success: true,
        profile: await getProfile(client, user),
      });
    }
    if (req.method === "POST") {
      return await updateProfile(client, req, res, user);
    }
    return await deleteCommercialAccount(client, req, res, user);
  } catch (error: any) {
    console.error("[profile]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: error instanceof Error ? error.message : "Não foi possível concluir a operação no perfil.",
    });
  } finally {
    try {
      await client.end();
    } catch {
      // conexão já encerrada
    }
  }
}
