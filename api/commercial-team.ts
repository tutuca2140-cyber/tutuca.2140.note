import bcrypt from "bcrypt";
import {
  ensureAuthUserColumns,
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

const TEAM_LIMIT = 5;

type PermissionKey =
  | "canView"
  | "canInsert"
  | "canEdit"
  | "canDelete"
  | "canGenerateReports"
  | "canManageUsers"
  | "canManageDatabases"
  | "canDeleteCashFlow";

const permissionKeys: PermissionKey[] = [
  "canView",
  "canInsert",
  "canEdit",
  "canDelete",
  "canGenerateReports",
  "canManageUsers",
  "canManageDatabases",
  "canDeleteCashFlow",
];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUsername(value: string) {
  return /^[A-Za-z0-9._-]{3,40}$/.test(value);
}

function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

async function getViewer() {
  const sql = getSql();
  return { sql };
}

async function getSessionUser(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id, u.username, u.email, u.name, u.role, u."loginMethod", u."isActive",
      u."accountOwnerId", u."canView", u."canInsert", u."canEdit", u."canDelete",
      u."canGenerateReports", u."canManageUsers", u."canManageDatabases", u."canDeleteCashFlow"
    FROM local_sessions s
    JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token}
      AND s."expiresAt" > NOW()
    LIMIT 1
  `;
  const user = rows[0] as any;
  return user?.isActive ? user : null;
}

async function getAccountContext(user: any) {
  const sql = getSql();
  const isOwner = user?.loginMethod === "commercial_signup";
  const isSubuser = user?.loginMethod === "commercial_subuser" && Number(user?.accountOwnerId) > 0;
  if (!isOwner && !isSubuser) return null;
  const ownerId = isOwner ? Number(user.id) : Number(user.accountOwnerId);
  const subscriptions = await sql`
    SELECT plan, status, "priceCents"
    FROM commercial_subscriptions
    WHERE "userId" = ${ownerId}
    LIMIT 1
  `;
  const subscription = subscriptions[0] as any;
  if (!subscription) return null;
  return {
    ownerId,
    isOwner,
    plan: String(subscription.plan),
    status: String(subscription.status),
    active: subscription.status === "active" || subscription.status === "paid",
  };
}

async function getOwnerDatabases(ownerId: number) {
  const sql = getSql();
  return await sql`
    SELECT d.id, d.name, d.description
    FROM user_database_access uda
    JOIN databases d ON d.id = uda."databaseId"
    WHERE uda."userId" = ${ownerId}
      AND d."createdBy" = ${ownerId}
    ORDER BY uda."createdAt", d.id
  `;
}

function requestedPermissions(body: any) {
  const source = body?.permissions ?? {};
  return Object.fromEntries(
    permissionKeys.map(key => [key, Boolean(source[key])])
  ) as Record<PermissionKey, boolean>;
}

function assertDelegationAllowed(viewer: any, isOwner: boolean, permissions: Record<PermissionKey, boolean>) {
  if (isOwner) return;
  for (const key of permissionKeys) {
    if (permissions[key] && !Boolean(viewer[key])) {
      throw Object.assign(
        new Error(`Você não pode conceder a permissão ${key} porque ela não está liberada para sua conta.`),
        { statusCode: 403 }
      );
    }
  }
}

async function validateDatabaseIds(ownerId: number, databaseIds: number[]) {
  const sql = getSql();
  const uniqueIds = Array.from(new Set(databaseIds.filter(id => Number.isInteger(id) && id > 0)));
  if (uniqueIds.length > 3) {
    throw Object.assign(new Error("Um usuário pode receber no máximo os três bancos do plano Plus."), {
      statusCode: 400,
    });
  }
  const ownerDatabases = await getOwnerDatabases(ownerId);
  const allowed = new Set(ownerDatabases.map((row: any) => Number(row.id)));
  if (uniqueIds.some(id => !allowed.has(id))) {
    throw Object.assign(new Error("Só é possível liberar bancos pertencentes ao contratante."), {
      statusCode: 403,
    });
  }
  return uniqueIds;
}

async function listTeam(ownerId: number) {
  const sql = getSql();
  const members = await sql`
    SELECT
      u.id, u.username, u.name, u.email, u."isActive", u."createdAt",
      u."canView", u."canInsert", u."canEdit", u."canDelete", u."canGenerateReports",
      u."canManageUsers", u."canManageDatabases", u."canDeleteCashFlow"
    FROM users u
    WHERE u."loginMethod" = 'commercial_subuser'
      AND u."accountOwnerId" = ${ownerId}
    ORDER BY u."createdAt" DESC
  `;
  const accesses = await sql`
    SELECT uda."userId", uda."databaseId", d.name
    FROM user_database_access uda
    JOIN databases d ON d.id = uda."databaseId"
    JOIN users u ON u.id = uda."userId"
    WHERE u."loginMethod" = 'commercial_subuser'
      AND u."accountOwnerId" = ${ownerId}
    ORDER BY uda."createdAt", uda.id
  `;
  const byUser = new Map<number, Array<{ id: number; name: string }>>();
  for (const row of accesses as any[]) {
    const userId = Number(row.userId);
    const current = byUser.get(userId) ?? [];
    current.push({ id: Number(row.databaseId), name: String(row.name) });
    byUser.set(userId, current);
  }
  return members.map((member: any) => ({
    ...member,
    databases: byUser.get(Number(member.id)) ?? [],
  }));
}

async function writeAudit(viewer: any, action: string, entityId: number | null, details: any) {
  const sql = getSql();
  await sql`
    INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
    VALUES (
      ${viewer.id},
      ${viewer.username || viewer.email || "Usuário"},
      ${action},
      'commercial_team',
      ${entityId},
      ${JSON.stringify(details)},
      'success',
      NOW()
    )
  `;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    await ensureAuthUserColumns();
    await getViewer();
    const viewer = await getSessionUser(req);
    if (!viewer) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }
    const account = await getAccountContext(viewer);
    if (!account) {
      return sendJson(res, 403, {
        success: false,
        message: "Esta área é exclusiva para contas comerciais do Note Note.",
      });
    }

    const canManageTeam = Boolean(
      account.active &&
        account.plan === "plus" &&
        (account.isOwner || viewer.canManageUsers)
    );

    if (req.method === "GET") {
      const [members, databases] = await Promise.all([
        listTeam(account.ownerId),
        getOwnerDatabases(account.ownerId),
      ]);
      return sendJson(res, 200, {
        success: true,
        plan: account.plan,
        status: account.status,
        isOwner: account.isOwner,
        canManageTeam,
        teamLimit: account.plan === "plus" ? TEAM_LIMIT : 0,
        members,
        databases,
        viewerPermissions: {
          canView: Boolean(viewer.canView),
          canInsert: Boolean(viewer.canInsert),
          canEdit: Boolean(viewer.canEdit),
          canDelete: Boolean(viewer.canDelete),
          canGenerateReports: Boolean(viewer.canGenerateReports),
          canManageUsers: Boolean(account.isOwner || viewer.canManageUsers),
          canManageDatabases: Boolean(account.isOwner || viewer.canManageDatabases),
          canDeleteCashFlow: Boolean(account.isOwner || viewer.canDeleteCashFlow),
        },
      });
    }

    if (!canManageTeam) {
      return sendJson(res, 403, {
        success: false,
        message:
          account.plan === "basic"
            ? "O plano Basic permite somente o próprio contratante. Usuários adicionais estão disponíveis no Plus."
            : "O contratante não liberou a permissão de administrar usuários para esta conta.",
      });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action ?? "create");
    const sql = getSql();

    if (action === "create") {
      const currentMembers = await listTeam(account.ownerId);
      if (currentMembers.length >= TEAM_LIMIT) {
        return sendJson(res, 409, {
          success: false,
          message: `O plano Plus permite cadastrar até ${TEAM_LIMIT} usuários adicionais.`,
        });
      }

      const username = String(body?.username ?? "").trim();
      const name = String(body?.name ?? "").trim();
      const email = String(body?.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      const permissions = requestedPermissions(body);
      assertDelegationAllowed(viewer, account.isOwner, permissions);
      const databaseIds = await validateDatabaseIds(
        account.ownerId,
        Array.isArray(body?.databaseIds) ? body.databaseIds.map(Number) : []
      );

      if (!name || name.length > 200 || !isValidUsername(username) || !isValidEmail(email)) {
        return sendJson(res, 400, {
          success: false,
          message: "Informe nome, usuário e e-mail válidos.",
        });
      }
      if (!isValidPassword(password)) {
        return sendJson(res, 400, {
          success: false,
          message: "A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
        });
      }

      const existing = await sql`
        SELECT id FROM users
        WHERE lower(username) = lower(${username}) OR lower(email) = lower(${email})
        LIMIT 1
      `;
      if (existing[0]) {
        return sendJson(res, 409, {
          success: false,
          message: "Nome de usuário ou e-mail já cadastrado.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const created = await sql`
        INSERT INTO users (
          username, "passwordHash", name, email, "loginMethod", "accountOwnerId", role,
          "canView", "canInsert", "canEdit", "canDelete", "canGenerateReports",
          "canAccessSettings", "dashboardOnly", "canManageUsers", "canManageDatabases",
          "canDeleteCashFlow", "failedLoginAttempts", "isActive", "emailVerified",
          "createdAt", "updatedAt", "lastSignedIn"
        ) VALUES (
          ${username}, ${passwordHash}, ${name}, ${email}, 'commercial_subuser', ${account.ownerId}, 'user',
          ${permissions.canView}, ${permissions.canInsert}, ${permissions.canEdit}, ${permissions.canDelete},
          ${permissions.canGenerateReports}, false, false, ${permissions.canManageUsers},
          ${permissions.canManageDatabases}, ${permissions.canDeleteCashFlow}, 0, true, true,
          NOW(), NOW(), NOW()
        ) RETURNING id, username, name, email
      `;
      const member = created[0] as any;
      if (databaseIds.length) {
        for (let index = 0; index < databaseIds.length; index++) {
          await sql`
            INSERT INTO user_database_access ("userId", "databaseId", "isActive", "createdAt")
            VALUES (${member.id}, ${databaseIds[index]}, ${index === 0}, NOW())
          `;
        }
      }
      await writeAudit(viewer, "create_commercial_subuser", Number(member.id), {
        ownerId: account.ownerId,
        username,
        databaseIds,
        permissions,
      });
      return sendJson(res, 201, {
        success: true,
        message: "Usuário da conta criado com sucesso.",
      });
    }

    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return sendJson(res, 400, { success: false, message: "Usuário inválido." });
    }
    const targetRows = await sql`
      SELECT * FROM users
      WHERE id = ${userId}
        AND "loginMethod" = 'commercial_subuser'
        AND "accountOwnerId" = ${account.ownerId}
      LIMIT 1
    `;
    const target = targetRows[0] as any;
    if (!target) {
      return sendJson(res, 404, { success: false, message: "Usuário da conta não encontrado." });
    }

    if (action === "delete") {
      await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
      await sql`DELETE FROM user_database_access WHERE "userId" = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
      await writeAudit(viewer, "delete_commercial_subuser", userId, {
        ownerId: account.ownerId,
        username: target.username,
      });
      return sendJson(res, 200, { success: true, message: "Usuário removido da conta." });
    }

    if (action === "toggle") {
      const isActive = Boolean(body?.isActive);
      await sql`
        UPDATE users
        SET "isActive" = ${isActive}, "failedLoginAttempts" = 0, "updatedAt" = NOW()
        WHERE id = ${userId}
      `;
      if (!isActive) await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
      await writeAudit(viewer, "toggle_commercial_subuser", userId, { isActive });
      return sendJson(res, 200, {
        success: true,
        message: isActive ? "Usuário ativado." : "Usuário desativado.",
      });
    }

    if (action === "update") {
      const username = String(body?.username ?? target.username ?? "").trim();
      const name = String(body?.name ?? target.name ?? "").trim();
      const email = String(body?.email ?? target.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      const permissions = requestedPermissions(body);
      assertDelegationAllowed(viewer, account.isOwner, permissions);
      const databaseIds = await validateDatabaseIds(
        account.ownerId,
        Array.isArray(body?.databaseIds) ? body.databaseIds.map(Number) : []
      );

      if (!name || name.length > 200 || !isValidUsername(username) || !isValidEmail(email)) {
        return sendJson(res, 400, { success: false, message: "Informe nome, usuário e e-mail válidos." });
      }
      if (password && !isValidPassword(password)) {
        return sendJson(res, 400, {
          success: false,
          message: "A nova senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
        });
      }
      const collision = await sql`
        SELECT id FROM users
        WHERE id <> ${userId}
          AND (lower(username) = lower(${username}) OR lower(email) = lower(${email}))
        LIMIT 1
      `;
      if (collision[0]) {
        return sendJson(res, 409, { success: false, message: "Nome de usuário ou e-mail já cadastrado." });
      }

      if (password) {
        const passwordHash = await bcrypt.hash(password, 12);
        await sql`
          UPDATE users SET
            username = ${username}, name = ${name}, email = ${email}, "passwordHash" = ${passwordHash},
            "canView" = ${permissions.canView}, "canInsert" = ${permissions.canInsert},
            "canEdit" = ${permissions.canEdit}, "canDelete" = ${permissions.canDelete},
            "canGenerateReports" = ${permissions.canGenerateReports},
            "canManageUsers" = ${permissions.canManageUsers},
            "canManageDatabases" = ${permissions.canManageDatabases},
            "canDeleteCashFlow" = ${permissions.canDeleteCashFlow}, "updatedAt" = NOW()
          WHERE id = ${userId}
        `;
        await sql`DELETE FROM local_sessions WHERE "userId" = ${userId}`;
      } else {
        await sql`
          UPDATE users SET
            username = ${username}, name = ${name}, email = ${email},
            "canView" = ${permissions.canView}, "canInsert" = ${permissions.canInsert},
            "canEdit" = ${permissions.canEdit}, "canDelete" = ${permissions.canDelete},
            "canGenerateReports" = ${permissions.canGenerateReports},
            "canManageUsers" = ${permissions.canManageUsers},
            "canManageDatabases" = ${permissions.canManageDatabases},
            "canDeleteCashFlow" = ${permissions.canDeleteCashFlow}, "updatedAt" = NOW()
          WHERE id = ${userId}
        `;
      }
      await sql`DELETE FROM user_database_access WHERE "userId" = ${userId}`;
      for (let index = 0; index < databaseIds.length; index++) {
        await sql`
          INSERT INTO user_database_access ("userId", "databaseId", "isActive", "createdAt")
          VALUES (${userId}, ${databaseIds[index]}, ${index === 0}, NOW())
        `;
      }
      await writeAudit(viewer, "update_commercial_subuser", userId, {
        ownerId: account.ownerId,
        username,
        databaseIds,
        permissions,
      });
      return sendJson(res, 200, { success: true, message: "Usuário e permissões atualizados." });
    }

    return sendJson(res, 400, { success: false, message: "Ação não reconhecida." });
  } catch (error: any) {
    console.error("[commercial-team]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message: error instanceof Error ? error.message : "Não foi possível concluir a operação.",
    });
  }
}
