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
} from "../api/auth/_shared.js";

neonConfig.webSocketConstructor = WebSocket;

const ASAAS_API = "https://api.asaas.com/v3";

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

function getAsaasApiKey() {
  return String(process.env.ASAAS_API_KEY ?? "").trim();
}

async function deleteAsaasResource(path: string, label: string) {
  const apiKey = getAsaasApiKey();
  if (!apiKey) {
    throw Object.assign(new Error("A integração com o Asaas não está disponível neste momento. Tente novamente mais tarde."), { statusCode: 503 });
  }
  const response = await fetch(`${ASAAS_API}${path}`, {
    method: "DELETE",
    headers: { accept: "application/json", access_token: apiKey },
  });
  if (!response.ok && response.status !== 404) {
    const body = await response.json().catch(() => ({}));
    console.error("[profile-service/asaas-cancel]", { path, body });
    throw Object.assign(new Error(`Não foi possível cancelar ${label} no Asaas. Nenhuma alteração foi feita na sua conta.`), { statusCode: 502 });
  }
  return true;
}

async function getViewer(client: Client, req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const result = await client.query(
    `SELECT
       u.id, u.username, u.name, u.email, u.whatsapp, u.role, u."loginMethod",
       u."accountOwnerId", u."passwordHash", u."isActive", u."createdAt", u."supportId",
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

async function getSubscription(client: Client, user: any) {
  const ownerId =
    user.loginMethod === "commercial_signup"
      ? Number(user.id)
      : user.loginMethod === "commercial_subuser" && Number(user.accountOwnerId) > 0
        ? Number(user.accountOwnerId)
        : null;
  if (!ownerId) return null;

  const result = await client.query(
    `SELECT
       plan, status, "priceCents", provider, "billingMethod", "providerStatus",
       "providerSubscriptionId", "providerCheckoutId", "providerCustomerId",
       "lastPaymentId", "lastPaymentStatus", "lastWebhookAt", "trialEndsAt",
       "paidUntil", "pixExpiresAt", "updatedAt"
       FROM commercial_subscriptions
      WHERE "userId" = $1
      LIMIT 1`,
    [ownerId]
  );
  const row = result.rows[0] as any;
  if (!row) return null;

  const now = Date.now();
  const trialEndsAtMs = row.trialEndsAt ? new Date(row.trialEndsAt).getTime() : 0;
  const trialActive = Boolean(trialEndsAtMs && trialEndsAtMs > now);
  const trialDaysRemaining = trialActive
    ? Math.max(1, Math.ceil((trialEndsAtMs - now) / 86400000))
    : 0;

  return {
    ownerId,
    plan: String(row.plan || ""),
    status: String(row.status || ""),
    priceCents: Number(row.priceCents || 0),
    active: row.status === "active" || row.status === "paid",
    provider: String(row.provider || ""),
    billingMethod: String(row.billingMethod || ""),
    providerStatus: row.providerStatus ? String(row.providerStatus) : null,
    providerSubscriptionId: row.providerSubscriptionId ? String(row.providerSubscriptionId) : null,
    providerCheckoutId: row.providerCheckoutId ? String(row.providerCheckoutId) : null,
    providerCustomerId: row.providerCustomerId ? String(row.providerCustomerId) : null,
    lastPaymentId: row.lastPaymentId ? String(row.lastPaymentId) : null,
    lastPaymentStatus: row.lastPaymentStatus ? String(row.lastPaymentStatus) : null,
    lastWebhookAt: row.lastWebhookAt ?? null,
    trialEndsAt: row.trialEndsAt ?? null,
    paidUntil: row.paidUntil ?? null,
    pixExpiresAt: row.pixExpiresAt ?? null,
    subscriptionUpdatedAt: row.updatedAt ?? null,
    trialActive,
    trialDaysRemaining,
  };
}

async function getProfile(client: Client, user: any) {
  const subscription = await getSubscription(client, user);
  return {
    id: Number(user.id),
    supportId: user.supportId ? String(user.supportId) : null,
    name: String(user.name || ""),
    username: String(user.username || ""),
    email: String(user.email || ""),
    whatsapp: String(user.whatsapp || ""),
    role: String(user.role || "user"),
    loginMethod: String(user.loginMethod || "local"),
    createdAt: user.createdAt ?? null,
    commercial: Boolean(subscription),
    commercialOwner: user.loginMethod === "commercial_signup",
    editable: user.loginMethod === "commercial_signup",
    canDeleteAccount: user.loginMethod === "commercial_signup",
    canCancelPlan: user.loginMethod === "commercial_signup" && Boolean(subscription) && subscription?.status !== "canceled",
    plan: subscription?.plan === "basic" || subscription?.plan === "plus" ? subscription.plan : null,
    subscriptionStatus: subscription?.status ?? null,
    priceCents: subscription?.priceCents ?? null,
    provider: subscription?.provider ?? null,
    billingMethod: subscription?.billingMethod ?? null,
    providerStatus: subscription?.providerStatus ?? null,
    lastPaymentStatus: subscription?.lastPaymentStatus ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    trialActive: subscription?.trialActive ?? false,
    trialDaysRemaining: subscription?.trialDaysRemaining ?? 0,
    paidUntil: subscription?.paidUntil ?? null,
    lastWebhookAt: subscription?.lastWebhookAt ?? null,
    subscriptionUpdatedAt: subscription?.subscriptionUpdatedAt ?? null,
  };
}

async function cancelProviderSubscription(subscription: any) {
  if (!subscription) return { provider: null, resource: null, cancelled: false };
  const provider = String(subscription.provider || "");
  if (provider !== "asaas") return { provider, resource: null, cancelled: false };

  const subscriptionId = String(subscription.providerSubscriptionId || "").trim();
  const paymentId = String(subscription.lastPaymentId || "").trim();

  if (subscriptionId) {
    return {
      provider,
      resource: "subscription",
      cancelled: await deleteAsaasResource(`/subscriptions/${encodeURIComponent(subscriptionId)}`, "a assinatura"),
    };
  }

  if (paymentId && ["pending_payment", "past_due"].includes(String(subscription.status))) {
    return {
      provider,
      resource: "payment",
      cancelled: await deleteAsaasResource(`/payments/${encodeURIComponent(paymentId)}`, "a cobrança pendente"),
    };
  }

  return { provider, resource: null, cancelled: false };
}

async function cancelOwnSubscription(client: Client, req: any, res: any, user: any, body: any) {
  if (user.loginMethod !== "commercial_signup") {
    return sendJson(res, 403, {
      success: false,
      message: "Somente o contratante principal pode cancelar o plano.",
    });
  }

  const currentPassword = String(body?.currentPassword ?? "");
  if (!currentPassword || !user.passwordHash) {
    return sendJson(res, 400, { success: false, message: "Informe sua senha atual para cancelar o plano." });
  }
  if (!(await bcrypt.compare(currentPassword, String(user.passwordHash)))) {
    return sendJson(res, 401, { success: false, message: "Senha atual incorreta." });
  }

  const subscription = await getSubscription(client, user);
  if (!subscription) {
    return sendJson(res, 404, { success: false, message: "Nenhum plano comercial foi encontrado para esta conta." });
  }
  if (subscription.status === "canceled") {
    return sendJson(res, 200, {
      success: true,
      profile: await getProfile(client, user),
      message: "Seu plano já está cancelado.",
    });
  }

  const providerResult = await cancelProviderSubscription(subscription);
  await client.query(
    `UPDATE commercial_subscriptions
        SET status = 'canceled', "providerStatus" = 'CANCELED_BY_USER', "updatedAt" = NOW()
      WHERE "userId" = $1`,
    [user.id]
  );

  await client.query(
    `INSERT INTO "auditLogs"
      ("userId", username, action, entity, "entityId", details, status, "createdAt")
     VALUES ($1, $2, 'cancel_own_subscription', 'commercial_subscriptions', $1, $3, 'success', NOW())`,
    [
      user.id,
      user.username || user.email || "Contratante",
      JSON.stringify({
        previousStatus: subscription.status,
        provider: subscription.provider,
        billingMethod: subscription.billingMethod,
        providerResource: providerResult.resource,
        providerResourceCancelled: providerResult.cancelled,
        trialEndsAt: subscription.trialEndsAt,
        paidUntil: subscription.paidUntil,
      }),
    ]
  );

  return sendJson(res, 200, {
    success: true,
    profile: await getProfile(client, user),
    message: "Plano cancelado. Nenhuma nova cobrança recorrente será realizada por este plano.",
  });
}

async function updateProfile(client: Client, req: any, res: any, user: any) {
  if (user.loginMethod !== "commercial_signup") {
    return sendJson(res, 403, {
      success: false,
      message: "Esta conta é administrada pelo responsável que a criou e não pode alterar seus dados por esta área.",
    });
  }

  const body = await readJsonBody(req);
  if (String(body?.action || "") === "cancel_subscription") {
    return await cancelOwnSubscription(client, req, res, user, body);
  }

  const name = String(body?.name ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const whatsapp = normalizeWhatsapp(String(body?.whatsapp ?? ""));
  const currentPassword = String(body?.currentPassword ?? "");
  const newPassword = String(body?.newPassword ?? "");

  if (!isFullName(name) || name.length > 200) {
    return sendJson(res, 400, { success: false, message: "Informe nome e sobrenome completos." });
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

  const sensitiveChanged =
    username.toLowerCase() !== String(user.username || "").toLowerCase() ||
    email.toLowerCase() !== String(user.email || "").toLowerCase() ||
    Boolean(newPassword);

  if (sensitiveChanged) {
    if (!currentPassword || !user.passwordHash) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe sua senha atual para alterar usuário, e-mail ou senha.",
      });
    }
    if (!(await bcrypt.compare(currentPassword, String(user.passwordHash)))) {
      return sendJson(res, 401, { success: false, message: "Senha atual incorreta." });
    }
  }

  const collision = await client.query(
    `SELECT id, username, email FROM users
      WHERE id <> $1 AND (lower(username) = lower($2) OR lower(email) = lower($3))
      LIMIT 1`,
    [user.id, username, email]
  );
  if (collision.rows[0]) {
    const sameUsername = String(collision.rows[0].username || "").toLowerCase() === username.toLowerCase();
    return sendJson(res, 409, {
      success: false,
      message: sameUsername ? "Este nome de usuário já está em uso." : "Este e-mail já está cadastrado.",
    });
  }

  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : String(user.passwordHash || "");
  await client.query(
    `UPDATE users
        SET name = $1, username = $2, email = $3, whatsapp = $4,
            "passwordHash" = $5, "failedLoginAttempts" = 0, "updatedAt" = NOW()
      WHERE id = $6`,
    [name, username, email, whatsapp, passwordHash, user.id]
  );

  if (newPassword) {
    await client.query(`DELETE FROM local_sessions WHERE "userId" = $1 AND token <> $2`, [user.id, user.sessionToken]);
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
  if (!(await bcrypt.compare(currentPassword, String(user.passwordHash)))) {
    return sendJson(res, 401, { success: false, message: "Senha atual incorreta." });
  }

  const subscription = await getSubscription(client, user);
  const providerResult = await cancelProviderSubscription(subscription);

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
    const databases = await client.query(`SELECT id, name FROM databases WHERE "createdBy" = $1 ORDER BY id`, [user.id]);
    const members = await client.query(
      `SELECT id FROM users WHERE "loginMethod" = 'commercial_subuser' AND "accountOwnerId" = $1`,
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
          subscriptionProvider: subscription?.provider || null,
          providerResourceCancelled: providerResult.cancelled,
          providerResource: providerResult.resource,
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
        `UPDATE users SET
          username = 'deleted-member-' || id || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
          email = NULL, name = 'Conta excluída', whatsapp = NULL, "passwordHash" = NULL,
          "loginMethod" = 'deleted_account', "accountOwnerId" = NULL,
          "canView" = false, "canInsert" = false, "canEdit" = false, "canDelete" = false,
          "canGenerateReports" = false, "canAccessSettings" = false,
          "canManageUsers" = false, "canManageDatabases" = false, "canDeleteCashFlow" = false,
          "dashboardOnly" = true, "isActive" = false, "updatedAt" = NOW()
        WHERE id = $1`,
        [memberId]
      );
    }

    await client.query(`DELETE FROM local_sessions WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM password_reset_tokens WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM user_database_access WHERE "userId" = $1`, [user.id]);
    await client.query(`DELETE FROM commercial_subscriptions WHERE "userId" = $1`, [user.id]);
    await client.query(
      `UPDATE users SET
        username = 'deleted-account-' || id || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        email = NULL, name = 'Conta excluída', whatsapp = NULL, "passwordHash" = NULL,
        "loginMethod" = 'deleted_account', "accountOwnerId" = NULL,
        "canView" = false, "canInsert" = false, "canEdit" = false, "canDelete" = false,
        "canGenerateReports" = false, "canAccessSettings" = false,
        "canManageUsers" = false, "canManageDatabases" = false, "canDeleteCashFlow" = false,
        "dashboardOnly" = true, "isActive" = false, "updatedAt" = NOW()
      WHERE id = $1`,
      [user.id]
    );

    await client.query("COMMIT");
    clearSessionCookie(res);
    return sendJson(res, 200, {
      success: true,
      message: "Seu plano foi cancelado e sua conta, junto com os dados pertencentes a ela, foi excluída do Note Note.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function handleCommercialProfile(req: any, res: any) {
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
      return sendJson(res, 200, { success: true, profile: await getProfile(client, user) });
    }
    if (req.method === "POST") return await updateProfile(client, req, res, user);
    return await deleteCommercialAccount(client, req, res, user);
  } catch (error: any) {
    console.error("[profile-service]", error);
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
