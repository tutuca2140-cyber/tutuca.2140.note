import bcrypt from "bcrypt";
import { Client, neonConfig } from "@neondatabase/serverless";
import WebSocket from "ws";
import {
  getSql,
  ensureAuthUserColumns,
  makeSessionToken,
  readJsonBody,
  sendJson,
  setSessionCookie,
} from "./_shared.js";
import { verifyLoginCaptcha } from "../../shared/login-captcha.js";

neonConfig.webSocketConstructor = WebSocket;

const PLAN_CONFIG = {
  free: { label: "Grátis", limit: 1 },
  basic: { label: "Basic", limit: 1 },
  plus: { label: "Plus", limit: 3 },
} as const;

type PlanId = keyof typeof PLAN_CONFIG;

function isPlan(value: unknown): value is PlanId {
  return value === "free" || value === "basic" || value === "plus";
}

function isValidCommercialPassword(value: string) {
  return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

function databaseName(username: string, position: number) {
  return position === 1
    ? `Principal - ${username}`
    : `Principal - ${username} #${position}`;
}

function requestOrigin(req: any) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const forwardedHost = String(
    req?.headers?.["x-forwarded-host"] ||
      req?.headers?.host ||
      "notenote.com.br"
  )
    .split(",")[0]
    .trim();
  return `${forwardedProto}://${forwardedHost}`;
}

function escapeEmailHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendCommercialPasswordResetEmail(params: {
  to: string;
  name?: string | null;
  resetUrl: string;
}) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(
    process.env.PASSWORD_RESET_FROM_EMAIL ||
      "Note Note <no-reply@notenote.com.br>"
  ).trim();

  if (!apiKey) {
    throw Object.assign(
      new Error(
        "O envio de recuperação por e-mail ainda precisa da configuração do serviço de e-mail do Note Note."
      ),
      { statusCode: 503 }
    );
  }

  const firstName =
    String(params.name || "")
      .trim()
      .split(/\s+/)[0] || "cliente";
  const safeName = escapeEmailHtml(firstName);
  const safeResetUrl = escapeEmailHtml(params.resetUrl);
  const logoUrl = "https://notenote.com.br/brand/note-note-logo-official.png";
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Recuperação de senha — Note Note</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #dbe7f5;border-radius:22px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,.08);">
            <tr>
              <td align="center" style="padding:30px 30px 20px;background:linear-gradient(135deg,#eff6ff,#e0f2fe);border-bottom:1px solid #dbeafe;">
                <img src="${logoUrl}" alt="Note Note" width="220" style="display:block;max-width:220px;width:100%;height:auto;border:0;" />
                <div style="margin-top:12px;font-size:13px;color:#475569;letter-spacing:.03em;">Sistema de Gestão Financeira</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 10px;">
                <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;">SEGURANÇA DA CONTA</div>
                <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#0f172a;">Crie uma nova senha</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">Olá, <strong>${safeName}</strong>.</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">Recebemos uma solicitação para redefinir a senha da sua conta no Note Note. Para continuar, use o botão abaixo. O link é válido por <strong>30 minutos</strong> e pode ser utilizado apenas uma vez.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
                  <tr>
                    <td align="center">
                      <a href="${safeResetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px;">Redefinir minha senha</a>
                    </td>
                  </tr>
                </table>
                <div style="padding:16px 18px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.6;">
                  <strong>Normas da nova senha:</strong><br />
                  mínimo de 8 caracteres, pelo menos 1 letra maiúscula e pelo menos 1 número.
                </div>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Se o botão não abrir, copie e cole este endereço no navegador:</p>
                <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.6;color:#2563eb;">${safeResetUrl}</p>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual continuará válida.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 34px 30px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;color:#64748b;font-size:12px;line-height:1.6;">
                  <strong style="color:#334155;">Este é um e-mail automático do Note Note.</strong><br />
                  Por segurança, não responda a esta mensagem.<br />
                  © ${new Date().getFullYear()} Note Note
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "Recupere sua senha do Note Note",
      text: [
        `Olá, ${firstName}.`,
        "",
        "Recebemos uma solicitação para redefinir sua senha do Note Note.",
        "A nova senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
        "Use o link abaixo em até 30 minutos:",
        params.resetUrl,
        "",
        "Se você não solicitou essa alteração, ignore este e-mail.",
        "Este é um e-mail automático. Por segurança, não responda a esta mensagem.",
      ].join("\n"),
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[auth/login] Falha ao enviar recuperação:", detail);
    throw Object.assign(
      new Error("Não foi possível enviar o e-mail de recuperação agora."),
      { statusCode: 502 }
    );
  }
}

async function handlePasswordResetRequest(req: any, res: any, body: any) {
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const captchaToken = String(body?.captchaToken ?? "");
  const captchaAnswer = String(body?.captchaAnswer ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, {
      success: false,
      message: "Informe seu e-mail cadastrado.",
    });
  }
  if (!verifyLoginCaptcha(captchaToken, captchaAnswer)) {
    return sendJson(res, 400, {
      success: false,
      message: "Confirme corretamente que você não é um robô.",
    });
  }

  await ensureAuthUserColumns();
  const sql = getSql();
  const rows = await sql`
    SELECT id, username, name, email, "loginMethod", "passwordHash"
      FROM users
     WHERE lower(email) = lower(${email})
     LIMIT 1
  `;
  const user = rows[0] as any;

  // Resposta uniforme para não revelar se um endereço está cadastrado.
  if (!user || user.loginMethod !== "commercial_signup" || !user.passwordHash) {
    return sendJson(res, 200, {
      success: true,
      message:
        "Se este e-mail estiver vinculado a uma conta comercial, enviaremos as instruções de recuperação.",
    });
  }

  const token = makeSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await sql`
    UPDATE password_reset_tokens
       SET "usedAt" = NOW()
     WHERE "userId" = ${user.id} AND "usedAt" IS NULL
  `;
  await sql`
    INSERT INTO password_reset_tokens ("userId", token, "expiresAt", "createdAt")
    VALUES (${user.id}, ${token}, ${expiresAt}, NOW())
  `;

  const resetUrl = `${requestOrigin(req)}/login?reset=${encodeURIComponent(token)}`;
  try {
    await sendCommercialPasswordResetEmail({
      to: String(user.email),
      name: user.name,
      resetUrl,
    });
  } catch (error) {
    await sql`
      UPDATE password_reset_tokens SET "usedAt" = NOW()
       WHERE token = ${token}
    `;
    throw error;
  }

  return sendJson(res, 200, {
    success: true,
    message:
      "Enviamos um link de recuperação para o e-mail cadastrado. Ele é válido por 30 minutos.",
  });
}

async function handlePasswordReset(res: any, body: any) {
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");

  if (!token) {
    return sendJson(res, 400, {
      success: false,
      message: "Link de recuperação inválido.",
    });
  }
  if (!isValidCommercialPassword(password)) {
    return sendJson(res, 400, {
      success: false,
      message:
        "A nova senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.",
    });
  }

  await ensureAuthUserColumns();
  const sql = getSql();
  const rows = await sql`
    SELECT prt.id, prt."userId", u.username, u.email, u."loginMethod"
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt."userId"
     WHERE prt.token = ${token}
       AND prt."usedAt" IS NULL
       AND prt."expiresAt" > NOW()
     LIMIT 1
  `;
  const reset = rows[0] as any;

  if (!reset || reset.loginMethod !== "commercial_signup") {
    return sendJson(res, 400, {
      success: false,
      message: "Este link de recuperação é inválido ou expirou.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    UPDATE users
       SET "passwordHash" = ${passwordHash},
           "failedLoginAttempts" = 0,
           "updatedAt" = NOW()
     WHERE id = ${reset.userId}
  `;
  await sql`
    UPDATE password_reset_tokens SET "usedAt" = NOW() WHERE id = ${reset.id}
  `;
  await sql`DELETE FROM local_sessions WHERE "userId" = ${reset.userId}`;

  return sendJson(res, 200, {
    success: true,
    message: "Senha alterada com sucesso. Entre novamente com a nova senha.",
  });
}

async function provisionCommercialDatabasesOnFirstLogin(userId: number) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw Object.assign(new Error("Banco principal não configurado."), {
      statusCode: 503,
    });
  }

  const sql = getSql();
  await sql`
    ALTER TABLE commercial_subscriptions
    ADD COLUMN IF NOT EXISTS "provisionedAt" timestamptz
  `;

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
         u."loginMethod",
         cs.plan,
         cs.status,
         cs."provisionedAt"
       FROM users u
       JOIN commercial_subscriptions cs ON cs."userId" = u.id
       WHERE u.id = $1
       FOR UPDATE OF u, cs`,
      [userId]
    );
    const target = targetResult.rows[0] as any;

    if (
      !target ||
      target.loginMethod !== "commercial_signup" ||
      !["active", "paid"].includes(String(target.status))
    ) {
      await client.query("COMMIT");
      inTransaction = false;
      return { provisioned: false, reason: "not_applicable" };
    }

    if (target.provisionedAt) {
      await client.query("COMMIT");
      inTransaction = false;
      return { provisioned: false, reason: "already_provisioned" };
    }

    const planValue = String(target.plan || "");
    if (!isPlan(planValue)) {
      throw Object.assign(
        new Error(
          "O plano comercial desta conta é inválido. Contate o Super Admin."
        ),
        { statusCode: 409 }
      );
    }

    const plan: PlanId = planValue;
    const config = PLAN_CONFIG[plan];
    const username = String(
      target.username || target.name || `usuario-${target.id}`
    ).trim();

    const existingAccess = await client.query(
      `SELECT uda.id, uda."databaseId", uda."isActive", d.name, d."createdBy"
         FROM user_database_access uda
         JOIN databases d ON d.id = uda."databaseId"
        WHERE uda."userId" = $1
        ORDER BY uda."createdAt", uda.id`,
      [userId]
    );

    if (existingAccess.rows.length > config.limit) {
      throw Object.assign(
        new Error(
          `Esta conta possui mais bancos do que o plano ${config.label} permite. Contate o Super Admin.`
        ),
        { statusCode: 409 }
      );
    }

    const createdDatabases: Array<{ id: number; name: string }> = [];
    let hasActiveDatabase = existingAccess.rows.some(
      (row: any) => row.isActive
    );

    for (
      let position = existingAccess.rows.length + 1;
      position <= config.limit;
      position++
    ) {
      const name = databaseName(username, position);
      const collision = await client.query(
        `SELECT id, name, "createdBy"
           FROM databases
          WHERE lower(name) = lower($1)
          LIMIT 1`,
        [name]
      );

      let databaseId: number;
      let databaseDisplayName = name;

      if (collision.rows[0]) {
        const existingDatabase = collision.rows[0] as any;
        if (Number(existingDatabase.createdBy) !== Number(userId)) {
          throw Object.assign(
            new Error(
              `Já existe um banco chamado “${name}”. Contate o Super Admin para concluir a preparação da conta.`
            ),
            { statusCode: 409 }
          );
        }
        databaseId = Number(existingDatabase.id);
        databaseDisplayName = String(existingDatabase.name || name);
      } else {
        const created = await client.query(
          `INSERT INTO databases
            (name, description, type, "isActive", "createdBy", "createdAt", "updatedAt")
           VALUES ($1, $2, 'novo', false, $3, NOW(), NOW())
           RETURNING id, name`,
          [
            name,
            `Banco criado automaticamente no primeiro login pelo plano ${config.label} do usuário ${username}.`,
            userId,
          ]
        );
        const database = created.rows[0] as any;
        databaseId = Number(database.id);
        databaseDisplayName = String(database.name);
        createdDatabases.push({ id: databaseId, name: databaseDisplayName });
      }

      const alreadyLinked = await client.query(
        `SELECT id FROM user_database_access
          WHERE "userId" = $1 AND "databaseId" = $2
          LIMIT 1`,
        [userId, databaseId]
      );

      if (!alreadyLinked.rows[0]) {
        const shouldBeActive = !hasActiveDatabase;
        await client.query(
          `INSERT INTO user_database_access
            ("userId", "databaseId", "isActive", "createdAt")
           VALUES ($1, $2, $3, NOW())`,
          [userId, databaseId, shouldBeActive]
        );
        if (shouldBeActive) hasActiveDatabase = true;
      }
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
          `Não foi possível preparar os ${config.limit} bancos previstos pelo plano ${config.label}.`
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
      `UPDATE commercial_subscriptions
          SET "provisionedAt" = NOW(), "updatedAt" = NOW()
        WHERE "userId" = $1`,
      [userId]
    );

    await client.query(
      `INSERT INTO "auditLogs"
        ("userId", username, action, entity, "entityId", details, status, "createdAt")
       VALUES ($1, $2, 'provision_commercial_databases_first_login', 'databases', $3, $4, 'success', NOW())`,
      [
        userId,
        username,
        userId,
        JSON.stringify({
          plan,
          databaseLimit: config.limit,
          createdDatabases,
          databaseNames: allAccess.rows.map((row: any) => row.name),
        }),
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;

    return {
      provisioned: true,
      plan,
      databaseLimit: config.limit,
      createdDatabases,
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
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      message: "Método não permitido",
    });
  }

  try {
    const body = await readJsonBody(req);
    const action = String(body?.action ?? "login")
      .trim()
      .toLowerCase();

    if (action === "request_reset") {
      return await handlePasswordResetRequest(req, res, body);
    }
    if (action === "reset_password") {
      return await handlePasswordReset(res, body);
    }
    if (action !== "login") {
      return sendJson(res, 400, {
        success: false,
        message: "Ação de autenticação inválida.",
      });
    }

    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    const rememberMe = Boolean(body?.rememberMe);
    const captchaToken = String(body?.captchaToken ?? "");
    const captchaAnswer = String(body?.captchaAnswer ?? "");

    if (!username || !password) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe usuário e senha.",
      });
    }
    if (!verifyLoginCaptcha(captchaToken, captchaAnswer)) {
      return sendJson(res, 400, {
        success: false,
        message: "Confirme corretamente que você não é um robô.",
      });
    }

    await ensureAuthUserColumns();
    const sql = getSql();

    const rows = await sql`
      SELECT
        id,
        username,
        "passwordHash",
        name,
        email,
        role,
        "loginMethod",
        "canView",
        "canInsert",
        "canEdit",
        "canDelete",
        "canGenerateReports",
        "canAccessSettings",
        "dashboardOnly",
        "failedLoginAttempts",
        "isActive"
      FROM users
      WHERE lower(username) = lower(${username})
      LIMIT 1
    `;

    const user = rows[0] as any;

    if (!user?.passwordHash) {
      return sendJson(res, 401, {
        success: false,
        message: "Usuário ou senha inválidos.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      if (
        String(user.username).toLowerCase() === "draco" ||
        user.role === "super_admin" ||
        user.loginMethod === "commercial_signup"
      ) {
        return sendJson(res, 401, {
          success: false,
          message: "Usuário ou senha inválidos.",
        });
      }
      const attempts = Number(user.failedLoginAttempts || 0) + 1;
      await sql`
        UPDATE users
        SET "failedLoginAttempts" = ${attempts},
            "isActive" = ${attempts < 2},
            "updatedAt" = NOW()
        WHERE id = ${user.id}
      `;
      if (attempts >= 2) {
        await sql`DELETE FROM local_sessions WHERE "userId" = ${user.id}`;
      }
      return sendJson(res, 401, {
        success: false,
        message:
          attempts >= 2
            ? "Usuário desativado após duas tentativas incorretas. Solicite a reativação ao Super Admin."
            : "Usuário ou senha inválidos. Mais uma tentativa incorreta desativará a conta.",
      });
    }

    if (!user.isActive) {
      if (user.loginMethod === "commercial_signup") {
        const pendingRows =
          await sql`SELECT plan,status,"billingMethod","checkoutUrl","providerStatus","pixQrCode","pixQrCodeBase64","pixExpiresAt","trialEndsAt" FROM commercial_subscriptions WHERE "userId"=${user.id} LIMIT 1`;
        const pending = pendingRows[0] as any;
        if (pending && ["active", "paid"].includes(String(pending.status))) {
          await sql`UPDATE users SET "isActive"=true,"updatedAt"=NOW() WHERE id=${user.id}`;
          user.isActive = true;
        } else if (pending)
          return sendJson(res, 402, {
            success: false,
            paymentPending: true,
            message:
              "Seu cadastro foi encontrado. Conclua a etapa de pagamento para liberar o primeiro acesso.",
            payment: {
              plan: pending.plan,
              status: pending.status,
              billingMethod: pending.billingMethod,
              checkoutUrl: pending.checkoutUrl,
              providerStatus: pending.providerStatus,
              pixQrCode: pending.pixQrCode,
              pixQrCodeBase64: pending.pixQrCodeBase64,
              pixExpiresAt: pending.pixExpiresAt,
              trialEndsAt: pending.trialEndsAt,
            },
          });
      }
      if (!user.isActive)
        return sendJson(res, 403, {
          success: false,
          message: "Usuário desativado.",
        });
    }

    if (user.loginMethod === "commercial_signup") {
      await provisionCommercialDatabasesOnFirstLogin(Number(user.id));
    }

    // Draco permanece protegido como super administrador.
    if (String(user.username).toLowerCase() === "draco") {
      await sql`
        UPDATE users
        SET
          role = 'super_admin',
          "canView" = true,
          "canInsert" = true,
          "canEdit" = true,
          "canDelete" = true,
          "canGenerateReports" = true,
          "canAccessSettings" = true,
          "dashboardOnly" = false,
          "failedLoginAttempts" = 0,
          "isActive" = true,
          "updatedAt" = NOW(),
          "lastSignedIn" = NOW()
        WHERE id = ${user.id}
      `;
    } else {
      await sql`
        UPDATE users
        SET "lastSignedIn" = NOW(), "failedLoginAttempts" = 0, "updatedAt" = NOW()
        WHERE id = ${user.id}
      `;
    }

    const token = makeSessionToken();
    const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await sql`DELETE FROM local_sessions WHERE "expiresAt" <= NOW()`;

    await sql`
      INSERT INTO local_sessions ("userId", token, "expiresAt")
      VALUES (${user.id}, ${token}, ${expiresAt})
    `;

    setSessionCookie(res, token, maxAgeSeconds);

    return sendJson(res, 200, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role:
          String(user.username).toLowerCase() === "draco"
            ? "super_admin"
            : user.role,
      },
    });
  } catch (error: any) {
    console.error("[auth/login]", error);
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível realizar a operação de autenticação.",
    });
  }
}
