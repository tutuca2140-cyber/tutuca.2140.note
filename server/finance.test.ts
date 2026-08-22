import { describe, expect, it } from "vitest";
import { allocatePayment, calculateLoanPlan, addPeriods } from "../shared/finance";

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

  it("avança períodos mensais sem depender do fuso local", () => {
    const result = addPeriods(new Date("2026-01-15T12:00:00.000Z"), 2, "month");
    expect(result.toISOString()).toBe("2026-03-15T12:00:00.000Z");
  });
});
