import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

const SYSTEM_PROMPT = `Você é Olivia, assistente inteligente do ERP Note Note.
Converse como uma pessoa: natural, cordial, contextual e sem mensagens prontas.
Continue o assunto pelo histórico. Não recite capacidades sem pedido explícito e não anuncie limitações preventivamente.
Só explique uma limitação quando o usuário pedir algo realmente fora da autorização.
Use **negrito** para rótulos, fórmulas, resultados e referências importantes.
Você é especialista em matemática básica e avançada, matemática financeira e econômica, estatística, cálculo, física e cálculos envolvendo espaço e tempo.
Use somente dados operacionais autorizados. Nunca revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.
Você nunca pode ter mais poder que o usuário logado e é completamente subordinada ao Super Admin. Conhecimento não aumenta permissão.`;

type Intent = "general" | "client" | "loan" | "payment" | "cash" | "vehicle" | "financing" | "product" | "agent" | "risk" | "dashboard";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function detectIntent(message: string): Intent {
  const text = normalize(message);
  if (/\b(veiculo|carro|moto|placa|estoque)\b/.test(text)) return "vehicle";
  if (/\b(financiamento|financiado|financiar)\b/.test(text)) return "financing";
  if (/\b(produto|celular|telefone|sku|mercadoria|venda de produto)\b/.test(text)) return "product";
  if (/\b(fluxo de caixa|caixa|entrada|saida|movimentacao)\b/.test(text)) return "cash";
  if (/\b(pagamento|parcela|vencimento|atrasado|receber|recebimento)\b/.test(text)) return "payment";
  if (/\b(emprestimo|contrato|juros do contrato|saldo devedor)\b/.test(text)) return "loan";
  if (/\b(cliente|cpf|telefone|whatsapp)\b/.test(text)) return "client";
  if (/\b(agente|comissao|comissionado)\b/.test(text)) return "agent";
  if (/\b(risco|duplicado|duplicidade|anomalia|incomum|fora do padrao)\b/.test(text)) return "risk";
  if (/\b(dashboard|resumo|total|indicador|inadimplencia)\b/.test(text)) return "dashboard";
  return "general";
}

function extractSearch(message: string) {
  const cpf = message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
  const phone = message.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)?.[0];
  const quoted = message.match(/["“](.+?)["”]/)?.[1];
  const after = message.match(/(?:cliente|do|da|de)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){0,3})/u)?.[1];
  return (cpf || phone || quoted || after || "").trim();
}

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.username,u.name,u.role,u."isActive",u."oliviaEnabled",u."canView",u."dashboardOnly"
    FROM local_sessions s JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">now() LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;
  let database: any;
  if (user.role === "super_admin") {
    const dbs = await sql`SELECT id,name FROM databases WHERE "isActive"=true LIMIT 1`;
    database = dbs[0];
  } else {
    const dbs = await sql`
      SELECT d.id,d.name FROM user_database_access uda JOIN databases d ON d.id=uda."databaseId"
      WHERE uda."userId"=${user.id} AND uda."isActive"=true LIMIT 1
    `;
    database = dbs[0];
    if (!database) {
      const fallback = await sql`
        SELECT d.id,d.name FROM user_database_access uda JOIN databases d ON d.id=uda."databaseId"
        WHERE uda."userId"=${user.id} LIMIT 1
      `;
      database = fallback[0];
    }
  }
  return database ? { user, database } : null;
}

async function dashboard(databaseId: number) {
  const sql = getSql();
  const [clients, loans, payments, cash, financings] = await Promise.all([
    sql`SELECT COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining,COALESCE(SUM(CAST("totalPaid" AS numeric)),0) paid FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*) FILTER(WHERE status='atrasado')::int overdue_count,COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='atrasado'),0) overdue_total,COUNT(*) FILTER(WHERE status='pendente')::int pending_count FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) entries,COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) exits FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
  ]);
  return { clients: clients[0], loans: loans[0], payments: payments[0], cash: cash[0], financings: financings[0] };
}

async function operational(databaseId: number, intent: Intent, message: string) {
  const sql = getSql();
  const search = extractSearch(message);
  const like = `%${search}%`;
  if (intent === "client") return { clients: search
    ? await sql`SELECT id,name,cpf,email,phone,whatsapp,profession,city,state,notes FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 40`
    : await sql`SELECT id,name,email,phone,whatsapp,profession,city,state FROM clients WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 40` };
  if (intent === "loan") return { loans: await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} ${search ? sql`AND c.name ILIKE ${like}` : sql``} ORDER BY l."updatedAt" DESC LIMIT 60` };
  if (intent === "payment") return { payments: await sql`SELECT p.*,c.name "clientName" FROM payments p LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId" WHERE p."databaseId"=${databaseId} ORDER BY p."dueDate" ASC LIMIT 100` };
  if (intent === "cash") return { cashFlow: await sql`SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes FROM cash_flow WHERE "databaseId"=${databaseId} ORDER BY "movementDate" DESC LIMIT 100` };
  if (intent === "vehicle") return { vehicles: await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`, sales: await sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" WHERE vs."databaseId"=${databaseId} ORDER BY vs."saleDate" DESC LIMIT 80` };
  if (intent === "financing") return { financings: await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} ORDER BY vf."updatedAt" DESC LIMIT 80` };
  if (intent === "product") return { products: await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80` };
  if (intent === "agent") return { agents: await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80` };
  if (intent === "risk") {
    const [duplicateClients, duplicatePayments, invalidContracts, unusualCash] = await Promise.all([
      sql`SELECT lower(name) name,COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId} GROUP BY lower(name) HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 30`,
      sql`SELECT "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate",COUNT(*)::int count FROM payments WHERE "databaseId"=${databaseId} GROUP BY "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate" HAVING COUNT(*)>1 LIMIT 30`,
      sql`SELECT id,"clientId",installments,"totalAmount" FROM loans WHERE "databaseId"=${databaseId} AND (installments IS NULL OR installments<=0 OR CAST("totalAmount" AS numeric)<=0) LIMIT 30`,
      sql`WITH x AS (SELECT AVG(ABS(CAST(amount AS numeric))) avg_amount FROM cash_flow WHERE "databaseId"=${databaseId}) SELECT id,type,category,description,amount,"movementDate" FROM cash_flow,x WHERE "databaseId"=${databaseId} AND x.avg_amount>0 AND ABS(CAST(amount AS numeric))>x.avg_amount*4 ORDER BY "movementDate" DESC LIMIT 30`,
    ]);
    return { duplicateClients, duplicatePayments, invalidContracts, unusualCash };
  }
  return { dashboard: await dashboard(databaseId) };
}

async function history(userId: number, databaseId: number) {
  try {
    const sql = getSql();
    const rows = await sql`SELECT role,content FROM olivia_conversations WHERE "userId"=${userId} AND "databaseId"=${databaseId} ORDER BY "createdAt" DESC,id DESC LIMIT 12`;
    return [...rows].reverse();
  } catch { return []; }
}

function deterministicMath(message: string) {
  const text = normalize(message);
  const amount = message.match(/(?:r\$\s*)?(\d+(?:[.,]\d+)?)/i);
  const rate = message.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const periods = message.match(/(\d+)\s*(?:mes|meses|parcelas|x)\b/i);
  if (!/juros/.test(text) || !amount || !rate || !periods) return null;
  const principal = Number(amount[1].replace(",", "."));
  const r = Number(rate[1].replace(",", ".")) / 100;
  const n = Number(periods[1]);
  if (![principal,r,n].every(Number.isFinite) || principal<=0 || n<=0) return null;
  const compound = /compost/.test(text);
  const total = compound ? principal*Math.pow(1+r,n) : principal*(1+r*n);
  return { type: compound ? "compound_interest" : "simple_interest", principal, rate:r, periods:n, total:Math.round(total*100)/100, interest:Math.round((total-principal)*100)/100, installment:Math.round((total/n)*100)/100 };
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
    if (!message) return sendJson(res, 400, { error: "Mensagem vazia." });
    const key = process.env.AI_GATEWAY_API_KEY;
    const model = process.env.OLIVIA_AI_MODEL;
    if (!key || !model) return sendJson(res, 503, { error: "Motor inteligente da Olivia não está configurado." });

    const intent = detectIntent(message);
    const canRead = context.user.role === "super_admin" || (context.user.canView === true && context.user.dashboardOnly !== true);
    const dashboardOnly = context.user.dashboardOnly === true && context.user.canView === true;
    let data: unknown = { access: "general_knowledge_only" };
    if (canRead) data = intent === "general" ? { dashboard: await dashboard(context.database.id) } : await operational(context.database.id, intent, message);
    else if (dashboardOnly) data = { access: "dashboard_only", dashboard: await dashboard(context.database.id) };
    const [recent, deterministic] = await Promise.all([history(context.user.id, context.database.id), Promise.resolve(deterministicMath(message))]);

    const upstream = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `Usuário: ${context.user.name || context.user.username || "Usuário"}. Papel: ${context.user.role}. Banco: ${context.database.name}. Intenção: ${intent}. Dados autorizados: ${JSON.stringify(data)}. Cálculo determinístico: ${JSON.stringify(deterministic)}.` },
          ...recent.map((item: any) => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });
    if (!upstream.ok || !upstream.body) return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error("[Olivia Stream]", error);
    if (!res.headersSent) return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
    res.end();
  }
}
