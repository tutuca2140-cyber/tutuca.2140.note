import { solveOliviaCalculation } from "./olivia-calculators.js";

type TestCase = {
  id: string;
  question: string;
  field: string;
  expected: number;
  tolerance: number;
};

const FINANCE: TestCase[] = [
  {
    id: "simple_interest",
    question: "Calcule juros simples de R$ 10.000 a 2% ao mês por 5 meses. Informe juros e montante.",
    field: "interest",
    expected: 1000,
    tolerance: 0.01,
  },
  {
    id: "compound_interest",
    question: "Calcule o valor futuro de R$ 5.000 aplicados a juros compostos de 1,5% ao mês por 12 meses.",
    field: "amount",
    expected: 5978.0908573076695,
    tolerance: 0.01,
  },
  {
    id: "present_value",
    question: "Qual o valor presente de R$ 12.100 recebidos daqui a 2 anos, descontando a 10% ao ano com capitalização composta anual?",
    field: "presentValue",
    expected: 10000,
    tolerance: 0.01,
  },
  {
    id: "equivalent_rate",
    question: "Uma taxa efetiva de 1% ao mês equivale a qual taxa efetiva ao ano? Use capitalização composta.",
    field: "annualRate",
    expected: 0.12682503013196977,
    tolerance: 0.0000001,
  },
  {
    id: "price_payment",
    question: "No sistema Price, qual a prestação mensal de um financiamento de R$ 10.000, taxa de 2% ao mês, em 12 parcelas iguais, sem entrada?",
    field: "payment",
    expected: 945.5959662295144,
    tolerance: 0.01,
  },
  {
    id: "npv",
    question: "Calcule o VPL de um investimento com desembolso inicial de R$ 1.000 e entradas de R$ 400 ao fim de cada um dos próximos 3 anos, usando taxa de desconto de 10% ao ano.",
    field: "npv",
    expected: -5.259203606311189,
    tolerance: 0.01,
  },
];

const PHYSICS: TestCase[] = [
  {
    id: "speed",
    question: "Um carro percorre 150 km em 3 horas com velocidade média constante. Qual é a velocidade média em km/h?",
    field: "speed",
    expected: 50,
    tolerance: 0.0001,
  },
  {
    id: "acceleration",
    question: "Um corpo aumenta sua velocidade de 10 m/s para 30 m/s em 5 s com aceleração constante. Qual é a aceleração média?",
    field: "acceleration",
    expected: 4,
    tolerance: 0.0001,
  },
  {
    id: "newton",
    question: "Qual força resultante atua sobre uma massa de 12 kg submetida a aceleração de 3 m/s²?",
    field: "force",
    expected: 36,
    tolerance: 0.0001,
  },
  {
    id: "kinetic_energy",
    question: "Qual é a energia cinética de um corpo de 2 kg movendo-se a 10 m/s?",
    field: "energy",
    expected: 100,
    tolerance: 0.0001,
  },
  {
    id: "potential_energy",
    question: "Qual é a energia potencial gravitacional de um corpo de 5 kg a 10 m de altura? Use g = 9,8 m/s².",
    field: "energy",
    expected: 490,
    tolerance: 0.0001,
  },
  {
    id: "ohm",
    question: "Um resistor de 4 ohms está ligado a uma tensão de 12 V. Qual corrente elétrica o atravessa, pela lei de Ohm?",
    field: "current",
    expected: 3,
    tolerance: 0.0001,
  },
];

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido" });
  }
  if (process.env.VERCEL_ENV !== "preview") {
    return res.status(404).json({ error: "Disponível apenas no ambiente de teste" });
  }

  const group = String(req.query?.group || "finance").toLowerCase();
  const cases = group === "physics" ? PHYSICS : FINANCE;
  const results = cases.map(test => {
    const calculation = solveOliviaCalculation(test.question);
    const actualRaw = calculation?.result?.[test.field];
    const actual = typeof actualRaw === "number" ? actualRaw : null;
    const passed = actual !== null && Math.abs(actual - test.expected) <= test.tolerance;
    return {
      id: test.id,
      question: test.question,
      expected: test.expected,
      actual,
      passed,
      topic: calculation?.topic ?? null,
      reply: calculation?.reply ?? null,
    };
  });

  const passed = results.filter(item => item.passed).length;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    group,
    passed,
    total: results.length,
    allPassed: passed === results.length,
    results,
  });
}
