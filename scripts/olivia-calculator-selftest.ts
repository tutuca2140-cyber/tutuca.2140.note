import { solveOliviaCalculation } from "../api/olivia-calculators";

type Case = {
  id: string;
  question: string;
  field: string;
  expected: number;
  tolerance: number;
};

const cases: Case[] = [
  { id: "finance_simple", question: "Calcule juros simples de R$ 10.000 a 2% ao mês por 5 meses. Informe juros e montante.", field: "interest", expected: 1000, tolerance: 0.01 },
  { id: "finance_compound", question: "Calcule o valor futuro de R$ 5.000 aplicados a juros compostos de 1,5% ao mês por 12 meses.", field: "amount", expected: 5978.0908573076695, tolerance: 0.01 },
  { id: "finance_pv", question: "Qual o valor presente de R$ 12.100 recebidos daqui a 2 anos, descontando a 10% ao ano com capitalização composta anual?", field: "presentValue", expected: 10000, tolerance: 0.01 },
  { id: "finance_equivalent", question: "Uma taxa efetiva de 1% ao mês equivale a qual taxa efetiva ao ano? Use capitalização composta.", field: "annualRate", expected: 0.12682503013196977, tolerance: 0.0000001 },
  { id: "finance_price", question: "No sistema Price, qual a prestação mensal de um financiamento de R$ 10.000, taxa de 2% ao mês, em 12 parcelas iguais, sem entrada?", field: "payment", expected: 945.5959662295144, tolerance: 0.01 },
  { id: "finance_vpl", question: "Calcule o VPL de um investimento com desembolso inicial de R$ 1.000 e entradas de R$ 400 ao fim de cada um dos próximos 3 anos, usando taxa de desconto de 10% ao ano.", field: "npv", expected: -5.259203606311189, tolerance: 0.01 },
  { id: "physics_speed", question: "Um carro percorre 150 km em 3 horas com velocidade média constante. Qual é a velocidade média em km/h?", field: "speed", expected: 50, tolerance: 0.0001 },
  { id: "physics_acceleration", question: "Um corpo aumenta sua velocidade de 10 m/s para 30 m/s em 5 s com aceleração constante. Qual é a aceleração média?", field: "acceleration", expected: 4, tolerance: 0.0001 },
  { id: "physics_force", question: "Qual força resultante atua sobre uma massa de 12 kg submetida a aceleração de 3 m/s²?", field: "force", expected: 36, tolerance: 0.0001 },
  { id: "physics_kinetic", question: "Qual é a energia cinética de um corpo de 2 kg movendo-se a 10 m/s?", field: "energy", expected: 100, tolerance: 0.0001 },
  { id: "physics_potential", question: "Qual é a energia potencial gravitacional de um corpo de 5 kg a 10 m de altura? Use g = 9,8 m/s².", field: "energy", expected: 490, tolerance: 0.0001 },
  { id: "physics_ohm", question: "Um resistor de 4 ohms está ligado a uma tensão de 12 V. Qual corrente elétrica o atravessa, pela lei de Ohm?", field: "current", expected: 3, tolerance: 0.0001 },
];

let passed = 0;
for (const test of cases) {
  const calculation = solveOliviaCalculation(test.question);
  const raw = calculation?.result?.[test.field];
  const actual = typeof raw === "number" ? raw : Number.NaN;
  const ok = Number.isFinite(actual) && Math.abs(actual - test.expected) <= test.tolerance;
  console.log(`[Olivia Selftest] ${ok ? "PASS" : "FAIL"} ${test.id} expected=${test.expected} actual=${Number.isFinite(actual) ? actual : "unhandled"}`);
  if (!ok) process.exitCode = 1;
  else passed += 1;
}

console.log(`[Olivia Selftest] RESULT ${passed}/${cases.length}`);
if (passed !== cases.length) throw new Error(`Olivia calculator self-test failed: ${passed}/${cases.length}`);
