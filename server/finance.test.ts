import { describe, expect, it } from "vitest";
import { allocateBalancePayment, allocatePayment, calculateInterestOnBalance, calculateLoanPlan, addPeriods } from "../shared/finance";

describe("finance utilities", () => {
  it("calcula juros simples com parcelas e período configuráveis", () => {
    const plan = calculateLoanPlan({ principal: 1000, ratePercent: 2, periods: 3, interestType: "simple", ratePeriod: "month" });
    expect(plan.totalAmount).toBe(1060);
    expect(plan.installmentAmount).toBe(353.33);
  });

  it("calcula juros compostos de forma determinística", () => {
    const plan = calculateLoanPlan({ principal: 1000, ratePercent: 10, periods: 2, interestType: "compound", ratePeriod: "month" });
    expect(plan.totalAmount).toBe(1210);
    expect(plan.installmentAmount).toBe(605);
  });

  it("aloca primeiro os juros e mantém o saldo monetário preciso", () => {
    const allocation = allocatePayment(200, 1100, 100, 0, 1100);
    expect(allocation.interestAmount).toBe(18.18);
    expect(allocation.principalAmount).toBe(181.82);
    expect(allocation.remainingBalance).toBe(900);
  });

  it("calcula juros mensais sobre o saldo principal atual", () => {
    expect(calculateInterestOnBalance(1000, 10)).toBe(100);
    expect(calculateInterestOnBalance(800, 10)).toBe(80);
  });

  it("quita juros acumulados antes de amortizar o principal", () => {
    const allocation = allocateBalancePayment(300, 100, 1000);
    expect(allocation.interestAmount).toBe(100);
    expect(allocation.principalAmount).toBe(200);
    expect(allocation.remainingBalance).toBe(800);
  });

  it("permite pagamento somente de juros sem reduzir o principal", () => {
    const allocation = allocateBalancePayment(100, 100, 1000);
    expect(allocation.interestAmount).toBe(100);
    expect(allocation.principalAmount).toBe(0);
    expect(allocation.remainingBalance).toBe(1000);
  });

  it("avança períodos mensais sem depender do fuso local", () => {
    const result = addPeriods(new Date("2026-01-15T12:00:00.000Z"), 2, "month");
    expect(result.toISOString()).toBe("2026-03-15T12:00:00.000Z");
  });
});
