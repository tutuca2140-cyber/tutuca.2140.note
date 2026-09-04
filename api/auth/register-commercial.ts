import bcrypt from "bcrypt";
import {
  ensureAuthUserColumns,
  getSql,
  readJsonBody,
  sendJson,
} from "./_shared.js";
import { verifyLoginCaptcha } from "../../shared/login-captcha.js";
import { recordLegalConsent } from "../../server/legal-consents.js";

const ASAAS_API = "https://api.asaas.com/v3";
const RETURN_BASE = "https://notenote.com.br";
const TRIAL_DAYS = 7;

const MONTHLY_PRICES = { free: 0, basic: 2990, plus: 4990 } as const;
const ANNUAL_PIX_PRICES = { free: 0, basic: 19990, plus: 39990 } as const;
const PLAN_DATABASE_LIMITS = { free: 1, basic: 1, plus: 3 } as const;
const PLAN_LABELS = { free: "Grátis", basic: "Basic", plus: "Plus" } as const;

type CommercialPlan = keyof typeof MONTHLY_PRICES;
type BillingMethod = "free" | "card_monthly" | "pix_annual";

function isCommercialPlan(value: string): value is CommercialPlan {
  return value === "free" || value === "basic" || value === "plus";
}
function isBillingMethod(value: string): value is BillingMethod {
  return value === "free" || value === "card_monthly" || value === "pix_annual";
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
function isValidFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (
    value.trim().length >= 5 && value.trim().length <= 200 && parts.length >= 2
  );
}
function normalizeBrazilWhatsapp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}
function isValidBrazilWhatsapp(value: string) {
  const digits = normalizeBrazilWhatsapp(value);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits);
}
function formatStoredWhatsapp(value: string) {
  return `+55${normalizeBrazilWhatsapp(value)}`;
}
function trialEndDate() {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
function priceFor(plan: CommercialPlan, billingMethod: BillingMethod) {
  return billingMethod === "pix_annual"
    ? ANNUAL_PIX_PRICES[plan]
    : MONTHLY_PRICES[plan];
}
function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}
function isValidCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    return digit === 10 ? 0 : digit;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}
function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}
function asaasDateTime(date: Date) {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

function getAsaasApiKey() {
  const apiKey = String(process.env.ASAAS_API_KEY ?? "").trim();
  if (!apiKey)
    throw Object.assign(
      new Error("Asaas ainda não está configurado no servidor."),
      { statusCode: 503 }
    );
  return apiKey;
}

async function asaasRequest(path: string, init: RequestInit = {}) {
  const apiKey = getAsaasApiKey();
  const response = await fetch(`${ASAAS_API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: apiKey,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[asaas/request]", {
      path,
      status: response.status,
      errors: data?.errors,
      message: data?.message,
    });
    const message =
      Array.isArray(data?.errors) && data.errors[0]?.description
        ? String(data.errors[0].description)
        : "Não foi possível iniciar o pagamento no Asaas.";
    throw Object.assign(new Error(message), {
      statusCode: 502,
      providerResponse: data,
    });
  }
  return data as any;
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
  await sql`
    ALTER TABLE commercial_subscriptions
      ADD COLUMN IF NOT EXISTS provider varchar(40),
      ADD COLUMN IF NOT EXISTS "providerSubscriptionId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerCheckoutId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerCustomerId" varchar(120),
      ADD COLUMN IF NOT EXISTS "providerStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "checkoutUrl" text,
      ADD COLUMN IF NOT EXISTS "externalReference" varchar(160),
      ADD COLUMN IF NOT EXISTS "lastPaymentStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "lastPaymentId" varchar(120),
      ADD COLUMN IF NOT EXISTS "lastWebhookAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "billingMethod" varchar(30) NOT NULL DEFAULT 'card_monthly',
      ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "paidUntil" timestamptz,
      ADD COLUMN IF NOT EXISTS "pixQrCode" text,
      ADD COLUMN IF NOT EXISTS "pixQrCodeBase64" text,
      ADD COLUMN IF NOT EXISTS "pixExpiresAt" timestamptz
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS commercial_subscriptions_provider_subscription_uidx
      ON commercial_subscriptions ("providerSubscriptionId")
      WHERE "providerSubscriptionId" IS NOT NULL
  `;
  await sql`
    CREATE OR REPLACE FUNCTION enforce_commercial_database_limit()
    RETURNS trigger AS $$
    DECLARE user_method text; user_plan text; allowed_count integer; current_count integer;
    BEGIN
      SELECT "loginMethod" INTO user_method FROM users WHERE id = NEW."userId";
      IF COALESCE(user_method, 'local') <> 'commercial_signup' THEN RETURN NEW; END IF;
      SELECT plan INTO user_plan FROM commercial_subscriptions WHERE "userId" = NEW."userId" LIMIT 1;
      allowed_count := CASE WHEN user_plan IN ('free', 'basic') THEN 1 WHEN user_plan = 'plus' THEN 3 ELSE 0 END;
      IF allowed_count = 0 THEN RAISE EXCEPTION 'Plano comercial não definido para este usuário.' USING ERRCODE = 'P0001'; END IF;
      PERFORM pg_advisory_xact_lock(NEW."userId"::bigint);
      SELECT COUNT(*)::integer INTO current_count FROM user_database_access WHERE "userId" = NEW."userId";
      IF current_count >= allowed_count THEN
        RAISE EXCEPTION 'Limite de bancos excedido para o plano %. Grátis e Basic permitem 1 banco; Plus permite 3 bancos.', user_plan USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await sql`DROP TRIGGER IF EXISTS commercial_database_limit_trigger ON user_database_access`;
  await sql`
    CREATE TRIGGER commercial_database_limit_trigger BEFORE INSERT ON user_database_access
    FOR EACH ROW EXECUTE FUNCTION enforce_commercial_database_limit()
  `;
}

async function createAsaasCustomer(args: {
  userId: number;
  name: string;
  email: string;
  whatsapp: string;
  cpf: string;
}) {
  const data = await asaasRequest("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      cpfCnpj: normalizeCpf(args.cpf),
      email: args.email,
      mobilePhone: normalizeBrazilWhatsapp(args.whatsapp),
      externalReference: `notenote:user:${args.userId}`,
      notificationDisabled: false,
    }),
  });
  if (!data?.id)
    throw Object.assign(
      new Error("O Asaas não retornou o identificador do cliente."),
      { statusCode: 502 }
    );
  return String(data.id);
}

async function createAsaasPix(args: {
  userId: number;
  name: string;
  email: string;
  whatsapp: string;
  cpf: string;
  plan: CommercialPlan;
  trialEndsAt: Date;
}) {
  const externalReference = `notenote:${args.userId}:${args.plan}:pix_annual`;
  const customerId = await createAsaasCustomer(args);
  const paymentDueDate = new Date();
  const payment = await asaasRequest("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: ANNUAL_PIX_PRICES[args.plan] / 100,
      dueDate: yyyyMmDd(paymentDueDate),
      description: `Note Note - Plano ${PLAN_LABELS[args.plan]} Anual`,
      externalReference,
    }),
  });
  if (!payment?.id)
    throw Object.assign(
      new Error("O Asaas não retornou o identificador do Pix."),
      { statusCode: 502 }
    );

  const qr = await asaasRequest(
    `/payments/${encodeURIComponent(String(payment.id))}/pixQrCode`,
    { method: "GET" }
  );
  const qrCode = String(qr?.payload ?? "");
  const qrCodeBase64 = String(qr?.encodedImage ?? "");
  if (!qrCode)
    throw Object.assign(new Error("O Asaas não retornou o QR Code Pix."), {
      statusCode: 502,
    });

  try {
    const decoded = await asaasRequest("/pix/qrCodes/decode", {
      method: "POST",
      body: JSON.stringify({
        payload: qrCode,
        expectedPaymentDate: yyyyMmDd(new Date()),
      }),
    });
    const canBePaid = decoded?.canBePaid;
    console.info("[asaas/pix-validation]", {
      paymentId: String(payment.id),
      canBePaid,
      paymentStatus: String(payment.status ?? "PENDING"),
      dueDate: String(payment.dueDate ?? yyyyMmDd(paymentDueDate)),
      expirationDate: String(qr?.expirationDate ?? ""),
    });
    if (canBePaid === false) {
      const reason = String(
        decoded?.cannotBePaidReason ??
          decoded?.reason ??
          "O QR Code foi gerado, mas o Asaas informou que ele não pode ser pago."
      );
      throw Object.assign(new Error(reason), {
        statusCode: 502,
        providerResponse: decoded,
      });
    }
  } catch (validationError: any) {
    if (validationError?.providerResponse?.canBePaid === false)
      throw validationError;
    console.warn(
      "[asaas/pix-validation-unavailable]",
      validationError instanceof Error
        ? validationError.message
        : validationError
    );
  }

  return {
    kind: "pix" as const,
    paymentId: String(payment.id),
    customerId,
    status: String(payment.status ?? "PENDING"),
    checkoutUrl: String(payment.invoiceUrl ?? ""),
    externalReference,
    qrCode,
    qrCodeBase64,
    expiresAt: String(qr?.expirationDate ?? args.trialEndsAt.toISOString()),
  };
}

async function createAsaasCardCheckout(args: {
  userId: number;
  plan: CommercialPlan;
  trialEndsAt: Date;
}) {
  const externalReference = `notenote:${args.userId}:${args.plan}:card_monthly`;
  const checkout = await asaasRequest("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 1440,
      externalReference,
      callback: {
        successUrl: `${RETURN_BASE}/login?assinatura=asaas-sucesso`,
        cancelUrl: `${RETURN_BASE}/login?assinatura=asaas-cancelado`,
        expiredUrl: `${RETURN_BASE}/login?assinatura=asaas-expirado`,
      },
      items: [
        {
          name: `Note Note ${PLAN_LABELS[args.plan]}`,
          description: `Assinatura mensal do plano ${PLAN_LABELS[args.plan]}`,
          quantity: 1,
          value: MONTHLY_PRICES[args.plan] / 100,
        },
      ],
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: asaasDateTime(args.trialEndsAt),
      },
    }),
  });
  if (!checkout?.id)
    throw Object.assign(
      new Error("O Asaas não retornou o checkout da assinatura."),
      { statusCode: 502 }
    );
  const checkoutId = String(checkout.id);
  return {
    kind: "checkout" as const,
    checkoutId,
    status: "PENDING",
    externalReference,
    checkoutUrl: `https://asaas.com/checkoutSession/show?id=${encodeURIComponent(checkoutId)}`,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return sendJson(res, 405, {
      success: false,
      message: "Método não permitido.",
    });
  let createdUserId: number | null = null;

  try {
    const body = await readJsonBody(req);
    const name = String(body?.name ?? "").trim();
    const username = String(body?.username ?? "").trim();
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? "");
    const whatsappInput = String(body?.whatsapp ?? "").trim();
    const cpf = String(body?.cpf ?? "").trim();
    const plan = String(body?.plan ?? "")
      .trim()
      .toLowerCase();
    const billingMethodInput = String(body?.billingMethod ?? "card_monthly")
      .trim()
      .toLowerCase();
    const captchaToken = String(body?.captchaToken ?? "");
    const captchaAnswer = String(body?.captchaAnswer ?? "");
    const termsAccepted = body?.termsAccepted === true;
    const privacyAccepted = body?.privacyAccepted === true;
    const trialCancellationAccepted = body?.trialCancellationAccepted === true;
    const marketingOptIn = body?.marketingOptIn === true;

    if (!isCommercialPlan(plan))
      return sendJson(res, 400, {
        success: false,
        message: "Escolha o plano Grátis, Basic ou Plus antes de se cadastrar.",
      });
    if (!isBillingMethod(billingMethodInput))
      return sendJson(res, 400, {
        success: false,
        message: "Escolha pagamento mensal no cartão ou anual no Pix.",
      });
    const billingMethod = billingMethodInput as BillingMethod;
    if (plan === "free" && billingMethod !== "free")
      return sendJson(res, 400, {
        success: false,
        message: "O plano Grátis não exige forma de pagamento.",
      });
    if (plan !== "free" && billingMethod === "free")
      return sendJson(res, 400, {
        success: false,
        message: "Escolha a forma de pagamento do plano contratado.",
      });
    if (!isValidFullName(name))
      return sendJson(res, 400, {
        success: false,
        message: "Informe seu nome e sobrenome completos.",
      });
    if (!isValidUsername(username))
      return sendJson(res, 400, {
        success: false,
        message:
          "O nome de usuário deve ter de 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado.",
      });
    if (!isValidEmail(email))
      return sendJson(res, 400, {
        success: false,
        message: "Informe um e-mail válido.",
      });
    if (!isValidCommercialPassword(password))
      return sendJson(res, 400, {
        success: false,
        message:
          "A senha deve ter no mínimo 8 caracteres, pelo menos uma letra maiúscula e pelo menos um número.",
      });
    if (!isValidBrazilWhatsapp(whatsappInput))
      return sendJson(res, 400, {
        success: false,
        message:
          "Informe um WhatsApp brasileiro válido com DDD e número iniciado por 9.",
      });
    if (billingMethod === "pix_annual" && !isValidCpf(cpf))
      return sendJson(res, 400, {
        success: false,
        message: "Informe um CPF válido para gerar o Pix do Asaas.",
      });
    if (
      !termsAccepted ||
      !privacyAccepted ||
      (plan !== "free" && !trialCancellationAccepted)
    )
      return sendJson(res, 400, {
        success: false,
        message:
          plan === "free"
            ? "Para criar sua conta, aceite os Termos de Uso e a Política de Privacidade."
            : "Para contratar o Note Note, aceite os Termos de Uso, a Política de Privacidade e as condições do teste gratuito/cancelamento.",
      });
    if (!verifyLoginCaptcha(captchaToken, captchaAnswer))
      return sendJson(res, 400, {
        success: false,
        message: "Confirme corretamente que você não é um robô.",
      });

    await ensureAuthUserColumns();
    await ensureCommercialSubscriptionTable();
    const sql = getSql();
    const existing =
      await sql`SELECT id, username, email FROM users WHERE lower(username)=lower(${username}) OR lower(email)=lower(${email}) LIMIT 1`;
    if (existing[0]) {
      const sameUsername =
        String(existing[0].username || "").toLowerCase() ===
        username.toLowerCase();
      return sendJson(res, 409, {
        success: false,
        message: sameUsername
          ? "Este nome de usuário já está em uso."
          : "Este e-mail já está cadastrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const whatsapp = formatStoredWhatsapp(whatsappInput);
    const trialEndsAt = trialEndDate();
    const initialAccessActive = plan === "free";
    const subscriptionTrialEndsAt =
      billingMethod === "card_monthly" ? trialEndsAt.toISOString() : null;
    const created = await sql`
      INSERT INTO users (
        username, "passwordHash", name, email, whatsapp, "loginMethod", role,
        "canView", "canInsert", "canEdit", "canDelete", "canGenerateReports",
        "canAccessSettings", "dashboardOnly", "failedLoginAttempts", "isActive",
        "emailVerified", "createdAt", "updatedAt", "lastSignedIn"
      ) VALUES (
        ${username}, ${passwordHash}, ${name}, ${email}, ${whatsapp}, 'commercial_signup', 'user',
        true, true, true, true, true, false, false, 0, ${initialAccessActive}, false, NOW(), NOW(), NOW()
      ) RETURNING id, username, email, name, whatsapp
    `;
    const user = created[0] as any;
    createdUserId = Number(user.id);
    const selectedPrice = priceFor(plan, billingMethod);

    await sql`
      INSERT INTO commercial_subscriptions (
        "userId", plan, "priceCents", status, source, provider, "billingMethod", "trialEndsAt", "createdAt", "updatedAt"
      ) VALUES (
        ${user.id}, ${plan}, ${selectedPrice}, ${initialAccessActive ? "active" : "pending_payment"}, 'commercial_signup', ${plan === "free" ? null : "asaas"},
        ${billingMethod}, ${subscriptionTrialEndsAt}, NOW(), NOW()
      )
    `;

    const forwarded = String(req?.headers?.["x-forwarded-for"] ?? "");
    const ipAddress =
      (
        forwarded.split(",")[0]?.trim() ||
        String(req?.socket?.remoteAddress ?? "")
      ).slice(0, 120) || null;
    const userAgent =
      String(req?.headers?.["user-agent"] ?? "").slice(0, 2000) || null;
    await recordLegalConsent({
      userId: Number(user.id),
      email: String(user.email),
      username: String(user.username),
      name: String(user.name),
      plan,
      billingMethod,
      termsAccepted,
      privacyAccepted,
      trialCancellationAccepted,
      marketingOptIn,
      ipAddress,
      userAgent,
    });

    if (plan === "free") {
      return sendJson(res, 201, {
        success: true,
        registration: {
          name: user.name,
          username: user.username,
          email: user.email,
          whatsapp: user.whatsapp,
          plan,
          billingMethod,
          priceCents: 0,
          databaseLimit: PLAN_DATABASE_LIMITS.free,
          status: "active",
          trialDays: 0,
          trialEndsAt: null,
          marketingOptIn,
        },
        subscription: {
          provider: null,
          billingMethod,
          status: "active",
          checkoutUrl: null,
        },
        message:
          "Conta grátis criada. Entre no Note Note para usar seu banco de dados exclusivo.",
      });
    }

    if (billingMethod === "pix_annual") {
      const pix = await createAsaasPix({
        userId: Number(user.id),
        name: String(user.name),
        email: String(user.email),
        whatsapp: String(user.whatsapp),
        cpf,
        plan,
        trialEndsAt,
      });
      await sql`
        UPDATE commercial_subscriptions SET
          provider='asaas', "providerCustomerId"=${pix.customerId}, "providerStatus"=${pix.status},
          "checkoutUrl"=${pix.checkoutUrl || null}, "externalReference"=${pix.externalReference},
          "lastPaymentId"=${pix.paymentId}, "lastPaymentStatus"=${pix.status},
          "pixQrCode"=${pix.qrCode}, "pixQrCodeBase64"=${pix.qrCodeBase64 || null},
          "pixExpiresAt"=${pix.expiresAt}, "updatedAt"=NOW()
        WHERE "userId"=${user.id}
      `;
      return sendJson(res, 201, {
        success: true,
        registration: {
          name: user.name,
          username: user.username,
          email: user.email,
          whatsapp: user.whatsapp,
          plan,
          billingMethod,
          priceCents: selectedPrice,
          databaseLimit: PLAN_DATABASE_LIMITS[plan],
          status: "pending_payment",
          trialDays: TRIAL_DAYS,
          trialEndsAt: trialEndsAt.toISOString(),
          marketingOptIn,
        },
        subscription: {
          provider: "asaas",
          providerStatus: pix.status,
          checkoutUrl: pix.checkoutUrl,
          billingMethod,
          trialEndsAt: trialEndsAt.toISOString(),
          pix: {
            paymentId: pix.paymentId,
            qrCode: pix.qrCode,
            qrCodeBase64: pix.qrCodeBase64,
            ticketUrl: pix.checkoutUrl,
            expiresAt: pix.expiresAt,
          },
        },
        message:
          "Cadastro realizado. Seus 7 dias grátis começaram e o Pix anual do Asaas já está disponível.",
      });
    }

    const checkout = await createAsaasCardCheckout({
      userId: Number(user.id),
      plan,
      trialEndsAt,
    });
    await sql`
      UPDATE commercial_subscriptions SET
        provider='asaas', "providerCheckoutId"=${checkout.checkoutId}, "providerStatus"=${checkout.status},
        "checkoutUrl"=${checkout.checkoutUrl}, "externalReference"=${checkout.externalReference}, "updatedAt"=NOW()
      WHERE "userId"=${user.id}
    `;

    return sendJson(res, 201, {
      success: true,
      registration: {
        name: user.name,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        plan,
        billingMethod,
        priceCents: selectedPrice,
        databaseLimit: PLAN_DATABASE_LIMITS[plan],
        status: "pending_payment",
        trialDays: TRIAL_DAYS,
        trialEndsAt: trialEndsAt.toISOString(),
        marketingOptIn,
      },
      subscription: {
        provider: "asaas",
        providerCheckoutId: checkout.checkoutId,
        providerStatus: checkout.status,
        checkoutUrl: checkout.checkoutUrl,
        billingMethod,
        trialEndsAt: trialEndsAt.toISOString(),
      },
      message:
        "Cadastro realizado. Seus 7 dias grátis começaram. Cadastre seu cartão no Asaas; a primeira cobrança será após o período de teste.",
    });
  } catch (error: any) {
    console.error(
      "[auth/register-commercial]",
      error?.providerResponse ?? error
    );
    if (createdUserId) {
      try {
        const sql = getSql();
        await sql`DELETE FROM users WHERE id=${createdUserId} AND "loginMethod"='commercial_signup'`;
      } catch (cleanupError) {
        console.error("[auth/register-commercial/cleanup]", cleanupError);
      }
    }
    if (error?.code === "23505")
      return sendJson(res, 409, {
        success: false,
        message: "Nome de usuário ou e-mail já cadastrado.",
      });
    return sendJson(res, Number(error?.statusCode || 500), {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir o cadastro agora.",
    });
  }
}
