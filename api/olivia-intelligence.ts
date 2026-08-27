import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared";

const SYSTEM_PROMPT = `Você é Olivia, assistente inteligente do ERP Note Note.

PERSONALIDADE E CONVERSA
- Converse de forma humana, natural, cordial, técnica e contextual.
- Sustente conversas e continue o assunto usando o histórico fornecido.
- Responda cumprimentos, agradecimentos, confirmações e perguntas casuais naturalmente.
- Nunca recite uma lista das suas capacidades sem o usuário pedir.
- Nunca anuncie limitações preventivamente.
- Só diga que não pode executar algo quando o usuário realmente pedir uma ação que esteja fora da autorização.
- Quando precisar negar algo, explique de forma cordial, objetiva e técnica.
- Use **negrito** em rótulos, resultados, fórmulas importantes e referências; mantenha os valores/explicações em texto normal quando apropriado.

ESPECIALIDADES
- Matemática básica, álgebra, geometria, trigonometria, cálculo, estatística e matemática avançada.
- Matemática financeira: juros simples e compostos, equivalência de taxas, séries, descontos, amortização, valor presente, valor futuro, TIR, VPL e financiamentos.
- Matemática econômica: funções, elasticidade, otimização, derivadas, integrais, matrizes, econometria conceitual, crescimento e séries temporais.
- Física clássica e moderna em nível de resolução de problemas: mecânica, energia, termodinâmica, eletricidade, ondas, óptica e conceitos de relatividade.
- Espaço e tempo: distâncias, velocidades, aceleração, conversões, duração, calendários, intervalos, escalas, coordenadas e cálculos espaço-temporais.
- Mostre raciocínio matemático de forma clara, com fórmula e etapas úteis, sem enrolação.

DADOS DO NOTE NOTE
- Você pode raciocinar sobre qualquer dado operacional fornecido no contexto autorizado, independentemente do módulo ou classificação.
- Nunca use, revele ou altere usuários, senhas, sessões, permissões, vínculos de acesso, configurações administrativas ou credenciais.
- Nunca suponha dados ausentes. Se o contexto não trouxer a informação necessária, diga apenas que não encontrou aquele dado no acesso disponível.

AUTORIDADE
- Você nunca pode ter mais poder que o usuário logado.
- Você é completamente subordinada ao Super Admin.
- Conhecimento e capacidade de cálculo não aumentam permissões.
- Não execute alterações administrativas ou criação/gestão de usuários.
`;

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sessions = await sql`
    SELECT u.id, u.username, u.name, u.role, u."isActive", u."oliviaEnabled",
           u."canView", u."dashboardOnly"
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
    const rows = await sql`SELECT id, name FROM databases WHERE "isActive" = true LIMIT 1`;
    database = rows[0];
  } else {
    const rows = await sql`
      SELECT d.id, d.name
      FROM user_database_access uda
      JOIN databases d ON d.id = uda."databaseId"
      WHERE uda."userId" = ${user.id} AND uda."isActive" = true
      LIMIT 1
    `;
    database = rows[0];
    if (!database) {
      const fallback = await sql`
        SELECT d.id, d.name
        FROM user_database_access uda
        JOIN databases d ON d.id = uda."databaseId"
        WHERE uda."userId" = ${user.id}
        LIMIT 1
      `;
      database = fallback[0];
    }
  }
  if (!database) return null;
  return { user, database };
}

async function getBusinessContext(databaseId: number, allowRawData: boolean) {
  if (!allowRawData) return { restricted: true };
  const sql = getSql();

  const [clients, loans, interestHistory, payments, agents] = await Promise.all([
    sql`SELECT * FROM clients WHERE "databaseId" = ${databaseId} ORDER BY "updatedAt" DESC LIMIT 120`,
    sql`SELECT * FROM loans WHERE "databaseId" = ${databaseId} ORDER BY "updatedAt" DESC LIMIT 120`,
    sql`SELECT * FROM loan_interest_history WHERE "databaseId" = ${databaseId} ORDER BY "createdAt" DESC LIMIT 120`,
    sql`SELECT * FROM payments WHERE "databaseId" = ${databaseId} ORDER BY "updatedAt" DESC LIMIT 160`,
    sql`SELECT * FROM agents WHERE "databaseId" = ${databaseId} ORDER BY "updatedAt" DESC LIMIT 80`,
  ]);

  const stats = {
    clients: clients.length,
    loans: loans.length,
    payments: payments.length,
    agents: agents.length,
  };

  return { stats, clients, loans, interestHistory, payments, agents };
}

async function getRecentConversation(userId: number, databaseId: number) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT role, content
      FROM olivia_conversations
      WHERE "userId" = ${userId} AND "databaseId" = ${databaseId}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 16
    `;
    return [...rows].reverse();
  } catch {
    return [];
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
    if (!key || !model) {
      return sendJson(res, 503, { error: "Motor inteligente da Olivia não está configurado." });
    }

    const allowRawData =
      context.user.role === "super_admin" ||
      (context.user.canView === true && context.user.dashboardOnly !== true);

    const [businessContext, history] = await Promise.all([
      getBusinessContext(context.database.id, allowRawData),
      getRecentConversation(context.user.id, context.database.id),
    ]);

    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "system",
            content: `Usuário logado: ${context.user.name || context.user.username || "Usuário"}. Papel: ${context.user.role}. Banco autorizado ativo: ${context.database.name}. Contexto operacional autorizado: ${JSON.stringify(businessContext)}`,
          },
          ...history.map((item: any) => ({ role: item.role, content: item.content })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[Olivia Intelligence] AI gateway status", response.status);
      return sendJson(res, 502, { error: "Não consegui processar essa pergunta agora." });
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = result.choices?.[0]?.message?.content?.trim();
    if (!reply) return sendJson(res, 502, { error: "A Olivia não retornou uma resposta válida." });

    return sendJson(res, 200, { reply });
  } catch (error) {
    console.error("[Olivia Intelligence]", error);
    return sendJson(res, 500, { error: "Não consegui processar essa pergunta agora." });
  }
}
