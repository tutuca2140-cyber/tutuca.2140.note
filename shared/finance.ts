export type InterestType = "simple" | "compound";
export type RatePeriod = "day" | "week" | "month" | "year";

export interface LoanPlanInput {
  principal: number;
  ratePercent: number;
  periods: number;
  interestType: InterestType;
  ratePeriod: RatePeriod;
}

export interface LoanPlan {
  principal: number;
  interestAmount: number;
  totalAmount: number;
  installmentAmount: number;
  periods: number;
  ratePercent: number;
  interestType: InterestType;
  ratePeriod: RatePeriod;
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateLoanPlan(input: LoanPlanInput): LoanPlan {
  const principal = roundMoney(input.principal);
  const rate = input.ratePercent / 100;
  const periods = Math.max(1, Math.floor(input.periods));
  const finalAmount = input.interestType === "simple"
    ? principal * (1 + rate * periods)
    : principal * Math.pow(1 + rate, periods);
  const totalAmount = roundMoney(Math.max(principal, finalAmount));
  return {
    principal,
    interestAmount: roundMoney(totalAmount - principal),
    totalAmount,
    installmentAmount: roundMoney(totalAmount / periods),
    periods,
    ratePercent: input.ratePercent,
    interestType: input.interestType,
    ratePeriod: input.ratePeriod,
  };
}

export function allocatePayment(
  paymentAmount: number,
  totalAmount: number,
  totalInterest: number,
  interestPaid: number,
  balanceBefore: number,
) {
  const amount = roundMoney(paymentAmount);
  const remainingInterest = Math.max(0, roundMoney(totalInterest - interestPaid));
  const ratio = totalAmount > 0 ? Math.min(1, amount / totalAmount) : 0;
  const interestAmount = roundMoney(Math.min(remainingInterest, totalInterest === 0 ? 0 : totalInterest * ratio));
  const principalAmount = roundMoney(Math.max(0, amount - interestAmount));
  const remainingBalance = roundMoney(Math.max(0, balanceBefore - amount));
  return { principalAmount, interestAmount, remainingBalance };
}

export function addPeriods(startDate: Date, periods: number, ratePeriod: RatePeriod) {
  const result = new Date(startDate);
  if (ratePeriod === "day") result.setDate(result.getDate() + periods);
  if (ratePeriod === "week") result.setDate(result.getDate() + periods * 7);
  if (ratePeriod === "month") result.setMonth(result.getMonth() + periods);
  if (ratePeriod === "year") result.setFullYear(result.getFullYear() + periods);
  return result;
}
