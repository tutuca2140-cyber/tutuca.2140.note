import { calculateLoanPlan, type InterestType } from "../../shared/finance";

export type CommercialSimulationInput = {
  principal: number;
  ratePercent: number;
  periods: number;
  interestType: InterestType;
};

export type CommercialSimulation = ReturnType<typeof calculateLoanPlan> & {
  disclaimer: string;
};

const HUMAN_DECISION_DISCLAIMER =
  "Simulação informativa. A Olivia não aprova nem concede crédito automaticamente; a decisão final é humana e segue as regras do administrador.";

function assertSimulationInput(input: CommercialSimulationInput) {
  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    throw new Error("O valor principal deve ser maior que zero.");
  }
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) {
    throw new Error("A taxa de juros não pode ser negativa.");
  }
  if (!Number.isInteger(input.periods) || input.periods <= 0) {
    throw new Error("O prazo deve conter pelo menos uma parcela.");
  }
}

export function simulateCommercialCredit(input: CommercialSimulationInput): CommercialSimulation {
  assertSimulationInput(input);
  return {
    ...calculateLoanPlan({
      principal: input.principal,
      ratePercent: input.ratePercent,
      periods: input.periods,
      interestType: input.interestType,
      ratePeriod: "month",
    }),
    disclaimer: HUMAN_DECISION_DISCLAIMER,
  };
}

export function compareCommercialScenarios(inputs: CommercialSimulationInput[]) {
  if (!inputs.length) throw new Error("Informe ao menos um cenário para comparação.");
  return inputs.map((input, index) => ({
    scenario: index + 1,
    ...simulateCommercialCredit(input),
  }));
}

export type CommercialProposalInput = CommercialSimulationInput & {
  customerName: string;
  productLabel?: string;
  validUntil?: Date;
};

export function createCommercialProposal(input: CommercialProposalInput) {
  const simulation = simulateCommercialCredit(input);
  return {
    customerName: input.customerName.trim(),
    productLabel: input.productLabel?.trim() || "Empréstimo/financiamento",
    principal: simulation.principal,
    interestType: simulation.interestType,
    ratePercent: simulation.ratePercent,
    periods: simulation.periods,
    installmentAmount: simulation.installmentAmount,
    totalAmount: simulation.totalAmount,
    validUntil: input.validUntil ?? null,
    status: "PROPOSTA" as const,
    automaticApproval: false as const,
    disclaimer: HUMAN_DECISION_DISCLAIMER,
  };
}

export type InterestedCustomer = {
  id: number;
  name: string;
  status: "NOVO" | "EM_CONTATO" | "NEGOCIANDO" | "CONVERTIDO" | "ENCERRADO";
  lastContactAt?: Date | null;
  nextFollowUpAt?: Date | null;
  notes?: string | null;
};

export function suggestCommercialFollowUp(customer: InterestedCustomer, now = new Date()) {
  if (customer.status === "CONVERTIDO" || customer.status === "ENCERRADO") {
    return { shouldFollowUp: false, reason: "Cliente sem necessidade de novo acompanhamento." };
  }
  if (!customer.nextFollowUpAt) {
    return { shouldFollowUp: true, reason: "Nenhuma próxima tentativa de contato está agendada." };
  }
  return customer.nextFollowUpAt <= now
    ? { shouldFollowUp: true, reason: "A data prevista para acompanhamento já chegou." }
    : { shouldFollowUp: false, reason: "Já existe acompanhamento futuro agendado." };
}

export function suggestNegotiationMessage(params: {
  customerName: string;
  daysOverdue?: number;
  administratorRule?: string;
}) {
  const days = Math.max(0, params.daysOverdue ?? 0);
  const rule = params.administratorRule?.trim();
  return {
    suggestion: days > 0
      ? `Entrar em contato com ${params.customerName} para negociar a pendência com tom respeitoso e objetivo.`
      : `Entrar em contato com ${params.customerName} para lembrar o próximo compromisso financeiro.` ,
    administratorRule: rule || "Seguir as regras comerciais configuradas pelo administrador.",
    automaticAction: false as const,
  };
}
