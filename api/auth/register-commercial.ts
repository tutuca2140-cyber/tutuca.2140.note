import bcrypt from "bcrypt";
import { ensureAuthUserColumns, getSql, readJsonBody, sendJson } from "./_shared.js";
import { verifyLoginCaptcha } from "../../shared/login-captcha.js";

const PLAN_PRICES = {
  basic: 2990,
  plus: 4990,
} as const;

type CommercialPlan = keyof typeof PLAN_PRICES;

function isCommercialPlan(value: string): value is CommercialPlan {
  return value === "basic" || value === "plus";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUsername(value: string) {
  return /^[A-Za-z0-9._-]{3,40}$/.test(value);
}

function isValidCommercialPassword(value: string) {
  return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

async function ensureCommercialSubscriptionTable() {
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      message: "Método não permitido.",
    });
  }

  try {
    const body = await readJsonBody(req);
    const username = String(body?.username ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const plan = String(body?.plan ?? "").trim().toLowerCase();
    const captchaToken = String(body?.captchaToken ?? "");
    const captchaAnswer = String(body?.captchaAnswer ?? "");

    if (!isCommercialPlan(plan)) {
      return sendJson(res, 400, {
        success: false,
        message: "Escolha um plano Basic ou Plus antes de se cadastrar.",
      });
    }

    if (!isValidUsername(username)) {
      return sendJson(res, 400, {
        success: false,
        message:
          "O nome de usuário deve ter de 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.",
      });
    }

    if (!isValidEmail(email)) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe um e-mail válido.",
      });
    }

    if (!isValidCommercialPassword(password)) {
      return sendJson(res, 400, {
        success: false,
        message:
          "A senha deve ter no mínimo 8 caracteres, pelo menos uma letra maiúscula e pelo menos um número.",
      });
    }

    if (!verifyLoginCaptcha(captchaToken, captchaAnswer)) {
      return sendJson(res, 400, {
        success: false,
        message: "Confirme corretamente que você não é um robô.",
      });
    }

    await ensureAuthUserColumns();
    await ensureCommercialSubscriptionTable();
    const sql = getSql();

    const existing = await sql`
      SELECT id, username, email
        FROM users
       WHERE lower(username) = lower(${username})
          OR lower(email) = lower(${email})
       LIMIT 1
    `;

    if (existing[0]) {
      const sameUsername =
        String(existing[0].username || "").toLowerCase() === username.toLowerCase();
      return sendJson(res, 409, {
        success: false,
        message: sameUsername
          ? "Este nome de usuário já está em uso."
          : "Este e-mail já está cadastrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await sql`
      INSERT INTO users (
        username,
        "passwordHash",
        name,
        email,
        "loginMethod",
        role,
        "canView",
        "canInsert",
        "canEdit",
        "canDelete",
        "canGenerateReports",
        "canAccessSettings",
        "dashboardOnly",
        "failedLoginAttempts",
        "isActive",
        "emailVerified",
        "createdAt",
        "updatedAt",
        "lastSignedIn"
      ) VALUES (
        ${username},
        ${passwordHash},
        ${username},
        ${email},
        'commercial_signup',
        'user',
        true,
        true,
        true,
        true,
        true,
        false,
        false,
        0,
        false,
        false,
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING id, username, email
    `;

    const user = created[0] as any;

    try {
      await sql`
        INSERT INTO commercial_subscriptions (
          "userId", plan, "priceCents", status, source, "createdAt", "updatedAt"
        ) VALUES (
          ${user.id}, ${plan}, ${PLAN_PRICES[plan]}, 'pending_payment', 'commercial_signup', NOW(), NOW()
        )
      `;
    } catch (error) {
      await sql`DELETE FROM users WHERE id = ${user.id} AND "loginMethod" = 'commercial_signup'`;
      throw error;
    }

    return sendJson(res, 201, {
      success: true,
      registration: {
        username: user.username,
        email: user.email,
        plan,
        priceCents: PLAN_PRICES[plan],
        status: "pending_payment",
      },
      message:
        "Cadastro realizado. O acesso será liberado após a confirmação da assinatura.",
    });
  } catch (error: any) {
    console.error("[auth/register-commercial]", error);
    if (error?.code === "23505") {
      return sendJson(res, 409, {
        success: false,
        message: "Nome de usuário ou e-mail já cadastrado.",
      });
    }
    return sendJson(res, 500, {
      success: false,
      message: "Não foi possível concluir o cadastro agora.",
    });
  }
}
