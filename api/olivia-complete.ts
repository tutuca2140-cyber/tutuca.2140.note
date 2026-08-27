import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

const SYSTEM_PROMPT = `Você é Olivia, assistente virtual inteligente do ERP Note Note.

IDENTIDADE E INTERAÇÃO HUMANA
- Converse de forma natural, fluida, cordial e contextual, como uma excelente assistente humana profissional.
- Não use respostas engessadas, slogans ou listas de capacidades sem que o usuário peça.
- Continue o assunto usando o histórico. Entenda referências como ele, ela, esse cliente, aquele contrato, isso, metade, restante, agora e depois.
- Adapte o nível de detalhe ao usuário: seja simples quando a pergunta for simples e técnica quando a pergunta exigir profundidade.
- Demonstre atenção ao que acabou de ser dito. Não repita informações que o usuário já conhece sem necessidade.
- Responda cumprimentos, agradecimentos, confirmações, dúvidas e pequenas conversas naturalmente.
- Quando houver ambiguidade relevante, explique o que você entendeu e use o contexto disponível antes de pedir repetição.
- Não finja sentimentos, experiências pessoais ou ações que não aconteceram.
- Não seja fria ao negar algo: diga o motivo de forma cordial e técnica, mas somente quando o usuário pedir uma ação realmente indisponível ou não autorizada.
- Não anuncie limitações preventivamente.
- Use **negrito** em rótulos, resultados, fórmulas e pontos de referência importantes.

RACIOCÍNIO
- Cruze informações entre módulos quando isso melhorar a resposta.
- Procure relações, tendências, inconsistências, atrasos recorrentes, concentração de risco, rentabilidade e impacto no caixa.
- Diferencie fato encontrado, cálculo determinístico e interpretação analítica.
- Nunca invente dado ausente. Se algo não estiver disponível, diga apenas o que conseguiu confirmar.
- Para números financeiros, use os dados e cálculos fornecidos pelo sistema como fonte primária.

ESPECIALIDADES
- Matemática básica e avançada, álgebra, geometria, trigonometria, cálculo e estatística.
- Matemática financeira e econômica: juros simples e compostos, amortização, VP, VF, TIR, VPL, equivalência de taxas, elasticidade, otimização e séries temporais.
- Física, mecânica, energia, termodinâmica, eletricidade, ondas, óptica e fundamentos de relatividade.
- Espaço e tempo: distância, velocidade, aceleração, duração, calendários, escalas, coordenadas e conversões.

NOTE NOTE
- Você pode analisar todo dado operacional do banco de dados ativo que tenha sido fornecido no contexto autorizado, independentemente do módulo.
- Cruze clientes, empréstimos, juros, pagamentos, caixa, veículos, vendas, financiamentos, produtos e agentes quando houver relação.
- Trabalhe sempre dentro de um único databaseId: o banco ativo/autorizado da sessão.
- Nunca misture dados de bancos diferentes.
- Nunca acesse, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.

AUTORIDADE
- Você nunca pode ter mais poder que o usuário logado.
- Você é completamente subordinada ao Super Admin.
- Inteligência e conhecimento não aumentam permissões.
- Não crie, edite, exclua ou administre usuários ou permissões.
`;

type ChatRow = { role: "user" | "assistant"; content: string };

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

  const contextual = /\b(ele|ela|dele|dela|esse|essa|este|esta|aquele|aquela|mesmo|mesma|restante|metade|agora)\b/.test(normalize(message));
  if (!contextual) return "";
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

async function history(userId: number, databaseId: number): Promise<ChatRow[]> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT role,content FROM olivia_conversations
      WHERE "userId"=${userId} AND "databaseId"=${databaseId}
      ORDER BY "createdAt" DESC,id DESC LIMIT 18
    `;
    return [...rows].reverse() as ChatRow[];
  } catch {
    return [];
  }
}

async function dashboard360(databaseId: number) {
  const sql = getSql();
  const [clients, loans, payments, cash, financings, vehicles, products, agents] = await Promise.all([
    sql`SELECT COUNT(*)::int count FROM clients WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COALESCE(SUM(CAST(amount AS numeric)),0) principal,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining,
      COALESCE(SUM(CAST("totalPaid" AS numeric)),0) paid,
      COUNT(*) FILTER(WHERE status='atrasado')::int overdue_contracts
      FROM loans WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pago'),0) paid,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='pendente'),0) pending,
      COALESCE(SUM(CAST(amount AS numeric)) FILTER(WHERE status='atrasado'),0) overdue,
      COUNT(*) FILTER(WHERE status='atrasado')::int overdue_count
      FROM payments WHERE "databaseId"=${databaseId}`,
    sql`SELECT
      COALESCE(SUM(CASE WHEN type='ENTRADA' THEN CAST(amount AS numeric) ELSE 0 END),0) entries,
      COALESCE(SUM(CASE WHEN type='SAIDA' THEN CAST(amount AS numeric) ELSE 0 END),0) exits
      FROM cash_flow WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count,
      COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) remaining
      FROM "vehicleFinancings" WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM vehicles WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM products WHERE "databaseId"=${databaseId}`,
    sql`SELECT COUNT(*)::int count FROM agents WHERE "databaseId"=${databaseId}`,
  ]);
  return { clients: clients[0], loans: loans[0], payments: payments[0], cash: cash[0], financings: financings[0], vehicles: vehicles[0], products: products[0], agents: agents[0] };
}

async function client360(databaseId: number, search: string) {
  const sql = getSql();
  const like = `%${search}%`;
  const clients = await sql`
    SELECT id,name,cpf,email,phone,whatsapp,profession,city,state,notes,"createdAt","updatedAt"
    FROM clients WHERE "databaseId"=${databaseId}
    AND (name ILIKE ${like} OR phone ILIKE ${like} OR whatsapp ILIKE ${like} OR cpf ILIKE ${like})
    ORDER BY "updatedAt" DESC LIMIT 10
  `;
  if (!clients.length) return { search, clients: [] };
  const ids = (clients as any[]).map(row => row.id);
  const [loans, payments, interestHistory, financings, vehicles, sales, cash] = await Promise.all([
    sql`SELECT l.*,c.name "clientName" FROM loans l JOIN clients c ON c.id=l."clientId"
      WHERE l."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY l."updatedAt" DESC LIMIT 100`,
    sql`SELECT p.*,c.name "clientName" FROM payments p
      LEFT JOIN loans l ON l.id=p."loanId" LEFT JOIN clients c ON c.id=l."clientId"
      WHERE p."databaseId"=${databaseId} AND (l."clientId"=ANY(${ids}) OR p."vehicleFinancingId" IN (
        SELECT id FROM "vehicleFinancings" WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids})
      )) ORDER BY p."dueDate" DESC LIMIT 160`,
    sql`SELECT h.*,l."clientId" FROM loan_interest_history h JOIN loans l ON l.id=h."loanId"
      WHERE h."databaseId"=${databaseId} AND l."clientId"=ANY(${ids}) ORDER BY h."createdAt" DESC LIMIT 120`,
    sql`SELECT vf.*,c.name "clientName" FROM "vehicleFinancings" vf LEFT JOIN clients c ON c.id=vf."clientId"
      WHERE vf."databaseId"=${databaseId} AND vf."clientId"=ANY(${ids}) ORDER BY vf."updatedAt" DESC LIMIT 100`,
    sql`SELECT * FROM vehicles WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "updatedAt" DESC LIMIT 80`,
    sql`SELECT vs.*,v.brand,v.model,v.plate FROM vehicle_sales vs JOIN vehicles v ON v.id=vs."vehicleId"
      WHERE vs."databaseId"=${databaseId} AND vs."clientId"=ANY(${ids}) ORDER BY vs."saleDate" DESC LIMIT 80`,
    sql`SELECT id,type,category,description,amount,"movementDate","clientId",responsible,notes
      FROM cash_flow WHERE "databaseId"=${databaseId} AND "clientId"=ANY(${ids}) ORDER BY "movementDate" DESC LIMIT 120`,
  ]);

  const portfolio = (clients as any[]).map(client => {
    const clientLoans = (loans as any[]).filter(row => row.clientId === client.id);
    const clientFinancings = (financings as any[]).filter(row => row.clientId === client.id);
    const clientPayments = (payments as any[]).filter(row => row.clientName === client.name);
    const sum = (rows: any[], key: string) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
    return {
      clientId: client.id,
      name: client.name,
      loanCount: clientLoans.length,
      loanRemaining: Math.round(sum(clientLoans, "remainingBalance") * 100) / 100,
      financingCount: clientFinancings.length,
      financingRemaining: Math.round(sum(clientFinancings, "remainingBalance") * 100) / 100,
      overduePayments: clientPayments.filter(row => row.status === "atrasado").length,
      overdueAmount: Math.round(sum(clientPayments.filter(row => row.status === "atrasado"), "amount") * 100) / 100,
      totalPaid: Math.round(sum(clientPayments.filter(row => row.status === "pago"), "amount") * 100) / 100,
    };
  });

  return { search, clients, portfolio, loans, payments, interestHistory, financings, vehicles, vehicleSales: sales, cashFlow: cash };
}

async function portfolioCross(databaseId: number) {
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
      SELECT l."clientId",
        COUNT(*) FILTER(WHERE p.status='atrasado') overdue_count,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='atrasado'),0) overdue_amount,
        COALESCE(SUM(CAST(p.amount AS numeric)) FILTER(WHERE p.status='pago'),0) paid_amount
      FROM payments p JOIN loans l ON l.id=p."loanId"
      WHERE p."databaseId"=${databaseId} GROUP BY l."clientId"
    ) p ON p."clientId"=c.id
    LEFT JOIN (
      SELECT "clientId",COUNT(*) financing_count,COALESCE(SUM(CAST("remainingBalance" AS numeric)),0) financing_remaining
      FROM "vehicleFinancings" WHERE "databaseId"=${databaseId} GROUP BY "clientId"
    ) f ON f."clientId"=c.id
    WHERE c."databaseId"=${databaseId}
    ORDER BY (COALESCE(l.loan_remaining,0)+COALESCE(f.financing_remaining,0)+COALESCE(p.overdue_amount,0)) DESC
    LIMIT 120
  `;
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

    const recent = await history(context.user.id, context.database.id);
    const search = extractSearch(message, recent);
    const canRead = context.user.role === "super_admin" || (context.user.canView === true && context.user.dashboardOnly !== true);
    const dashboardOnly = context.user.dashboardOnly === true && context.user.canView === true;

    let operational: unknown = { access: "general_knowledge_only" };
    if (canRead) {
      const [summary, portfolio, entity] = await Promise.all([
        dashboard360(context.database.id),
        portfolioCross(context.database.id),
        search ? client360(context.database.id, search) : Promise.resolve(null),
      ]);
      operational = {
        databaseScope: { id: context.database.id, name: context.database.name, rule: "single_database_only" },
        summary,
        portfolioCross: portfolio,
        client360: entity,
      };
    } else if (dashboardOnly) {
      operational = { access: "dashboard_only", summary: await dashboard360(context.database.id) };
    }

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Usuário: ${context.user.name || context.user.username || "Usuário"}. Papel: ${context.user.role}. Banco autorizado único: ${context.database.name} (#${context.database.id}). Busca contextual: ${search || "nenhuma"}. Contexto operacional cruzado autorizado: ${JSON.stringify(operational)}. Use somente esse banco e nunca misture dados externos ou de outro databaseId.`,
          },
          ...recent.map(item => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[Olivia Complete] AI gateway status", response.status);
      return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });
    }
    const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return sendJson(res, 502, { error: "A Olivia não retornou uma resposta válida." });
    return sendJson(res, 200, { reply, databaseId: context.database.id, search: search || null });
  } catch (error) {
    console.error("[Olivia Complete]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
