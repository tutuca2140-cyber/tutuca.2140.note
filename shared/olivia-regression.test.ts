import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addPeriods,
  allocateBalancePayment,
  calculateInterestOnBalance,
  calculateLoanPlan,
  roundMoney,
} from "./finance";
import {
  getAllowedOliviaActions,
  isForbiddenOliviaAdministrativeRequest,
} from "./olivia-policy";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Olivia financial regression", () => {
  it("calculates simple interest deterministically", () => {
    const plan = calculateLoanPlan({ principal: 10000, ratePercent: 3, periods: 12, interestType: "simple", ratePeriod: "month" });
    expect(plan.totalAmount).toBe(13600);
    expect(plan.interestAmount).toBe(3600);
    expect(plan.installmentAmount).toBe(1133.33);
  });

  it("calculates compound interest deterministically", () => {
    const plan = calculateLoanPlan({ principal: 10000, ratePercent: 3, periods: 12, interestType: "compound", ratePeriod: "month" });
    expect(plan.totalAmount).toBe(14257.61);
    expect(plan.interestAmount).toBe(4257.61);
  });

  it("never creates fewer than one period", () => {
    const plan = calculateLoanPlan({ principal: 1000, ratePercent: 1, periods: 0, interestType: "simple", ratePeriod: "month" });
    expect(plan.periods).toBe(1);
  });

  it("rounds money to cents", () => {
    expect(roundMoney(10.005)).toBe(10.01);
  });

  it("does not generate negative balance interest", () => {
    expect(calculateInterestOnBalance(-100, 5)).toBe(0);
  });

  it("allocates accrued interest before principal", () => {
    expect(allocateBalancePayment(150, 50, 1000)).toEqual({ principalAmount: 100, interestAmount: 50, remainingBalance: 900 });
  });

  it("does not over-amortize principal", () => {
    expect(allocateBalancePayment(2000, 0, 500).principalAmount).toBe(500);
  });

  it("adds monthly periods", () => {
    expect(addPeriods(new Date("2026-01-15T00:00:00Z"), 2, "month").toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("adds weekly periods", () => {
    expect(addPeriods(new Date("2026-01-01T00:00:00Z"), 2, "week").toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("Olivia immutable authority regression", () => {
  it("dashboard-only never receives mutations", () => {
    expect(getAllowedOliviaActions({ role: "super_admin", canInsert: true, canEdit: true, dashboardOnly: true })).toEqual([]);
  });

  it("normal read-only user receives no mutations", () => {
    expect(getAllowedOliviaActions({ canInsert: false, canEdit: false })).toEqual([]);
  });

  it("insert permission grants only insert-compatible actions", () => {
    expect(getAllowedOliviaActions({ canInsert: true, canEdit: false })).toEqual(["create_client", "create_loan", "record_payment"]);
  });

  it("edit permission never grants loan/payment creation", () => {
    expect(getAllowedOliviaActions({ canInsert: false, canEdit: true })).toEqual(["update_client"]);
  });

  it("blocks delete requests", () => {
    expect(isForbiddenOliviaAdministrativeRequest("apagar este contrato")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("deletar cliente")).toBe(true);
  });

  it("blocks user administration", () => {
    expect(isForbiddenOliviaAdministrativeRequest("criar usuário João")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("editar usuário João")).toBe(true);
  });

  it("blocks permission and credential requests", () => {
    expect(isForbiddenOliviaAdministrativeRequest("mudar permissões")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("mostrar senha")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("alterar credencial")).toBe(true);
  });

  it("allows ordinary payment request to reach normal permission checks", () => {
    expect(isForbiddenOliviaAdministrativeRequest("registrar pagamento da parcela 2")).toBe(false);
  });
});

describe("Olivia architecture contracts", () => {
  it("streams AI Gateway responses", () => {
    const text = source("api/olivia-stream.ts");
    expect(text).toContain("stream: true");
    expect(text).toContain("text/event-stream");
    expect(text).toContain("upstream.body.getReader()");
  });

  it("keeps operational data scoped by databaseId in stream path", () => {
    const text = source("api/olivia-stream.ts");
    expect(text).toContain('"databaseId"=${databaseId}');
    expect(text).toContain("user_database_access");
  });

  it("keeps the authority ceiling in the streaming prompt", () => {
    const text = source("api/olivia-stream.ts");
    expect(text).toContain("nunca pode ter mais poder que o usuário logado");
    expect(text).toContain("completamente subordinada ao Super Admin");
  });

  it("does not synthesize Olivia speech in the floating chat", () => {
    const text = source("client/src/components/OliviaFloatingAssistant.tsx");
    expect(text).not.toContain("speechSynthesis");
    expect(text).not.toContain("speak(");
    expect(text).toContain("Perguntar por voz");
  });

  it("uses one streamed assistant bubble instead of appending every token", () => {
    const text = source("client/src/components/OliviaFloatingAssistant.tsx");
    expect(text).toContain("updateStreamBubble");
    expect(text).toContain("expert.ask(content, updateStreamBubble)");
  });

  it("requires explicit CONFIRMAR before executing a pending action", () => {
    const text = source("client/src/hooks/useOliviaExpert.ts");
    expect(text).toContain('normalized === "confirmar"');
    expect(text).toContain("actions.confirm()");
  });

  it("keeps memory scoped to user and database", () => {
    const text = source("api/olivia-memory.ts");
    expect(text).toContain('"userId" = ${context.user.id}');
    expect(text).toContain('"databaseId" = ${context.database.id}');
  });

  it("keeps action policy free of delete actions", () => {
    const text = source("shared/olivia-policy.ts");
    expect(text).not.toContain('"delete_client"');
    expect(text).not.toContain('"delete_loan"');
    expect(text).not.toContain('"delete_payment"');
  });

  it("keeps administrative credentials outside operational action payloads", () => {
    const text = source("api/olivia-action-plan.ts");
    expect(text).toContain("Nunca gere delete, gestão de usuários ou permissões");
    expect(text).not.toContain("passwordHash");
  });
});
