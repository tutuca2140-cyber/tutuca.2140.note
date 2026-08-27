import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";
import {
  getAllowedOliviaActions,
  isForbiddenOliviaAdministrativeRequest,
} from "../shared/olivia-policy";

const ACTION_HINT = /\b(criar|cadastrar|registrar|lançar|lancar|atualizar|alterar|editar|marcar|incluir)\b/i;

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.username, u.name, u.role, u."isActive", u."oliviaEnabled",
           u."canView", u."canInsert", u."canEdit", u."dashboardOnly"
    FROM local_sessions s
    JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token} AND s."expiresAt" > now()
    LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;

  let database: any;
  if (user.role === "super_admin") {
    const dbs = await sql`SELECT id, name FROM databases WHERE "isActive" = true LIMIT 1`;
    database = dbs[0];
  } else {
    const dbs = await sql`
      SELECT d.id, d.name
      FROM user_database_access uda
      JOIN databases d ON d.id = uda."databaseId"
      WHERE uda."userId" = ${user.id} AND uda."isActive" = true
      LIMIT 1
    `;
    database = dbs[0];
  }
  if (!database) return null;
  return { user, database };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método não permitido." });
  }

  try {
    const context = await getContext(req);
    if (!context) return sendJson(res, 403, { error: "Acesso à Olivia não autorizado." });
    const body = await readJsonBody(req);
    const message = String(body?.message ?? "").trim().slice(0, 4000);
    if (!message || !ACTION_HINT.test(message)) return sendJson(res, 200, { action: null });

    if (isForbiddenOliviaAdministrativeRequest(message)) {
      return sendJson(res, 200, {
        action: null,
        blocked: true,
        reply: "Essa operação não pode ser executada pela Olivia. Ela envolve exclusão, usuários, credenciais ou permissões e precisa ser realizada diretamente na área administrativa autorizada.",
      });
    }

    const allowed = getAllowedOliviaActions(context.user);
    if (!allowed.length) {
      return sendJson(res, 200, {
        action: null,
        blocked: true,
        reply: "Sua conta não possui permissão para executar alterações por aqui. Posso continuar consultando e analisando os dados que estiverem dentro do seu acesso.",
      });
    }

    const key = process.env.AI_GATEWAY_API_KEY;
    const model = process.env.OLIVIA_AI_MODEL;
    if (!key || !model) return sendJson(res, 200, { action: null });

    const sql = getSql();
    const clients = context.user.canView || context.user.role === "super_admin"
      ? await sql`SELECT id, name, phone, whatsapp FROM clients WHERE "databaseId" = ${context.database.id} ORDER BY "updatedAt" DESC LIMIT 80`
      : [];
    const loans = context.user.canView || context.user.role === "super_admin"
      ? await sql`SELECT id, "clientId", amount, "remainingBalance", installments, status FROM loans WHERE "databaseId" = ${context.database.id} ORDER BY "updatedAt" DESC LIMIT 80`
      : [];

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Você transforma pedidos explícitos de alteração no ERP Note Note em uma ação estruturada. Ações permitidas: ${allowed.join(", ")}. Nunca gere delete, gestão de usuários, permissões ou credenciais. Nunca invente campos ausentes. Se faltarem dados necessários, retorne {"action":null,"missing":[...],"question":"..."}. Para uma ação válida retorne {"action":"...","payload":{...},"summary":"descrição clara para confirmação"}. create_client aceita name,birthDate,email,phone,whatsapp,profession,address,city,state,zipCode,notes. update_client exige id e campos a alterar. create_loan exige clientId,amount,interestType,interestRate,ratePeriod,installments,startDate e pode incluir endDate,description. record_payment exige loanId ou vehicleFinancingId, installmentNumber, amount, paymentDate,dueDate,status e pode incluir notes. Datas em ISO YYYY-MM-DD. Valores monetários como string decimal.`,
          },
          { role: "system", content: `Banco: ${context.database.name}. Clientes disponíveis: ${JSON.stringify(clients)}. Empréstimos disponíveis: ${JSON.stringify(loans)}.` },
          { role: "user", content: message },
        ],
      }),
    });
    if (!response.ok) return sendJson(res, 200, { action: null });
    const data = (await response.json()) as any;
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return sendJson(res, 200, { action: null });
    let plan: any;
    try { plan = JSON.parse(raw); } catch { return sendJson(res, 200, { action: null }); }
    if (plan.action && !allowed.includes(plan.action)) return sendJson(res, 200, { action: null });
    return sendJson(res, 200, plan);
  } catch (error) {
    console.error("[Olivia Action Plan]", error);
    return sendJson(res, 500, { error: "Não foi possível preparar essa ação agora." });
  }
}
