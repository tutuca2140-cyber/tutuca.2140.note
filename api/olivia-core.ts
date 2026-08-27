import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

type ChatRow = { role: "user" | "assistant"; content: string };
type OliviaSettings = {
  enabled: boolean;
  allowClientQueries: boolean;
  allowContractQueries: boolean;
  allowPaymentQueries: boolean;
  allowDueDateQueries: boolean;
  allowSummaries: boolean;
  allowChanges: boolean;
  requireConfirmation: boolean;
};

const SYSTEM_PROMPT = `Você é Olivia, a assistente virtual inteligente do ERP Note Note.

INTERAÇÃO HUMANA
- Converse de forma natural, fluida, direta e contextual, como uma excelente assistente profissional.
- Responda primeiro ao que a pessoa realmente perguntou.
- Não recite capacidades, regras ou limitações sem necessidade.
- Use o histórico para entender referências como ele, ela, esse cliente, aquele contrato, o restante, metade, agora e o anterior.
- Não use respostas sociais pré-programadas; formule cada resposta considerando a conversa atual.
- Adapte o nível técnico e o tamanho da resposta à pergunta.
- Se houver ambiguidade, use o contexto disponível antes de pedir esclarecimento.
- Não finja sentimentos, experiências, ações ou certezas que não existem.

RACIOCÍNIO E DADOS
- Os dados fornecidos pelo servidor são a fonte primária para fatos e valores do Note Note.
- Cruze módulos quando isso melhorar a resposta.
- Diferencie fato encontrado, cálculo e interpretação analítica.
- Nunca invente clientes, contratos, valores, pagamentos ou movimentações ausentes.
- Para números financeiros, use os valores calculados ou agregados pelo servidor; não refaça de memória um valor que já foi fornecido.
- Se houver dados de lista limitados, não trate a lista como total; use os agregados exatos fornecidos.
- Se uma categoria estiver bloqueada pelo Super Admin e o usuário pedir exatamente essa informação, informe a restrição de forma curta. Não anuncie restrições preventivamente.

CONHECIMENTO
- Você domina matemática básica e avançada, álgebra, geometria, trigonometria, cálculo, estatística e probabilidade.
- Você domina matemática financeira e econômica: juros simples e compostos, amortização, VP, VF, TIR, VPL, taxas equivalentes, elasticidade, otimização e séries temporais.
- Você domina física, mecânica, energia, termodinâmica, eletricidade, ondas, óptica e fundamentos de relatividade.
- Você sabe calcular intervalos de tempo, datas, distância, velocidade, aceleração, escalas e conversões.

AUTORIDADE
- Trabalhe somente no banco de dados autorizado informado pelo servidor.
- Nunca misture bancos diferentes.
- Nunca acesse, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.
- Nunca tenha mais autoridade que o usuário logado e permaneça subordinada ao Super Admin.
- Esta versão é somente de consulta e análise operacional; não modifique dados.
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

  if (!/\b(ele|ela|dele|dela|esse|essa|este|esta|aquele|aquela|mesmo|mesma|restante|metade|agora|anterior)\b/.test(normalize(message))) {
    return "";
  }
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].role !== "user") continue;
    const previous = history[index].content;
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

  const settingsRows = await sql`
    SELECT enabled,"allowClientQueries","allowContractQueries","allowPaymentQueries",
      "allowDueDateQueries","allowSummaries","allowChanges","requireConfirmation"
    FROM olivia_settings
    ORDER BY id
    LIMIT 1
  `;
  const settings = (settingsRows[0] || {
    enabled: true,
    allowClientQueries: true,
    allowContractQueries: true,
    allowPaymentQueries: true,
    allowDueDateQueries: true,
    allowSummaries: true,
    allowChanges: false,
    requireConfirmation: true,
  }) as OliviaSettings;
  if (!settings.enabled) return null;

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
    if (!database && user.role === "admin") {
      const compatibility = await sql`SELECT id,name FROM databases WHERE "isActive"=true ORDER BY id LIMIT 1`;
      database = compatibility[0];
    }
  }
  return database ? { user, database, settings } : null;
}

async function getHistory(userId: number, databaseId: number): Promise<ChatRow[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT role,content
      FROM olivia_conversations
      WHERE "userId"=${userId} AND "databaseId"=${databaseId}
      ORDER BY "createdAt" DESC,id DESC
      LIMIT 18
    `;
    return [...rows].reverse() as ChatRow[];
  } catch {
    return [];
  }
}

async function summary360(databaseId: number) {
  const sql = getSql();
  const [clients, loans, payments, cash, financings, vehicles, sales, products, agents] = await Promise.all([
    sql`SELECT COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COALESCE(SUM(CAST(amount AS numeric)),0) principal,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining,
      COALESCE(SUM(CAST("totalPaid" AS numeric)),0) paid
      FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COUNT(*) FILTER(WHERE status='atrasado' OR (status<>'pago' AND "dueDate"::date<CURRENT_DATE))::int overdue_count,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pago'),0) paid,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status<>'pago' AND "dueDate"::date>=CURRENT_DATE),0) pending,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='atrasado' OR (status<>'pago' AND "dueDate"::date<CURRENT_DATE)),0) overdue
      FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT
      COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) entries,
      COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) exits
      FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM vehicles WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("saleAmount" AS numeric)),0) sold,COALESCE(SUM(CAST("receivableBalance" AS numeric)),0) receivable FROM vehicle_sales WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM products WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM agents WHERE "databaseId"=${databaseId}`,
  ]);
  const entries = Number((cash[0] as any)?.entries || 0);
  const exits = Number((cash[0] as any)?.exits || 0);
  return {
    clients: clients[0], loans: loans[0], payments: payments[0],
    cash: { ...(cash[0] as any), net: Math.round((entries - exits) * 100) / 100 },
    financings: financings[0], vehicles: vehicles[0], vehicleSales: sales[0], products: products[0], agents: agents[0],
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
    ORDER BY "updatedAt" DESC LIMIT 8
  `;
  if (!clients.length) return { search, clients: [] };
  const ids = (clients as any[]).map(row => row.id);
  const [loans, payments, interestHistory, financings, vehicles, sales, cash] = await Promise.all([
    sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY l."updatedAt" DESC LIMIT 100`,
    sql`SELECT p.*,CASE WHEN p.status='pago' THEN 'pago' WHEN p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE) THEN 'atrasado' ELSE 'pendente' END "effectiveStatus",COALESCE(c.name,fc.name) "clientName" FROM payments p LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId" LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId" LEFT JOIN clients fc ON fc.id=vf."clientId" WHERE p."databaseId"=${databaseId} AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids})) ORDER BY p."dueDate" DESC LIMIT 160`,
    sql`SELECT h.*,l."clientId" FROM loan_interest_history h JOIN loans l ON l.id=h."loanId" WHERE h."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY h."createdAt" DESC LIMIT 100`,
    sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND vf."clientId"=ANY(${ids}) ORDER BY vf."updatedAt" DESC LIMIT 100`,
    sql`SELECT v.*,c.name "clientName" FROM vehicles v LEFT JOIN clients c ON c.id=v."clientId" WHERE v."databaseId"=${databaseId} AND v."clientId"=ANY(${ids}) ORDER BY v."updatedAt" DESC LIMIT 80`,
    sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" WHERE vs."databaseId"=${databaseId} AND vs."clientId"=ANY(${ids}) ORDER BY vs."saleDate" DESC LIMIT 80`,
    sql`SELECT id,type,category,description,amount,"movementDate","clientId","loanId","vehicleId","vehicleSaleId","paymentId",responsible,notes FROM cash_flow WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "movementDate" DESC LIMIT 120`,
  ]);
  return { search, clients, loans, payments, interestHistory, financings, vehicles, vehicleSales: sales, cashFlow: cash };
}

function periodFlags(text: string) {
  return {
    overdue: /\b(atras|inadimpl|vencid)\b/.test(text),
    today: /\bhoje\b/.test(text),
    week: /\bsemana\b/.test(text),
    month: /\b(mes|mês)\b/.test(text),
  };
}

async function paymentContext(databaseId: number, search: string, text: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clientIds = search ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 12` : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const period = periodFlags(text);
  const rows = await sql`
    SELECT p.*,CASE WHEN p.status='pago' THEN 'pago' WHEN p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE) THEN 'atrasado' ELSE 'pendente' END "effectiveStatus",COALESCE(c.name,fc.name) "clientName"
    FROM payments p
    LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId"
    LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId" LEFT JOIN clients fc ON fc.id=vf."clientId"
    WHERE p."databaseId"=${databaseId}
      ${ids.length ? sql`AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids}))` : sql``}
      ${period.overdue ? sql`AND (p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE))` : sql``}
      ${period.today ? sql`AND p."dueDate"::date=CURRENT_DATE` : sql``}
      ${period.week ? sql`AND p."dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE+6` : sql``}
      ${period.month ? sql`AND p."dueDate"::date>=date_trunc('month',CURRENT_DATE)::date AND p."dueDate"::date<(date_trunc('month',CURRENT_DATE)+interval '1 month')::date` : sql``}
    ORDER BY p."dueDate" ASC LIMIT 160
  `;
  const totals = (rows as any[]).reduce((acc, row) => {
    const amount = Number(row.amount || 0);
    acc.total += amount;
    if (row.effectiveStatus === "pago") acc.paid += amount;
    else if (row.effectiveStatus === "atrasado") acc.overdue += amount;
    else acc.pending += amount;
    return acc;
  }, { total: 0, paid: 0, pending: 0, overdue: 0 });
  return { search: search || null, period, rowWindowTotals: totals, rows, note: "rowWindowTotals cobre apenas as linhas retornadas; para totais gerais use summary360." };
}

async function cashContext(databaseId: number, search: string, text: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clientIds = search ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 12` : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const period = periodFlags(text);
  const rows = await sql`
    SELECT id,type,category,description,amount,"movementDate","clientId","loanId","vehicleId","vehicleSaleId","paymentId",responsible,notes
    FROM cash_flow WHERE "databaseId"=${databaseId}
      ${ids.length ? sql`AND "clientId"=ANY(${ids})` : sql``}
      ${period.today ? sql`AND "movementDate"::date=CURRENT_DATE` : sql``}
      ${period.week ? sql`AND "movementDate"::date BETWEEN CURRENT_DATE-6 AND CURRENT_DATE` : sql``}
      ${period.month ? sql`AND "movementDate"::date>=date_trunc('month',CURRENT_DATE)::date AND "movementDate"::date<(date_trunc('month',CURRENT_DATE)+interval '1 month')::date` : sql``}
    ORDER BY "movementDate" DESC LIMIT 140
  `;
  const totals = (rows as any[]).reduce((acc, row) => {
    const amount = Number(row.amount || 0);
    if (row.type === "ENTRADA") acc.entries += amount;
    if (row.type === "SAIDA") acc.exits += amount;
    return acc;
  }, { entries: 0, exits: 0 });
  return { search: search || null, period, rowWindowTotals: { ...totals, net: Math.round((totals.entries - totals.exits) * 100) / 100 }, rows, note: "rowWindowTotals cobre apenas as linhas retornadas; para o saldo global use summary360." };
}

async function portfolioContext(databaseId: number) {
  const sql = getSql();
  return sql`
    SELECT c.id,c.name,c.phone,c.whatsapp,
      COALESCE(l.loan_count,0)::int "loanCount",COALESCE(l.loan_remaining,0) "loanRemaining",
      COALESCE(p.overdue_count,0)::int "overdueCount",COALESCE(p.overdue_amount,0) "overdueAmount",COALESCE(p.paid_amount,0) "paidAmount",
      COALESCE(f.financing_count,0)::int "financingCount",COALESCE(f.financing_remaining,0) "financingRemaining"
    FROM clients c
    LEFT JOIN (SELECT "clientId",COUNT(*) loan_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) loan_remaining FROM loans WHERE "databaseId"=${databaseId} GROUP BY "clientId") l ON l."clientId"=c.id
    LEFT JOIN (SELECT l."clientId",COUNT(*) FILTER(WHERE p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE)) overdue_count,COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE)),0) overdue_amount,COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='pago'),0) paid_amount FROM payments p JOIN loans l ON l.id=p."loanId" WHERE p."databaseId"=${databaseId} GROUP BY l."clientId") p ON p."clientId"=c.id
    LEFT JOIN (SELECT "clientId",COUNT(*) financing_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) financing_remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId} GROUP BY "clientId") f ON f."clientId"=c.id
    WHERE c."databaseId"=${databaseId}
    ORDER BY (COALESCE(l.loan_remaining,0)+COALESCE(f.financing_remaining,0)+COALESCE(p.overdue_amount,0)) DESC
    LIMIT 100
  `;
}

async function moduleLists(databaseId: number, text: string, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const data: Record<string, unknown> = {};
  if (/\b(emprestimo|contrato|juros|saldo devedor)\b/.test(text)) {
    data.loans = search
      ? await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY l."updatedAt" DESC LIMIT 120`
      : await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} ORDER BY l."updatedAt" DESC LIMIT 120`;
  }
  if (/\b(financiamento|financiado)\b/.test(text)) {
    data.financings = search
      ? await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY vf."updatedAt" DESC LIMIT 120`
      : await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} ORDER BY vf."updatedAt" DESC LIMIT 120`;
  }
  if (/\b(veiculo|carro|moto|placa|venda de veiculo)\b/.test(text)) {
    data.vehicles = search
      ? await sql`SELECT v.*,c.name "clientName" FROM vehicles v LEFT JOIN clients c ON c.id=v."clientId" WHERE v."databaseId"=${databaseId} AND (v.brand ILIKE ${like} OR v.model ILIKE ${like} OR v.plate ILIKE ${like} OR c.name ILIKE ${like}) ORDER BY v."updatedAt" DESC LIMIT 120`
      : await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 120`;
    data.vehicleSales = await sql`SELECT vs.*,v.brand,v.model,v.plate,c.name "clientName" FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" LEFT JOIN clients c ON c.id=vs."clientId" WHERE vs."databaseId"=${databaseId} ${search ? sql`AND (v.brand ILIKE ${like} OR v.model ILIKE ${like} OR v.plate ILIKE ${like} OR c.name ILIKE ${like})` : sql``} ORDER BY vs."saleDate" DESC LIMIT 120`;
  }
  if (/\b(produto|celular|mercadoria|sku)\b/.test(text)) {
    data.products = search
      ? await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR category ILIKE ${like} OR sku ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 120`
      : await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 120`;
  }
  if (/\b(agente|comissao|comissionado)\b/.test(text)) {
    data.agents = search
      ? await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} AND name ILIKE ${like} ORDER BY "updatedAt" DESC LIMIT 100`
      : await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 100`;
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

    const asksClient = Boolean(search) || /\b(cliente|cpf|telefone|whatsapp)\b/.test(text);
    const asksPayments = /\b(parcela|pagamento|recebimento|receber)\b/.test(text);
    const asksDueDates = /\b(vencimento|vence|vencid|atras|inadimpl|hoje|semana)\b/.test(text);
    const asksCash = /\b(caixa|entrada|saida|movimentacao|fluxo)\b/.test(text);
    const asksPortfolio = /\b(carteira|risco|problema|pior cliente|maior devedor|concentracao|negocio|dashboard|resumo|indicador|total)\b/.test(text);
    const asksContracts = /\b(emprestimo|contrato|financiamento|juros|saldo devedor)\b/.test(text);
    const asksOtherModules = /\b(veiculo|carro|moto|placa|produto|celular|agente|comissao)\b/.test(text);
    const asksChange = /\b(criar|cadastrar|alterar|editar|excluir|apagar|pagar|lancar|registrar)\b/.test(text);
    const wantsOperational = asksClient || asksPayments || asksDueDates || asksCash || asksPortfolio || asksContracts || asksOtherModules;

    const blocked: string[] = [];
    if (asksClient && !context.settings.allowClientQueries) blocked.push("consultas de clientes");
    if (asksContracts && !context.settings.allowContractQueries) blocked.push("consultas de contratos");
    if (asksPayments && !context.settings.allowPaymentQueries) blocked.push("consultas de pagamentos");
    if (asksDueDates && !context.settings.allowDueDateQueries) blocked.push("consultas de vencimentos");
    if ((asksCash || asksPortfolio) && !context.settings.allowSummaries) blocked.push("resumos e análises financeiras");
    if (asksChange) blocked.push("alterações de dados pela Olivia");

    let operational: Record<string, unknown> = {};
    if (canRead && wantsOperational) {
      const jobs: Array<Promise<[string, unknown]>> = [];
      if (context.settings.allowSummaries) jobs.push(summary360(context.database.id).then(value => ["summary360", value]));
      if (asksClient && search && context.settings.allowClientQueries) jobs.push(client360(context.database.id, search).then(value => ["client360", value]));
      if ((asksPayments || asksDueDates) && context.settings.allowPaymentQueries && (!asksDueDates || context.settings.allowDueDateQueries)) jobs.push(paymentContext(context.database.id, search, text).then(value => ["payments", value]));
      if (asksCash && context.settings.allowSummaries) jobs.push(cashContext(context.database.id, search, text).then(value => ["cashFlow", value]));
      if (asksPortfolio && context.settings.allowSummaries && context.settings.allowClientQueries) jobs.push(portfolioContext(context.database.id).then(value => ["portfolio", value]));
      if ((asksContracts && context.settings.allowContractQueries) || asksOtherModules) jobs.push(moduleLists(context.database.id, text, search).then(value => ["modules", value]));
      operational = Object.fromEntries(await Promise.all(jobs));
    } else if (dashboardOnly && wantsOperational && context.settings.allowSummaries) {
      operational = { access: "dashboard_only", summary360: await summary360(context.database.id) };
    }

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Banco autorizado único: ${context.database.name} (#${context.database.id}). Usuário: ${context.user.name || context.user.username || "Usuário"}. Busca contextual: ${search || "nenhuma"}. Categorias bloqueadas nesta solicitação: ${blocked.length ? blocked.join(", ") : "nenhuma"}. Dados operacionais autorizados relevantes: ${JSON.stringify(operational)}.`,
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

    console.log("[Olivia Core] success", {
      ms: Date.now() - startedAt,
      databaseId: context.database.id,
      operational: Object.keys(operational),
      blocked,
      hasSearch: Boolean(search),
    });
    return sendJson(res, 200, { reply, databaseId: context.database.id, search: search || null });
  } catch (error) {
    console.error("[Olivia Core]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
