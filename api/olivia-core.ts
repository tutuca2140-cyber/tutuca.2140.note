import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

type ChatRow = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `Você é Olivia, assistente virtual do ERP Note Note.

Converse como uma ótima assistente humana: natural, direta, atenta ao contexto e sem frases prontas.
Responda primeiro ao que o usuário realmente perguntou. Não recite capacidades, regras ou avisos desnecessários.
Use o histórico para entender referências como "ele", "ela", "esse cliente", "aquele contrato", "o restante", "metade", "agora" e "o anterior".
Se a pergunta for simples, responda de forma simples. Se for técnica, aprofunde o necessário.
Não finja sentimentos, ações ou certezas que não existem.

Quando houver dados do Note Note no contexto:
- trate os dados retornados pelo servidor como fonte primária;
- cruze módulos quando isso for útil;
- diferencie fato, cálculo e interpretação;
- nunca invente valor ou cadastro ausente;
- se os dados forem insuficientes, diga exatamente o que conseguiu confirmar.

Você domina matemática básica e avançada, matemática financeira e econômica, estatística, física e cálculos de tempo, distância, velocidade e datas.

Segurança:
- trabalhe apenas no banco autorizado informado pelo servidor;
- nunca misture bancos;
- nunca acesse, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais;
- nunca tenha mais autoridade que o usuário logado.
`;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractSearch(message: string, history: ChatRow[]) {
  const cpf = message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
  const phone = message.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)?.[0];
  const quoted = message.match(/["“](.+?)["”]/)?.[1];
  const name = message.match(/(?:cliente|do|da|de)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){0,3})/u)?.[1];
  const direct = cpf || phone || quoted || name;
  if (direct) return direct.trim();

  const text = normalize(message);
  if (!/\b(ele|ela|dele|dela|esse|essa|este|esta|aquele|aquela|mesmo|mesma|restante|metade|agora|anterior)\b/.test(text)) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const previous = history[i].content;
    const found = previous.match(/["“](.+?)["”]/)?.[1]
      || previous.match(/(?:cliente|do|da|de)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){0,3})/u)?.[1];
    if (found) return found.trim();
  }
  return "";
}

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;

  const rows = await sql`
    SELECT u.id,u.username,u.name,u.role,u."isActive",u."oliviaEnabled",u."canView",u."dashboardOnly"
    FROM local_sessions s
    JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">now()
    LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;

  let database: any;
  if (user.role === "super_admin") {
    const dbs = await sql`SELECT id,name FROM databases WHERE "isActive"=true ORDER BY id LIMIT 1`;
    database = dbs[0];
  } else {
    const dbs = await sql`
      SELECT d.id,d.name
      FROM user_database_access uda
      JOIN databases d ON d.id=uda."databaseId"
      WHERE uda."userId"=${user.id} AND uda."isActive"=true
      ORDER BY d.id
      LIMIT 1
    `;
    database = dbs[0];
    if (!database) {
      const fallback = await sql`
        SELECT d.id,d.name
        FROM user_database_access uda
        JOIN databases d ON d.id=uda."databaseId"
        WHERE uda."userId"=${user.id}
        ORDER BY d.id
        LIMIT 1
      `;
      database = fallback[0];
    }
  }
  return database ? { user, database } : null;
}

async function getHistory(userId: number, databaseId: number): Promise<ChatRow[]> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT role,content
      FROM olivia_conversations
      WHERE "userId"=${userId} AND "databaseId"=${databaseId}
      ORDER BY "createdAt" DESC,id DESC
      LIMIT 16
    `;
    return [...rows].reverse() as ChatRow[];
  } catch {
    return [];
  }
}

async function summary360(databaseId: number) {
  const sql = getSql();
  const [clients, loans, payments, cash, financings, vehicles, products, agents] = await Promise.all([
    sql`SELECT COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COALESCE(SUM(CAST(amount AS numeric)),0) principal,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining,
      COALESCE(SUM(CAST("totalPaid" AS numeric)),0) paid
      FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COUNT(*) FILTER(WHERE status='atrasado' OR (status<>'pago' AND "dueDate"::date<CURRENT_DATE))::int overdue_count,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pago'),0) paid,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pendente'),0) pending,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='atrasado' OR (status<>'pago' AND "dueDate"::date<CURRENT_DATE)),0) overdue
      FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT
      COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) entries,
      COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) exits
      FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM vehicles WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM products WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM agents WHERE "databaseId"=${databaseId}`,
  ]);
  const entries = Number((cash[0] as any)?.entries || 0);
  const exits = Number((cash[0] as any)?.exits || 0);
  return {
    clients: clients[0],
    loans: loans[0],
    payments: payments[0],
    cash: { ...(cash[0] as any), net: Math.round((entries - exits) * 100) / 100 },
    financings: financings[0],
    vehicles: vehicles[0],
    products: products[0],
    agents: agents[0],
  };
}

async function client360(databaseId: number, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clients = await sql`
    SELECT id,name,cpf,email,phone,whatsapp,profession,city,state,notes,"createdAt","updatedAt"
    FROM clients
    WHERE "databaseId"=${databaseId}
      AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like})
    ORDER BY "updatedAt" DESC
    LIMIT 8
  `;
  if (!clients.length) return { search, clients: [] };

  const ids = (clients as any[]).map(row => row.id);
  const [loans, payments, interestHistory, financings, vehicles, sales, cash] = await Promise.all([
    sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY l."updatedAt" DESC LIMIT 80`,
    sql`SELECT p.*,COALESCE(c.name,fc.name) "clientName" FROM payments p LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId" LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId" LEFT JOIN clients fc ON fc.id=vf."clientId" WHERE p."databaseId"=${databaseId} AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids})) ORDER BY p."dueDate" DESC LIMIT 120`,
    sql`SELECT h.*,l."clientId" FROM loan_interest_history h JOIN loans l ON l.id=h."loanId" WHERE h."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY h."createdAt" DESC LIMIT 80`,
    sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND vf."clientId"=ANY(${ids}) ORDER BY vf."updatedAt" DESC LIMIT 80`,
    sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "updatedAt" DESC LIMIT 60`,
    sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" WHERE vs."databaseId"=${databaseId} AND vs."clientId"=ANY(${ids}) ORDER BY vs."saleDate" DESC LIMIT 60`,
    sql`SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes FROM cash_flow WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "movementDate" DESC LIMIT 80`,
  ]);
  return { search, clients, loans, payments, interestHistory, financings, vehicles, vehicleSales: sales, cashFlow: cash };
}

async function paymentContext(databaseId: number, search: string, text: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clientIds = search ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 12` : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const overdue = /\b(atras|inadimpl|vencid)\b/.test(text);
  const today = /\b(hoje)\b/.test(text);
  const week = /\b(semana)\b/.test(text);
  const month = /\b(mes|mês)\b/.test(text);
  const rows = await sql`
    SELECT p.*,COALESCE(c.name,fc.name) "clientName"
    FROM payments p
    LEFT JOIN loans l ON l.id=p."loanId"
    LEFT JOIN clients c ON c.id=l."clientId"
    LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId"
    LEFT JOIN clients fc ON fc.id=vf."clientId"
    WHERE p."databaseId"=${databaseId}
      ${ids.length ? sql`AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids}))` : sql``}
      ${overdue ? sql`AND (p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE))` : sql``}
      ${today ? sql`AND p."dueDate"::date=CURRENT_DATE` : sql``}
      ${week ? sql`AND p."dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE+6` : sql``}
      ${month ? sql`AND p."dueDate"::date >= date_trunc('month',CURRENT_DATE)::date AND p."dueDate"::date < (date_trunc('month',CURRENT_DATE)+interval '1 month')::date` : sql``}
    ORDER BY p."dueDate" ASC
    LIMIT 140
  `;
  const totals = (rows as any[]).reduce((acc, row) => {
    const amount = Number(row.amount || 0);
    acc.total += amount;
    if (row.status === "pago") acc.paid += amount;
    else if (row.status === "atrasado" || (row.dueDate && new Date(row.dueDate) < new Date())) acc.overdue += amount;
    else acc.pending += amount;
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0 });
  return { search: search || null, totals, rows };
}

async function cashContext(databaseId: number, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clientIds = search ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 12` : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const rows = await sql`
    SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes
    FROM cash_flow
    WHERE "databaseId"=${databaseId}
      ${ids.length ? sql`AND "clientId"=ANY(${ids})` : sql``}
    ORDER BY "movementDate" DESC
    LIMIT 120
  `;
  const totals = (rows as any[]).reduce((acc, row) => {
    const amount = Number(row.amount || 0);
    if (row.type === "ENTRADA") acc.entries += amount;
    if (row.type === "SAIDA") acc.exits += amount;
    return acc;
  }, { entries: 0, exits: 0 });
  return { search: search || null, totals: { ...totals, net: Math.round((totals.entries - totals.exits) * 100) / 100 }, rows };
}

async function portfolioContext(databaseId: number) {
  const sql = getSql();
  return await sql`
    SELECT c.id,c.name,c.phone,c.whatsapp,
      COALESCE(l.loan_count,0)::int "loanCount",
      COALESCE(l.loan_remaining,0) "loanRemaining",
      COALESCE(p.overdue_count,0)::int "overdueCount",
      COALESCE(p.overdue_amount,0) "overdueAmount",
      COALESCE(p.paid_amount,0) "paidAmount",
      COALESCE(f.financing_count,0)::int "financingCount",
      COALESCE(f.financing_remaining,0) "financingRemaining"
    FROM clients c
    LEFT JOIN (
      SELECT "clientId",COUNT(*) loan_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) loan_remaining
      FROM loans WHERE "databaseId"=${databaseId} GROUP BY "clientId"
    ) l ON l."clientId"=c.id
    LEFT JOIN (
      SELECT l."clientId",COUNT(*) FILTER(WHERE p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE)) overdue_count,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE)),0) overdue_amount,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='pago'),0) paid_amount
      FROM payments p JOIN loans l ON l.id=p."loanId"
      WHERE p."databaseId"=${databaseId}
      GROUP BY l."clientId"
    ) p ON p."clientId"=c.id
    LEFT JOIN (
      SELECT "clientId",COUNT(*) financing_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) financing_remaining
      FROM "vehicleFinancings" WHERE "databaseId"=${databaseId} GROUP BY "clientId"
    ) f ON f."clientId"=c.id
    WHERE c."databaseId"=${databaseId}
    ORDER BY (COALESCE(l.loan_remaining,0)+COALESCE(f.financing_remaining,0)+COALESCE(p.overdue_amount,0)) DESC
    LIMIT 80
  `;
}

async function moduleLists(databaseId: number, text: string, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const data: Record<string, unknown> = {};

  if (/\b(emprestimo|contrato|juros|saldo devedor)\b/.test(text)) {
    data.loans = search
      ? await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY l."updatedAt" DESC LIMIT 100`
      : await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} ORDER BY l."updatedAt" DESC LIMIT 100`;
  }
  if (/\b(financiamento|financiado)\b/.test(text)) {
    data.financings = search
      ? await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY vf."updatedAt" DESC LIMIT 100`
      : await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} ORDER BY vf."updatedAt" DESC LIMIT 100`;
  }
  if (/\b(veiculo|carro|moto|placa)\b/.test(text)) {
    data.vehicles = search
      ? await sql`SELECT v.*,c.name "clientName" FROM vehicles v LEFT JOIN clients c ON c.id=v."clientId" WHERE v."databaseId"=${databaseId} AND (v.brand ILIKE ${like} OR v.model ILIKE ${like} OR v.plate ILIKE ${like} OR c.name ILIKE ${like}) ORDER BY v."updatedAt" DESC LIMIT 100`
      : await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 100`;
  }
  if (/\b(produto|celular|mercadoria|sku)\b/.test(text)) {
    data.products = search
      ? await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR category ILIKE ${like} OR sku ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 100`
      : await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 100`;
  }
  if (/\b(agente|comissao|comissionado)\b/.test(text)) {
    data.agents = search
      ? await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} AND name ILIKE ${like} ORDER BY "updatedAt" DESC LIMIT 80`
      : await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`;
  }
  return data;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método não permitido." });
  }

  try {
    const startedAt = Date.now();
    const context = await getContext(req);
    if (!context) return sendJson(res, 403, { error: "Acesso à Olivia não autorizado." });

    const body = await readJsonBody(req);
    const message = String(body?.message ?? "").trim().slice(0, 4000);
    if (!message) return sendJson(res, 400, { error: "Mensagem vazia." });

    const key = process.env.AI_GATEWAY_API_KEY;
    const model = process.env.OLIVIA_AI_MODEL;
    if (!key || !model) return sendJson(res, 503, { error: "Motor inteligente da Olivia não está configurado." });

    const recent = await getHistory(context.user.id, context.database.id);
    const search = extractSearch(message, recent);
    const text = normalize(message);
    const canRead = context.user.role === "super_admin" || (context.user.canView === true && context.user.dashboardOnly !== true);
    const dashboardOnly = context.user.dashboardOnly === true && context.user.canView === true;

    const wantsClient = Boolean(search) || /\b(cliente|cpf|telefone|whatsapp)\b/.test(text);
    const wantsPayments = /\b(parcela|pagamento|vencimento|atras|inadimpl|receber|recebimento)\b/.test(text);
    const wantsCash = /\b(caixa|entrada|saida|movimentacao|fluxo)\b/.test(text);
    const wantsPortfolio = /\b(carteira|risco|problema|pior cliente|maior devedor|inadimpl|concentracao|negocio|dashboard|resumo|indicador)\b/.test(text);
    const wantsOperational = wantsClient || wantsPayments || wantsCash || wantsPortfolio || /\b(emprestimo|contrato|financiamento|veiculo|carro|moto|produto|celular|agente|comissao)\b/.test(text);

    let operational: Record<string, unknown> = {};
    if (canRead && wantsOperational) {
      const jobs: Array<Promise<[string, unknown]>> = [];
      jobs.push(summary360(context.database.id).then(value => ["summary360", value]));
      if (wantsClient && search) jobs.push(client360(context.database.id, search).then(value => ["client360", value]));
      if (wantsPayments) jobs.push(paymentContext(context.database.id, search, text).then(value => ["payments", value]));
      if (wantsCash) jobs.push(cashContext(context.database.id, search).then(value => ["cashFlow", value]));
      if (wantsPortfolio) jobs.push(portfolioContext(context.database.id).then(value => ["portfolio", value]));
      jobs.push(moduleLists(context.database.id, text, search).then(value => ["modules", value]));
      operational = Object.fromEntries(await Promise.all(jobs));
    } else if (dashboardOnly && wantsOperational) {
      operational = { access: "dashboard_only", summary360: await summary360(context.database.id) };
    }

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Banco autorizado único: ${context.database.name} (#${context.database.id}). Usuário: ${context.user.name || context.user.username || "Usuário"}. Busca contextual: ${search || "nenhuma"}. Dados operacionais autorizados relevantes: ${JSON.stringify(operational)}.`,
          },
          ...recent.map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[Olivia Core] AI gateway status", response.status);
      return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });
    }

    const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return sendJson(res, 502, { error: "A Olivia não retornou uma resposta válida." });

    console.log("[Olivia Core] success", { ms: Date.now() - startedAt, operational: Object.keys(operational), hasSearch: Boolean(search) });
    return sendJson(res, 200, { reply, databaseId: context.database.id, search: search || null });
  } catch (error) {
    console.error("[Olivia Core]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
