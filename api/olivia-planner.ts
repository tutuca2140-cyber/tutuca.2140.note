import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

type ChatRow = { role: "user" | "assistant"; content: string };
type ToolName =
  | "summary360"
  | "portfolio_cross"
  | "client360"
  | "payments"
  | "cash_flow"
  | "loans"
  | "financings"
  | "vehicles"
  | "products"
  | "agents"
  | "risk_review";

type PlannedTool = {
  name: ToolName;
  search?: string | null;
  period?: "today" | "week" | "month" | "overdue" | "all";
};

type Plan = {
  goal: string;
  tools: PlannedTool[];
  needsOperationalData: boolean;
};

const FINAL_PROMPT = `Você é Olivia, assistente inteligente do ERP Note Note.

INTERAÇÃO HUMANA
- Converse de forma natural, fluida, cordial e contextual, sem frases prontas.
- Responda primeiro ao que a pessoa realmente quis saber.
- Continue conversas usando o histórico e referências como ele, ela, esse cliente, aquele contrato, isso, metade, restante, agora, depois e o anterior.
- Não repita capacidades, regras ou limitações sem necessidade.
- Adapte profundidade, vocabulário e tamanho da resposta à pergunta.
- Para perguntas simples, seja direta. Para análises, explique o raciocínio de forma clara, sem expor raciocínio interno oculto.
- Quando houver mais de uma interpretação plausível, use os dados e o contexto para escolher a mais provável. Só peça esclarecimento se a resposta realmente depender disso.
- Não finja sentimentos, experiências pessoais, certeza ou ações que não ocorreram.

RACIOCÍNIO E DADOS
- Você recebe resultados de ferramentas seguras escolhidas por um planejador.
- Cruze módulos quando isso melhorar a resposta: clientes, empréstimos, juros, pagamentos, caixa, veículos, vendas, financiamentos, produtos e agentes.
- Diferencie fatos encontrados, cálculos e interpretações.
- Compare valores, identifique tendências, concentração, recorrência de atrasos, inconsistências e impacto no caixa quando pertinente.
- Nunca invente dados ausentes.
- Se duas fontes do mesmo banco divergirem, explique a divergência de modo objetivo.
- Para valores financeiros, use os números retornados pelo sistema como fonte primária.

ESPECIALIDADES
- Matemática básica e avançada, álgebra, geometria, trigonometria, cálculo, estatística e probabilidade.
- Matemática financeira e econômica: juros simples/compostos, amortização, VP, VF, TIR, VPL, taxas equivalentes, elasticidade, otimização e séries temporais.
- Física: mecânica, energia, termodinâmica, eletricidade, ondas, óptica e fundamentos de relatividade.
- Espaço e tempo: distância, velocidade, aceleração, duração, calendários, escalas, coordenadas e conversões.

SEGURANÇA E AUTORIDADE
- Trabalhe somente no único banco de dados autorizado informado pelo servidor.
- Nunca misture bancos diferentes.
- Nunca acesse, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.
- Você nunca pode ter mais poder que o usuário logado e é subordinada ao Super Admin.
- Inteligência não aumenta permissão.
`;

const PLANNER_PROMPT = `Você é o planejador silencioso da Olivia. Sua única tarefa é decidir quais ferramentas de leitura são necessárias para responder à mensagem do usuário.

Ferramentas permitidas:
- summary360: totais gerais do banco ativo.
- portfolio_cross: cruza clientes, saldos, atrasos e financiamentos na carteira.
- client360: visão completa de um cliente; use search quando houver nome, CPF ou telefone.
- payments: parcelas/pagamentos; period pode ser today, week, month, overdue ou all; search opcional por cliente.
- cash_flow: entradas/saídas de caixa; period pode ser today, week, month ou all; search opcional.
- loans: empréstimos/contratos; search opcional por cliente.
- financings: financiamentos; search opcional por cliente.
- vehicles: veículos e vendas; search opcional por cliente, placa, marca ou modelo.
- products: produtos e financiamentos de produto; search opcional.
- agents: agentes; search opcional.
- risk_review: inconsistências, duplicidades e movimentos incomuns.

REGRAS
- Nunca invente ferramenta.
- Nunca escreva SQL.
- Nunca escolha usuários, permissões, sessões, configurações ou credenciais.
- Escolha o menor conjunto de ferramentas que permita responder bem.
- Para pergunta geral/casual/matemática/física sem relação com dados do Note Note, use tools=[] e needsOperationalData=false.
- Para pergunta ampla como “como está meu negócio?” use summary360 + portfolio_cross.
- Para pergunta sobre um cliente específico, prefira client360 e acrescente outra ferramenta só se houver necessidade explícita.
- Para análises de risco, use risk_review e, se necessário, portfolio_cross.
- Para cruzamentos complexos, combine até 5 ferramentas.

Responda SOMENTE JSON válido, sem markdown, no formato:
{"goal":"resumo curto do objetivo","needsOperationalData":true,"tools":[{"name":"summary360"}]}
`;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractSearch(message: string, history: ChatRow[]) {
  const directCpf = message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0];
  const directPhone = message.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/)?.[0];
  const directQuoted = message.match(/["“](.+?)["”]/)?.[1];
  const directName = message.match(/(?:cliente|do|da|de)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){0,3})/u)?.[1];
  const direct = directCpf || directPhone || directQuoted || directName;
  if (direct) return direct.trim();
  if (!/\b(ele|ela|dele|dela|esse|essa|este|esta|aquele|aquela|mesmo|mesma|restante|metade|agora|anterior)\b/.test(normalize(message))) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const found = history[i].content.match(/["“](.+?)["”]/)?.[1]
      || history[i].content.match(/(?:cliente|do|da|de)\s+([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){0,3})/u)?.[1];
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

async function getHistory(userId: number, databaseId: number): Promise<ChatRow[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT role,content FROM olivia_conversations
      WHERE "userId"=${userId} AND "databaseId"=${databaseId}
      ORDER BY "createdAt" DESC,id DESC LIMIT 20
    `;
    return [...rows].reverse() as ChatRow[];
  } catch {
    return [];
  }
}

function safePlan(raw: string, fallbackSearch: string, message: string): Plan {
  const allowed = new Set<ToolName>([
    "summary360","portfolio_cross","client360","payments","cash_flow","loans","financings","vehicles","products","agents","risk_review",
  ]);
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    const tools: PlannedTool[] = Array.isArray(parsed?.tools)
      ? parsed.tools
          .filter((tool: any) => allowed.has(tool?.name))
          .slice(0, 5)
          .map((tool: any) => ({
            name: tool.name as ToolName,
            search: typeof tool.search === "string" && tool.search.trim() ? tool.search.trim().slice(0, 160) : (fallbackSearch || null),
            period: ["today","week","month","overdue","all"].includes(tool.period) ? tool.period : undefined,
          }))
      : [];
    return {
      goal: String(parsed?.goal || "Responder à solicitação do usuário").slice(0, 300),
      needsOperationalData: parsed?.needsOperationalData === true || tools.length > 0,
      tools,
    };
  } catch {
    const text = normalize(message);
    if (fallbackSearch) return { goal: "Consultar cliente e responder com contexto", needsOperationalData: true, tools: [{ name: "client360", search: fallbackSearch }] };
    if (/\b(risco|anomalia|duplicad|inconsisten|fora do padrao)\b/.test(text)) return { goal: "Analisar riscos e inconsistências", needsOperationalData: true, tools: [{ name: "risk_review" }, { name: "portfolio_cross" }] };
    if (/\b(caixa|entrada|saida|movimentacao)\b/.test(text)) return { goal: "Analisar fluxo de caixa", needsOperationalData: true, tools: [{ name: "cash_flow", period: "month" }, { name: "summary360" }] };
    if (/\b(parcela|pagamento|vencimento|atrasad)\b/.test(text)) return { goal: "Consultar pagamentos e vencimentos", needsOperationalData: true, tools: [{ name: "payments", period: /atrasad/.test(text) ? "overdue" : "month" }] };
    if (/\b(cliente|emprestimo|financiamento|veiculo|produto|carteira|dashboard|resumo|negocio)\b/.test(text)) return { goal: "Consultar dados operacionais", needsOperationalData: true, tools: [{ name: "summary360" }, { name: "portfolio_cross" }] };
    return { goal: "Responder sem consultar dados operacionais", needsOperationalData: false, tools: [] };
  }
}

async function summary360(databaseId: number) {
  const sql = getSql();
  const [clients, loans, payments, cash, financings, vehicles, products, agents] = await Promise.all([
    sql`SELECT COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST(amount AS numeric)),0) principal,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining,COALESCE(SUM(CAST("totalPaid" AS numeric)),0) paid FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pago'),0) paid,COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pendente'),0) pending,COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='atrasado'),0) overdue,COUNT(*) FILTER(WHERE status='atrasado')::int overdue_count FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) entries,COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) exits FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM vehicles WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM products WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM agents WHERE "databaseId"=${databaseId}`,
  ]);
  const entries = Number((cash[0] as any)?.entries || 0);
  const exits = Number((cash[0] as any)?.exits || 0);
  return { clients: clients[0], loans: loans[0], payments: payments[0], cash: { ...(cash[0] as any), net: Math.round((entries - exits) * 100) / 100 }, financings: financings[0], vehicles: vehicles[0], products: products[0], agents: agents[0] };
}

async function portfolioCross(databaseId: number) {
  const sql = getSql();
  return await sql`
    SELECT c.id,c.name,c.phone,c.whatsapp,
      COALESCE(l.loan_count,0)::int "loanCount",COALESCE(l.loan_remaining,0) "loanRemaining",
      COALESCE(p.overdue_count,0)::int "overdueCount",COALESCE(p.overdue_amount,0) "overdueAmount",COALESCE(p.paid_amount,0) "paidAmount",
      COALESCE(f.financing_count,0)::int "financingCount",COALESCE(f.financing_remaining,0) "financingRemaining"
    FROM clients c
    LEFT JOIN (SELECT "clientId",COUNT(*) loan_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) loan_remaining FROM loans WHERE "databaseId"=${databaseId} GROUP BY "clientId") l ON l."clientId"=c.id
    LEFT JOIN (
      SELECT l."clientId",COUNT(*) FILTER(WHERE p.status='atrasado') overdue_count,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='atrasado'),0) overdue_amount,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='pago'),0) paid_amount
      FROM payments p JOIN loans l ON l.id=p."loanId" WHERE p."databaseId"=${databaseId} GROUP BY l."clientId"
    ) p ON p."clientId"=c.id
    LEFT JOIN (SELECT "clientId",COUNT(*) financing_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) financing_remaining FROM "vehicleFinancings" WHERE "databaseId"=${databaseId} GROUP BY "clientId") f ON f."clientId"=c.id
    WHERE c."databaseId"=${databaseId}
    ORDER BY (COALESCE(l.loan_remaining,0)+COALESCE(f.financing_remaining,0)+COALESCE(p.overdue_amount,0)) DESC
    LIMIT 150
  `;
}

async function client360(databaseId: number, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clients = await sql`SELECT id,name,cpf,email,phone,whatsapp,profession,city,state,notes,"createdAt","updatedAt" FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 10`;
  if (!clients.length) return { search, clients: [] };
  const ids = (clients as any[]).map(row => row.id);
  const [loans, payments, interestHistory, financings, vehicles, sales, cash] = await Promise.all([
    sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY l."updatedAt" DESC LIMIT 120`,
    sql`SELECT p.*,COALESCE(c.name,fc.name) "clientName" FROM payments p LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId" LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId" LEFT JOIN clients fc ON fc.id=vf."clientId" WHERE p."databaseId"=${databaseId} AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids})) ORDER BY p."dueDate" DESC LIMIT 200`,
    sql`SELECT h.*,l."clientId" FROM loan_interest_history h JOIN loans l ON l.id=h."loanId" WHERE h."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY h."createdAt" DESC LIMIT 150`,
    sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND vf."clientId"=ANY(${ids}) ORDER BY vf."updatedAt" DESC LIMIT 120`,
    sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "updatedAt" DESC LIMIT 100`,
    sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" WHERE vs."databaseId"=${databaseId} AND vs."clientId"=ANY(${ids}) ORDER BY vs."saleDate" DESC LIMIT 100`,
    sql`SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes FROM cash_flow WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "movementDate" DESC LIMIT 150`,
  ]);
  return { search, clients, loans, payments, interestHistory, financings, vehicles, vehicleSales: sales, cashFlow: cash };
}

function periodClause(period: PlannedTool["period"]) {
  if (period === "today") return "today";
  if (period === "week") return "week";
  if (period === "month") return "month";
  if (period === "overdue") return "overdue";
  return "all";
}

async function paymentsTool(databaseId: number, search: string | null | undefined, period: PlannedTool["period"]) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  const clientIds = search
    ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 20`
    : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const rows = await sql`
    SELECT p.*,COALESCE(c.name,fc.name) "clientName"
    FROM payments p
    LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId"
    LEFT JOIN "vehicleFinancings" vf ON vf.id=p."vehicleFinancingId" LEFT JOIN clients fc ON fc.id=vf."clientId"
    WHERE p."databaseId"=${databaseId}
      ${ids.length ? sql`AND (l."clientId"=ANY(${ids}) OR vf."clientId"=ANY(${ids}))` : sql``}
      ${periodClause(period) === "today" ? sql`AND p."dueDate"::date=CURRENT_DATE` : sql``}
      ${periodClause(period) === "week" ? sql`AND p."dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE+6` : sql``}
      ${periodClause(period) === "month" ? sql`AND p."dueDate"::date >= date_trunc('month',CURRENT_DATE)::date AND p."dueDate"::date < (date_trunc('month',CURRENT_DATE)+interval '1 month')::date` : sql``}
      ${periodClause(period) === "overdue" ? sql`AND (p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE))` : sql``}
    ORDER BY p."dueDate" ASC LIMIT 220
  `;
  const totals = (rows as any[]).reduce((acc, row) => { const amount = Number(row.amount || 0); acc.total += amount; if (row.status === "pago") acc.paid += amount; if (row.status === "pendente") acc.pending += amount; if (row.status === "atrasado") acc.overdue += amount; return acc; }, { total: 0, paid: 0, pending: 0, overdue: 0 });
  return { period: periodClause(period), search: search || null, totals, rows };
}

async function cashTool(databaseId: number, search: string | null | undefined, period: PlannedTool["period"]) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  const clientIds = search ? await sql`SELECT id FROM clients WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like}) LIMIT 20` : [];
  const ids = (clientIds as any[]).map(row => row.id);
  const p = periodClause(period);
  const rows = await sql`
    SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes
    FROM cash_flow WHERE "databaseId"=${databaseId}
      ${ids.length ? sql`AND "clientId"=ANY(${ids})` : sql``}
      ${p === "today" ? sql`AND "movementDate"::date=CURRENT_DATE` : sql``}
      ${p === "week" ? sql`AND "movementDate"::date BETWEEN CURRENT_DATE-6 AND CURRENT_DATE` : sql``}
      ${p === "month" ? sql`AND "movementDate"::date >= date_trunc('month',CURRENT_DATE)::date AND "movementDate"::date < (date_trunc('month',CURRENT_DATE)+interval '1 month')::date` : sql``}
    ORDER BY "movementDate" DESC LIMIT 220
  `;
  const totals = (rows as any[]).reduce((acc, row) => { const amount = Number(row.amount || 0); if (row.type === "ENTRADA") acc.entries += amount; if (row.type === "SAIDA") acc.exits += amount; return acc; }, { entries: 0, exits: 0 });
  return { period: p, search: search || null, totals: { ...totals, net: Math.round((totals.entries - totals.exits) * 100) / 100 }, rows };
}

async function loansTool(databaseId: number, search?: string | null) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  return search
    ? await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY l."updatedAt" DESC LIMIT 160`
    : await sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId" WHERE l."databaseId"=${databaseId} ORDER BY l."updatedAt" DESC LIMIT 160`;
}

async function financingsTool(databaseId: number, search?: string | null) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  return search
    ? await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND (c.name ILIKE ${like} OR c.phone ILIKE ${like} OR c.whatsapp ILIKE ${like} OR c.cpf ILIKE ${like}) ORDER BY vf."updatedAt" DESC LIMIT 160`
    : await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} ORDER BY vf."updatedAt" DESC LIMIT 160`;
}

async function vehiclesTool(databaseId: number, search?: string | null) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  const vehicles = search
    ? await sql`SELECT v.* FROM vehicles v LEFT JOIN clients c ON c.id=v."clientId" WHERE v."databaseId"=${databaseId} AND (v.brand ILIKE ${like} OR v.model ILIKE ${like} OR v.plate ILIKE ${like} OR c.name ILIKE ${like}) ORDER BY v."updatedAt" DESC LIMIT 140`
    : await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 140`;
  const sales = await sql`SELECT vs.*,v.brand,v.model,v.plate,c.name "clientName" FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId" LEFT JOIN clients c ON c.id=vs."clientId" WHERE vs."databaseId"=${databaseId} ${search ? sql`AND (v.brand ILIKE ${like} OR v.model ILIKE ${like} OR v.plate ILIKE ${like} OR c.name ILIKE ${like})` : sql``} ORDER BY vs."saleDate" DESC LIMIT 140`;
  return { search: search || null, vehicles, sales };
}

async function productsTool(databaseId: number, search?: string | null) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  const products = search
    ? await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} AND (name ILIKE ${like} OR category ILIKE ${like} OR sku ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 140`
    : await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 140`;
  const financings = await sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND vf."assetType"='product' ${search ? sql`AND (vf.description ILIKE ${like} OR c.name ILIKE ${like})` : sql``} ORDER BY vf."updatedAt" DESC LIMIT 140`;
  return { search: search || null, products, financings };
}

async function agentsTool(databaseId: number, search?: string | null) {
  const sql = getSql();
  const like = `%${search || ""}%`;
  return search
    ? await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} AND name ILIKE ${like} ORDER BY "updatedAt" DESC LIMIT 120`
    : await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 120`;
}

async function riskTool(databaseId: number) {
  const sql = getSql();
  const [duplicateClients, duplicatePayments, invalidLoans, unusualCash, chronicLate] = await Promise.all([
    sql`SELECT lower(name) name,COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId} GROUP BY lower(name) HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 40`,
    sql`SELECT "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate",COUNT(*)::int count FROM payments WHERE "databaseId"=${databaseId} GROUP BY "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate" HAVING COUNT(*)>1 LIMIT 40`,
    sql`SELECT id,"clientId",installments,"totalAmount","remainingBalance" FROM loans WHERE "databaseId"=${databaseId} AND (installments IS NULL OR installments<=0 OR CAST("totalAmount" AS numeric)<=0 OR CAST("remainingBalance" AS numeric)<0) LIMIT 40`,
    sql`WITH x AS (SELECT AVG(ABS(CAST(amount AS numeric))) avg_amount FROM cash_flow WHERE "databaseId"=${databaseId}) SELECT id,type,category,description,amount,"movementDate","clientId" FROM cash_flow,x WHERE "databaseId"=${databaseId} AND x.avg_amount>0 AND ABS(CAST(amount AS numeric))>x.avg_amount*4 ORDER BY "movementDate" DESC LIMIT 40`,
    sql`SELECT c.id,c.name,COUNT(*)::int late_count,COALESCE(SUM(CAST(p.amount AS numeric)),0) late_amount FROM payments p JOIN loans l ON l.id=p."loanId" JOIN clients c ON c.id=l."clientId" WHERE p."databaseId"=${databaseId} AND (p.status='atrasado' OR (p.status<>'pago' AND p."dueDate"::date<CURRENT_DATE)) GROUP BY c.id,c.name HAVING COUNT(*)>=2 ORDER BY late_count DESC,late_amount DESC LIMIT 50`,
  ]);
  return { duplicateClients, duplicatePayments, invalidLoans, unusualCash, chronicLate };
}

async function executeTool(databaseId: number, tool: PlannedTool) {
  switch (tool.name) {
    case "summary360": return summary360(databaseId);
    case "portfolio_cross": return portfolioCross(databaseId);
    case "client360": return tool.search ? client360(databaseId, tool.search) : { error: "client360_requires_search" };
    case "payments": return paymentsTool(databaseId, tool.search, tool.period || "all");
    case "cash_flow": return cashTool(databaseId, tool.search, tool.period || "all");
    case "loans": return loansTool(databaseId, tool.search);
    case "financings": return financingsTool(databaseId, tool.search);
    case "vehicles": return vehiclesTool(databaseId, tool.search);
    case "products": return productsTool(databaseId, tool.search);
    case "agents": return agentsTool(databaseId, tool.search);
    case "risk_review": return riskTool(databaseId);
  }
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

    const recent = await getHistory(context.user.id, context.database.id);
    const fallbackSearch = extractSearch(message, recent);
    const canRead = context.user.role === "super_admin" || (context.user.canView === true && context.user.dashboardOnly !== true);
    const dashboardOnly = context.user.dashboardOnly === true && context.user.canView === true;

    const plannerResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.05,
        messages: [
          { role: "system", content: PLANNER_PROMPT },
          { role: "system", content: `Banco disponível: apenas ${context.database.name} (#${context.database.id}). Busca contextual inferida: ${fallbackSearch || "nenhuma"}.` },
          ...recent.slice(-8).map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    let plan: Plan;
    if (plannerResponse.ok) {
      const plannerJson = (await plannerResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
      plan = safePlan(plannerJson.choices?.[0]?.message?.content || "", fallbackSearch, message);
    } else {
      plan = safePlan("", fallbackSearch, message);
    }

    if (!canRead) {
      plan.tools = dashboardOnly && plan.needsOperationalData ? [{ name: "summary360" }] : [];
      plan.needsOperationalData = dashboardOnly && plan.needsOperationalData;
    }

    const executed = await Promise.all(
      plan.tools.map(async tool => ({ tool, result: await executeTool(context.database.id, tool) }))
    );

    const finalResponse = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: FINAL_PROMPT },
          {
            role: "system",
            content: `Usuário: ${context.user.name || context.user.username || "Usuário"}. Papel: ${context.user.role}. Banco autorizado único: ${context.database.name} (#${context.database.id}). Objetivo planejado: ${plan.goal}. Ferramentas executadas e resultados autorizados: ${JSON.stringify(executed)}. Use apenas esses resultados operacionais e nunca misture outro banco.`,
          },
          ...recent.map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!finalResponse.ok) {
      console.error("[Olivia Planner] final AI status", finalResponse.status);
      return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });
    }
    const result = (await finalResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return sendJson(res, 502, { error: "A Olivia não retornou uma resposta válida." });

    return sendJson(res, 200, {
      reply,
      databaseId: context.database.id,
      planner: { goal: plan.goal, tools: plan.tools.map(tool => tool.name) },
    });
  } catch (error) {
    console.error("[Olivia Planner]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
