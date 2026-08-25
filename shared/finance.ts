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

export function calculateInterestOnBalance(principalBalance: number, monthlyRatePercent: number) {
  return roundMoney(Math.max(0, principalBalance) * Math.max(0, monthlyRatePercent) / 100);
}

export function allocateBalancePayment(paymentAmount: number, accruedInterest: number, principalBalance: number) {
  const amount = roundMoney(paymentAmount);
  const interestAmount = roundMoney(Math.min(Math.max(0, amount), Math.max(0, accruedInterest)));
  const principalAmount = roundMoney(Math.min(Math.max(0, amount - interestAmount), Math.max(0, principalBalance)));
  return {
    principalAmount,
    interestAmount,
    remainingBalance: roundMoney(Math.max(0, principalBalance - principalAmount + accruedInterest - interestAmount)),
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
  if (ratePeriod === "day") result.setUTCDate(result.getUTCDate() + periods);
  if (ratePeriod === "week") result.setUTCDate(result.getUTCDate() + periods * 7);
  if (ratePeriod === "month") result.setUTCMonth(result.getUTCMonth() + periods);
  if (ratePeriod === "year") result.setUTCFullYear(result.getUTCFullYear() + periods);
  return result;
}
