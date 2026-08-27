const SYSTEM_PROMPT = `Você é Olivia, a assistente virtual inteligente do ERP Note Note.

INTERAÇÃO HUMANA
- Converse de forma natural, fluida, direta e contextual, como uma excelente assistente profissional.
- Responda primeiro ao que a pessoa realmente perguntou.
- Não recite capacidades, regras ou limitações sem necessidade.
- Adapte o nível técnico e o tamanho da resposta à pergunta.
- Não finja sentimentos, experiências, ações ou certezas que não existem.

CONHECIMENTO
- Você domina matemática básica e avançada, álgebra, geometria, trigonometria, cálculo, estatística e probabilidade.
- Você domina matemática financeira e econômica: juros simples e compostos, amortização, VP, VF, TIR, VPL, taxas equivalentes, elasticidade, otimização e séries temporais.
- Você domina física, mecânica, energia, termodinâmica, eletricidade, ondas, óptica e fundamentos de relatividade.
- Você sabe calcular intervalos de tempo, datas, distância, velocidade, aceleração, escalas e conversões.

Ao resolver cálculos, mostre a fórmula essencial, substitua os valores corretamente, preserve unidades e dê o resultado numérico final com arredondamento adequado. Se houver mais de uma convenção possível, declare a convenção usada.`;

type TestCase = { id: string; question: string };

const FINANCE: TestCase[] = [
  { id: "simple_interest", question: "Calcule juros simples de R$ 10.000 a 2% ao mês por 5 meses. Informe juros e montante." },
  { id: "compound_interest", question: "Calcule o valor futuro de R$ 5.000 aplicados a juros compostos de 1,5% ao mês por 12 meses." },
  { id: "present_value", question: "Qual o valor presente de R$ 12.100 recebidos daqui a 2 anos, descontando a 10% ao ano com capitalização composta anual?" },
  { id: "equivalent_rate", question: "Uma taxa efetiva de 1% ao mês equivale a qual taxa efetiva ao ano? Use capitalização composta." },
  { id: "price_payment", question: "No sistema Price, qual a prestação mensal de um financiamento de R$ 10.000, taxa de 2% ao mês, em 12 parcelas iguais, sem entrada?" },
  { id: "npv", question: "Calcule o VPL de um investimento com desembolso inicial de R$ 1.000 e entradas de R$ 400 ao fim de cada um dos próximos 3 anos, usando taxa de desconto de 10% ao ano." }
];

const PHYSICS: TestCase[] = [
  { id: "speed", question: "Um carro percorre 150 km em 3 horas com velocidade média constante. Qual é a velocidade média em km/h?" },
  { id: "acceleration", question: "Um corpo aumenta sua velocidade de 10 m/s para 30 m/s em 5 s com aceleração constante. Qual é a aceleração média?" },
  { id: "newton", question: "Qual força resultante atua sobre uma massa de 12 kg submetida a aceleração de 3 m/s²?" },
  { id: "kinetic_energy", question: "Qual é a energia cinética de um corpo de 2 kg movendo-se a 10 m/s?" },
  { id: "potential_energy", question: "Qual é a energia potencial gravitacional de um corpo de 5 kg a 10 m de altura? Use g = 9,8 m/s²." },
  { id: "ohm", question: "Um resistor de 4 ohms está ligado a uma tensão de 12 V. Qual corrente elétrica o atravessa, pela lei de Ohm?" }
];

async function ask(question: string, token: string, model: string) {
  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ]
    })
  });
  const raw = await response.text();
  if (!response.ok) return { status: response.status, reply: null, gatewayError: raw.slice(0, 300) };
  const data = JSON.parse(raw) as any;
  return { status: response.status, reply: data?.choices?.[0]?.message?.content?.trim() || null };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (process.env.VERCEL_ENV !== "preview") {
    return res.status(404).json({ error: "Disponível apenas no ambiente de teste" });
  }

  const explicitKey = process.env.AI_GATEWAY_API_KEY;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const token = explicitKey || oidcToken;
  const model = process.env.OLIVIA_AI_MODEL || "openai/gpt-5.6-sol";

  if (!token) {
    return res.status(503).json({
      error: "Olivia AI não configurada",
      hasGatewayKey: false,
      hasOidcToken: false,
      model
    });
  }

  const group = String(req.query?.group || "finance").toLowerCase();
  const cases = group === "physics" ? PHYSICS : FINANCE;
  const results = await Promise.all(cases.map(async item => ({
    id: item.id,
    question: item.question,
    ...(await ask(item.question, token, model))
  })));

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    group,
    model,
    authSource: explicitKey ? "AI_GATEWAY_API_KEY" : "VERCEL_OIDC_TOKEN",
    results
  });
}
