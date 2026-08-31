import bcrypt from "bcrypt";
import { ensureAuthUserColumns, getSql, readJsonBody, sendJson } from "./_shared.js";
import { verifyLoginCaptcha } from "../../shared/login-captcha.js";

const MERCADO_PAGO_API = "https://api.mercadopago.com";
const CHECKOUT_RETURN_URL = "https://notenote.com.br/login?assinatura=retorno";
const TRIAL_DAYS = 7;

const MONTHLY_PRICES = { basic: 2990, plus: 4990 } as const;
const ANNUAL_PIX_PRICES = { basic: 19990, plus: 39990 } as const;
const PLAN_DATABASE_LIMITS = { basic: 1, plus: 3 } as const;
const PLAN_LABELS = { basic: "Basic", plus: "Plus" } as const;

type CommercialPlan = keyof typeof MONTHLY_PRICES;
type BillingMethod = "card_monthly" | "pix_annual";

function isCommercialPlan(value: string): value is CommercialPlan {
  return value === "basic" || value === "plus";
}
function isBillingMethod(value: string): value is BillingMethod {
  return value === "card_monthly" || value === "pix_annual";
}
function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function isValidUsername(value: string) { return /^[A-Za-z0-9._-]{3,40}$/.test(value); }
function isValidCommercialPassword(value: string) { return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value); }
function isValidFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return value.trim().length >= 5 && value.trim().length <= 200 && parts.length >= 2;
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
function formatStoredWhatsapp(value: string) { return `+55${normalizeBrazilWhatsapp(value)}`; }
function trialEndDate() { return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000); }
function priceFor(plan: CommercialPlan, billingMethod: BillingMethod) {
  return billingMethod === "pix_annual" ? ANNUAL_PIX_PRICES[plan] : MONTHLY_PRICES[plan];
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
      ADD COLUMN IF NOT EXISTS "providerStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "checkoutUrl" text,
      ADD COLUMN IF NOT EXISTS "externalReference" varchar(160),
      ADD COLUMN IF NOT EXISTS "lastPaymentStatus" varchar(40),
      ADD COLUMN IF NOT EXISTS "lastPaymentId" varchar(120),
      ADD COLUMN IF NOT EXISTS "lastWebhookAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "billingMethod" varchar(30) NOT NULL DEFAULT 'card_monthly',
      ADD COLUMN IF NOT EXISTS "trialEndsAt" timestamptz
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
      allowed_count := CASE WHEN user_plan = 'basic' THEN 1 WHEN user_plan = 'plus' THEN 3 ELSE 0 END;
      IF allowed_count = 0 THEN RAISE EXCEPTION 'Plano comercial não definido para este usuário.' USING ERRCODE = 'P0001'; END IF;
      PERFORM pg_advisory_xact_lock(NEW."userId"::bigint);
      SELECT COUNT(*)::integer INTO current_count FROM user_database_access WHERE "userId" = NEW."userId";
      IF current_count >= allowed_count THEN
        RAISE EXCEPTION 'Limite de bancos excedido para o plano %. Basic permite 1 banco e Plus permite 3 bancos.', user_plan USING ERRCODE = 'P0001';
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

async function createMercadoPagoSubscription(args: {
  userId: number;
  email: string;
  plan: CommercialPlan;
  billingMethod: BillingMethod;
  trialEndsAt: Date;
}) {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
  if (!accessToken) throw Object.assign(new Error("Mercado Pago ainda não está configurado no servidor."), { statusCode: 503 });

  const isAnnual = args.billingMethod === "pix_annual";
  const externalReference = `notenote:${args.userId}:${args.plan}:${args.billingMethod}`;
  const response = await fetch(`${MERCADO_PAGO_API}/preapproval`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: isAnnual
        ? `Note Note - Plano ${PLAN_LABELS[args.plan]} Anual Pix`
        : `Note Note - Plano ${PLAN_LABELS[args.plan]} Mensal`,
      external_reference: externalReference,
      payer_email: args.email,
      auto_recurring: {
        frequency: isAnnual ? 12 : 1,
        frequency_type: "months",
        start_date: args.trialEndsAt.toISOString(),
        transaction_amount: priceFor(args.plan, args.billingMethod) / 100,
        currency_id: "BRL",
      },
      back_url: CHECKOUT_RETURN_URL,
      status: "pending",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id || !data?.init_point) {
    console.error("[mercadopago/create-subscription]", { status: response.status, code: data?.code, message: data?.message });
    throw Object.assign(new Error("Não foi possível iniciar o pagamento no Mercado Pago."), { statusCode: 502 });
  }
  return {
    id: String(data.id),
    status: String(data.status ?? "pending"),
    checkoutUrl: String(data.init_point),
    externalReference,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return sendJson(res, 405, { success: false, message: "Método não permitido." });
  let createdUserId: number | null = null;

  try {
    const body = await readJsonBody(req);
    const name = String(body?.name ?? "").trim();
    const username = String(body?.username ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const whatsappInput = String(body?.whatsapp ?? "").trim();
    const plan = String(body?.plan ?? "").trim().toLowerCase();
    const billingMethodInput = String(body?.billingMethod ?? "card_monthly").trim().toLowerCase();
    const captchaToken = String(body?.captchaToken ?? "");
    const captchaAnswer = String(body?.captchaAnswer ?? "");

    if (!isCommercialPlan(plan)) return sendJson(res, 400, { success: false, message: "Escolha um plano Basic ou Plus antes de se cadastrar." });
    if (!isBillingMethod(billingMethodInput)) return sendJson(res, 400, { success: false, message: "Escolha pagamento mensal no cartão ou anual no Pix." });
    const billingMethod = billingMethodInput as BillingMethod;
    if (!isValidFullName(name)) return sendJson(res, 400, { success: false, message: "Informe seu nome e sobrenome completos." });
    if (!isValidUsername(username)) return sendJson(res, 400, { success: false, message: "O nome de usuário deve ter de 3 a 40 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado." });
    if (!isValidEmail(email)) return sendJson(res, 400, { success: false, message: "Informe um e-mail válido." });
    if (!isValidCommercialPassword(password)) return sendJson(res, 400, { success: false, message: "A senha deve ter no mínimo 8 caracteres, pelo menos uma letra maiúscula e pelo menos um número." });
    if (!isValidBrazilWhatsapp(whatsappInput)) return sendJson(res, 400, { success: false, message: "Informe um WhatsApp brasileiro válido com DDD e número iniciado por 9." });
    if (!verifyLoginCaptcha(captchaToken, captchaAnswer)) return sendJson(res, 400, { success: false, message: "Confirme corretamente que você não é um robô." });

    await ensureAuthUserColumns();
    await ensureCommercialSubscriptionTable();
    const sql = getSql();
    const existing = await sql`SELECT id, username, email FROM users WHERE lower(username)=lower(${username}) OR lower(email)=lower(${email}) LIMIT 1`;
    if (existing[0]) {
      const sameUsername = String(existing[0].username || "").toLowerCase() === username.toLowerCase();
      return sendJson(res, 409, { success: false, message: sameUsername ? "Este nome de usuário já está em uso." : "Este e-mail já está cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const whatsapp = formatStoredWhatsapp(whatsappInput);
    const trialEndsAt = trialEndDate();
    const created = await sql`
      INSERT INTO users (
        username, "passwordHash", name, email, whatsapp, "loginMethod", role,
        "canView", "canInsert", "canEdit", "canDelete", "canGenerateReports",
        "canAccessSettings", "dashboardOnly", "failedLoginAttempts", "isActive",
        "emailVerified", "createdAt", "updatedAt", "lastSignedIn"
      ) VALUES (
        ${username}, ${passwordHash}, ${name}, ${email}, ${whatsapp}, 'commercial_signup', 'user',
        true, true, true, true, true, false, false, 0, true, false, NOW(), NOW(), NOW()
      ) RETURNING id, username, email, name, whatsapp
    `;
    const user = created[0] as any;
    createdUserId = Number(user.id);
    const selectedPrice = priceFor(plan, billingMethod);

    await sql`
      INSERT INTO commercial_subscriptions (
        "userId", plan, "priceCents", status, source, provider, "billingMethod", "trialEndsAt", "createdAt", "updatedAt"
      ) VALUES (
        ${user.id}, ${plan}, ${selectedPrice}, 'active', 'commercial_signup', 'mercadopago',
        ${billingMethod}, ${trialEndsAt.toISOString()}, NOW(), NOW()
      )
    `;

    const mercadoPago = await createMercadoPagoSubscription({ userId: Number(user.id), email: String(user.email), plan, billingMethod, trialEndsAt });
    await sql`
      UPDATE commercial_subscriptions SET
        "providerSubscriptionId"=${mercadoPago.id}, "providerStatus"=${mercadoPago.status},
        "checkoutUrl"=${mercadoPago.checkoutUrl}, "externalReference"=${mercadoPago.externalReference}, "updatedAt"=NOW()
      WHERE "userId"=${user.id}
    `;

    return sendJson(res, 201, {
      success: true,
      registration: {
        name: user.name, username: user.username, email: user.email, whatsapp: user.whatsapp,
        plan, billingMethod, priceCents: selectedPrice, databaseLimit: PLAN_DATABASE_LIMITS[plan],
        status: "active", trialDays: TRIAL_DAYS, trialEndsAt: trialEndsAt.toISOString(),
      },
      subscription: {
        provider: "mercadopago", providerSubscriptionId: mercadoPago.id,
        providerStatus: mercadoPago.status, checkoutUrl: mercadoPago.checkoutUrl,
        billingMethod, trialEndsAt: trialEndsAt.toISOString(),
      },
      message: "Cadastro realizado. Seus 7 dias grátis começaram. Autorize a cobrança no Mercado Pago para continuar após o teste.",
    });
  } catch (error: any) {
    console.error("[auth/register-commercial]", error);
    if (createdUserId) {
      try {
        const sql = getSql();
        await sql`DELETE FROM users WHERE id=${createdUserId} AND "loginMethod"='commercial_signup'`;
      } catch (cleanupError) { console.error("[auth/register-commercial/cleanup]", cleanupError); }
    }
    if (error?.code === "23505") return sendJson(res, 409, { success: false, message: "Nome de usuário ou e-mail já cadastrado." });
    return sendJson(res, Number(error?.statusCode || 500), { success: false, message: error instanceof Error ? error.message : "Não foi possível concluir o cadastro agora." });
  }
}
