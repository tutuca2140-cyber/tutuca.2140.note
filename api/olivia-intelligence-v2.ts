import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

const SYSTEM_PROMPT = `Você é Olivia, assistente inteligente do ERP Note Note.

CONVERSA
- Converse como uma pessoa: natural, cordial, contextual e sem mensagens prontas.
- Continue o assunto usando o histórico e o contexto ativo fornecido.
- Entenda referências como ele, ela, esse, essa, isso, aquele contrato, esse cliente, esse valor e metade quando o contexto anterior permitir.
- Responda cumprimentos, agradecimentos, confirmações e perguntas casuais naturalmente.
- Não recite capacidades sem pedido explícito.
- Não anuncie limitações preventivamente.
- Só explique uma limitação quando o usuário pedir algo que realmente esteja fora da autorização.
- Use **negrito** para rótulos, fórmulas, resultados e referências importantes.

ESPECIALIDADES
- Matemática básica e avançada, álgebra, geometria, trigonometria, cálculo e estatística.
- Matemática financeira e econômica: juros simples/compostos, equivalência de taxas, amortização, VP, VF, TIR, VPL, elasticidade, otimização e séries temporais.
- Física: mecânica, energia, termodinâmica, eletricidade, ondas, óptica e fundamentos de relatividade.
- Espaço e tempo: distância, velocidade, aceleração, duração, calendários, escalas, coordenadas e conversões.
- Em cálculos, use primeiro os valores determinísticos fornecidos pelo sistema.

NOTE NOTE
- Use somente o contexto operacional autorizado recebido.
- Nunca use, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.
- Nunca invente dados ausentes.
- Para valores financeiros, trate os cálculos/verificações determinísticos como fonte primária.
- Antes de responder números do sistema, confira silenciosamente a seção de validação fornecida.
- Se houver inconsistência real nos dados, explique o conflito ao usuário sem inventar uma correção.

AUTORIDADE
- Você nunca pode ter mais poder que o usuário logado.
- Você é completamente subordinada ao Super Admin.
- Conhecimento não aumenta permissão.
- Não crie, edite, exclua ou administre usuários/permissões.
`;

type Context = { user: any; database: any };
type Intent =
  | "general"
  | "client"
  | "loan"
  | "payment"
  | "cash"
  | "vehicle"
  | "financing"
  | "product"
  | "agent"
  | "risk"
  | "dashboard";

type ChatRow = { role: "user" | "assistant"; content: string };

const cache = new Map<string, { expires: number; value: unknown }>();
const CACHE_TTL = 20_000;

function cacheGet<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item || item.expires < Date.now()) {
    if (item) cache.delete(key);
    return null;
  }
  return item.value as T;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { expires: Date.now() + CACHE_TTL, value });
}

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

function isContextualFollowUp(message: string) {
  const text = normalize(message);
  return /\b(ele|ela|dele|dela|isso|esse|essa|este|esta|aquele|aquela|metade|restante|saldo|mesmo|anterior|agora|e se|quanto fica|quanto daria)\b/.test(text);
}

function inferConversationContext(history: ChatRow[], currentMessage: string) {
  let activeIntent: Intent = "general";
  let activeSearch = "";
  const topics: string[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.role !== "user") continue;
    if (activeIntent === "general") {
      const detected = detectIntent(item.content);
      if (detected !== "general") activeIntent = detected;
    }
    if (!activeSearch) activeSearch = extractSearch(item.content);
    if (activeIntent !== "general" && activeSearch) break;
  }
  const currentIntent = detectIntent(currentMessage);
  const currentSearch = extractSearch(currentMessage);
  if (currentIntent !== "general") topics.push(currentIntent);
  if (activeIntent !== "general" && !topics.includes(activeIntent)) topics.push(activeIntent);
  return {
    currentIntent,
    resolvedIntent:
      currentIntent === "general" && isContextualFollowUp(currentMessage)
        ? activeIntent
        : currentIntent,
    currentSearch: currentSearch || null,
    resolvedSearch: currentSearch || (isContextualFollowUp(currentMessage) ? activeSearch : "") || null,
    previousIntent: activeIntent,
    previousSearch: activeSearch || null,
    topics,
  };
}

async function getContext(req: any): Promise<Context | null> {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sessions = await sql`
    SELECT u.id, u.username, u.name, u.role, u."isActive", u."oliviaEnabled",
           u."canView", u."canInsert", u."canEdit", u."canDelete",
           u."canGenerateReports", u."dashboardOnly"
    FROM local_sessions s
    JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token} AND s."expiresAt" > now()
    LIMIT 1
  `;
  const user = sessions[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;

  let database: any;
  if (user.role === "super_admin") {
    const rows = await sql`SELECT id, name FROM databases WHERE "isActive"=true LIMIT 1`;
    database = rows[0];
  } else {
    const rows = await sql`
      SELECT d.id,d.name FROM user_database_access uda
      JOIN databases d ON d.id=uda."databaseId"
      WHERE uda."userId"=${user.id} AND uda."isActive"=true LIMIT 1
    `;
    database = rows[0];
    if (!database) {
      const fallback = await sql`
        SELECT d.id,d.name FROM user_database_access uda
        JOIN databases d ON d.id=uda."databaseId"
        WHERE uda."userId"=${user.id} LIMIT 1
      `;
      database = fallback[0];
    }
  }
  return database ? { user, database } : null;
}

async function getDashboardContext(databaseId: number) {
  const key = `dashboard:${databaseId}`;
  const cached = cacheGet<any>(key);
  if (cached) return cached;
  const sql = getSql();
  const [clients, loans, payments, cash, financings] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int AS count,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) AS remaining,
      COALESCE(SUM(CAST("totalPaid" AS numeric)),0) AS paid
      FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*) FILTER (WHERE status='atrasado')::int AS overdue_count,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER (WHERE status='atrasado'),0) AS overdue_total,
      COUNT(*) FILTER (WHERE status='pendente')::int AS pending_count
      FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) AS entries,
      COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) AS exits
      FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int AS count,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) AS remaining
      FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
  ]);
  const value = {
    clients: clients[0],
    loans: loans[0],
    payments: payments[0],
    cash: cash[0],
    financings: financings[0],
  };
  cacheSet(key, value);
  return value;
}

async function getOperationalContext(databaseId: number, intent: Intent, searchText: string | null) {
  const sql = getSql();
  const search = searchText || "";
  const like = `%${search}%`;
  const base = { intent, search: search || null };

  if (intent === "client") {
    const rows = search
      ? await sql`SELECT id,name,cpf,email,phone,whatsapp,profession,city,state,notes,"createdAt","updatedAt"
          FROM clients WHERE "databaseId"=${databaseId}
          AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like})
          ORDER BY "updatedAt" DESC LIMIT 40`
      : await sql`SELECT id,name,email,phone,whatsapp,profession,city,state,"createdAt","updatedAt"
          FROM clients WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 40`;
    return { ...base, clients: rows };
  }

  if (intent === "loan") {
    const clients = search
      ? await sql`SELECT id,name FROM clients WHERE "databaseId"=${databaseId} AND name ILIKE ${like} LIMIT 20`
      : [];
    const ids = (clients as any[]).map(x => x.id);
    const rows = ids.length
      ? await sql`SELECT l.*,c.name AS "clientName" FROM loans l JOIN clients c ON c.id=l."clientId"
          WHERE l."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY l."updatedAt" DESC LIMIT 60`
      : await sql`SELECT l.*,c.name AS "clientName" FROM loans l JOIN clients c ON c.id=l."clientId"
          WHERE l."databaseId"=${databaseId} ORDER BY l."updatedAt" DESC LIMIT 60`;
    return { ...base, loans: rows };
  }

  if (intent === "payment") {
    const rows = search
      ? await sql`SELECT p.*,c.name AS "clientName" FROM payments p
          LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId"
          WHERE p."databaseId"=${databaseId} AND c.name ILIKE ${like}
          ORDER BY p."dueDate" ASC LIMIT 100`
      : await sql`SELECT p.*,c.name AS "clientName" FROM payments p
          LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId"
          WHERE p."databaseId"=${databaseId} ORDER BY p."dueDate" ASC LIMIT 100`;
    return { ...base, payments: rows };
  }

  if (intent === "cash") {
    const rows = await sql`SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes
      FROM cash_flow WHERE "databaseId"=${databaseId} ORDER BY "movementDate" DESC LIMIT 100`;
    return { ...base, cashFlow: rows };
  }

  if (intent === "vehicle") {
    const rows = search
      ? await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId}
          AND (brand ILIKE ${like} OR model ILIKE ${like} OR plate ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 80`
      : await sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`;
    const sales = await sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs
      JOIN vehicles v ON v.id=vs."vehicleId" WHERE vs."databaseId"=${databaseId}
      ORDER BY vs."saleDate" DESC LIMIT 80`;
    return { ...base, vehicles: rows, vehicleSales: sales };
  }

  if (intent === "financing") {
    const rows = search
      ? await sql`SELECT vf.*,c.name AS "clientName" FROM "vehicleFinancings" vf
          LEFT JOIN clients c ON c.id=vf."clientId"
          WHERE vf."databaseId"=${databaseId} AND c.name ILIKE ${like}
          ORDER BY vf."updatedAt" DESC LIMIT 80`
      : await sql`SELECT vf.*,c.name AS "clientName" FROM "vehicleFinancings" vf
          LEFT JOIN clients c ON c.id=vf."clientId"
          WHERE vf."databaseId"=${databaseId} ORDER BY vf."updatedAt" DESC LIMIT 80`;
    return { ...base, financings: rows };
  }

  if (intent === "product") {
    const products = search
      ? await sql`SELECT * FROM products WHERE "databaseId"=${databaseId}
          AND (name ILIKE ${like} OR category ILIKE ${like} OR sku ILIKE ${like}) ORDER BY "updatedAt" DESC LIMIT 80`
      : await sql`SELECT * FROM products WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`;
    const financings = await sql`SELECT vf.*,c.name AS "clientName" FROM "vehicleFinancings" vf
      LEFT JOIN clients c ON c.id=vf."clientId" WHERE vf."databaseId"=${databaseId} AND vf."assetType"='product'
      ORDER BY vf."updatedAt" DESC LIMIT 80`;
    return { ...base, products, productFinancings: financings };
  }

  if (intent === "agent") {
    const rows = search
      ? await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} AND name ILIKE ${like} ORDER BY "updatedAt" DESC LIMIT 80`
      : await sql`SELECT * FROM agents WHERE "databaseId"=${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`;
    return { ...base, agents: rows };
  }

  if (intent === "risk") {
    const [duplicateClients, duplicatePayments, invalidContracts, unusualCash] = await Promise.all([
      sql`SELECT lower(name) AS name,COUNT(*)::int AS count FROM clients WHERE "databaseId"=${databaseId}
          GROUP BY lower(name) HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 30`,
      sql`SELECT "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate",COUNT(*)::int AS count
          FROM payments WHERE "databaseId"=${databaseId}
          GROUP BY "loanId","vehicleFinancingId","installmentNumber",amount,"paymentDate"
          HAVING COUNT(*)>1 LIMIT 30`,
      sql`SELECT id,"clientId",installments,"totalAmount" FROM loans WHERE "databaseId"=${databaseId}
          AND (installments IS NULL OR installments<=0 OR CAST("totalAmount" AS numeric)<=0) LIMIT 30`,
      sql`WITH x AS (SELECT AVG(ABS(CAST(amount AS numeric))) avg_amount FROM cash_flow WHERE "databaseId"=${databaseId})
          SELECT id,type,category,description,amount,"movementDate" FROM cash_flow,x
          WHERE "databaseId"=${databaseId} AND x.avg_amount>0 AND ABS(CAST(amount AS numeric))>x.avg_amount*4
          ORDER BY "movementDate" DESC LIMIT 30`,
    ]);
    return { ...base, duplicateClients, duplicatePayments, invalidContracts, unusualCash };
  }

  return { ...base, dashboard: await getDashboardContext(databaseId) };
}

async function getRecentConversation(userId: number, databaseId: number): Promise<ChatRow[]> {
  const sql = getSql();
  try {
    const rows = await sql`SELECT role,content FROM olivia_conversations
      WHERE "userId"=${userId} AND "databaseId"=${databaseId}
      ORDER BY "createdAt" DESC,id DESC LIMIT 14`;
    return [...rows].reverse() as ChatRow[];
  } catch {
    return [];
  }
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function deterministicMath(message: string) {
  const text = normalize(message);
  const amount = message.match(/(?:r\$\s*)?(\d+(?:[.,]\d+)?)/i);
  const rate = message.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const periods = message.match(/(\d+)\s*(?:dia|dias|semana|semanas|mes|meses|ano|anos|parcelas|x)\b/i);
  if (/juros/.test(text) && amount && rate && periods) {
    const principal = Number(amount[1].replace(",", "."));
    const r = Number(rate[1].replace(",", ".")) / 100;
    const n = Number(periods[1]);
    if ([principal, r, n].every(Number.isFinite) && principal > 0 && n > 0) {
      const compound = /compost/.test(text);
      const total = compound ? principal * Math.pow(1 + r, n) : principal * (1 + r * n);
      return {
        type: compound ? "compound_interest" : "simple_interest",
        principal,
        rate: r,
        periods: n,
        total: Math.round(total * 100) / 100,
        interest: Math.round((total - principal) * 100) / 100,
        installment: Math.round((total / n) * 100) / 100,
      };
    }
  }
  return null;
}

function buildValidation(intent: Intent, data: any, deterministic: any) {
  const validation: Record<string, unknown> = { intent, deterministicMath: deterministic };

  if (data?.dashboard) {
    const entries = numberValue(data.dashboard.cash?.entries);
    const exits = numberValue(data.dashboard.cash?.exits);
    validation.dashboard = {
      netCash: Math.round((entries - exits) * 100) / 100,
      overdueTotal: numberValue(data.dashboard.payments?.overdue_total),
      loanRemaining: numberValue(data.dashboard.loans?.remaining),
      financingRemaining: numberValue(data.dashboard.financings?.remaining),
    };
  }

  if (Array.isArray(data?.payments)) {
    const totals = data.payments.reduce(
      (acc: any, row: any) => {
        const amount = numberValue(row.amount);
        acc.total += amount;
        if (row.status === "pago") acc.paid += amount;
        if (row.status === "pendente") acc.pending += amount;
        if (row.status === "atrasado") acc.overdue += amount;
        return acc;
      },
      { total: 0, paid: 0, pending: 0, overdue: 0 }
    );
    validation.payments = Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, Math.round(numberValue(v) * 100) / 100])
    );
  }

  if (Array.isArray(data?.loans)) {
    validation.loans = data.loans.slice(0, 20).map((row: any) => {
      const principal = numberValue(row.amount);
      const total = numberValue(row.totalAmount);
      const paid = numberValue(row.totalPaid);
      const remaining = numberValue(row.remainingBalance);
      return {
        id: row.id,
        clientName: row.clientName,
        principal,
        total,
        paid,
        remaining,
        valuesNonNegative: principal >= 0 && total >= 0 && paid >= 0 && remaining >= 0,
        paidPlusRemaining: Math.round((paid + remaining) * 100) / 100,
      };
    });
  }

  if (Array.isArray(data?.cashFlow)) {
    const sums = data.cashFlow.reduce(
      (acc: any, row: any) => {
        const amount = numberValue(row.amount);
        if (row.type === "ENTRADA") acc.entries += amount;
        if (row.type === "SAIDA") acc.exits += amount;
        return acc;
      },
      { entries: 0, exits: 0 }
    );
    validation.cash = {
      entries: Math.round(sums.entries * 100) / 100,
      exits: Math.round(sums.exits * 100) / 100,
      net: Math.round((sums.entries - sums.exits) * 100) / 100,
    };
  }

  return validation;
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

    const history = await getRecentConversation(context.user.id, context.database.id);
    const conversationContext = inferConversationContext(history, message);
    const intent = conversationContext.resolvedIntent;
    const canReadOperational =
      context.user.role === "super_admin" ||
      (context.user.canView === true && context.user.dashboardOnly !== true);
    const dashboardOnly = context.user.dashboardOnly === true && context.user.canView === true;

    let operationalContext: any = { access: "general_knowledge_only" };
    if (canReadOperational) {
      operationalContext = intent === "general"
        ? { dashboard: await getDashboardContext(context.database.id) }
        : await getOperationalContext(
            context.database.id,
            intent,
            conversationContext.resolvedSearch
          );
    } else if (dashboardOnly) {
      operationalContext = {
        access: "dashboard_only",
        dashboard: await getDashboardContext(context.database.id),
      };
    }

    const deterministic = deterministicMath(message);
    const validation = buildValidation(intent, operationalContext, deterministic);

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Usuário: ${context.user.name || context.user.username || "Usuário"}. Papel: ${context.user.role}. Banco autorizado: ${context.database.name}. Contexto ativo da conversa: ${JSON.stringify(conversationContext)}. Dados autorizados relevantes: ${JSON.stringify(operationalContext)}. Validação determinística: ${JSON.stringify(validation)}. Use esses dados como fonte primária e faça a checagem silenciosamente antes de responder.`,
          },
          ...history.map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[Olivia Intelligence V2] AI gateway status", response.status);
      return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return sendJson(res, 502, { error: "A Olivia não retornou uma resposta válida." });

    return sendJson(res, 200, {
      reply,
      intent,
      context: {
        activeIntent: conversationContext.resolvedIntent,
        activeSearch: conversationContext.resolvedSearch,
      },
    });
  } catch (error) {
    console.error("[Olivia Intelligence V2]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
