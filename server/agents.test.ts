import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { agents, cashFlow, payments } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";

describe("agentes comissionados", () => {
  it("cria agente, calcula 2,5%, registra histórico e bloqueia agente inativo", async () => {
    let activeDb = await db.getActiveDatabase();
    let createdDatabaseId: number | undefined;
    const suffix = Date.now();
    if (!activeDb) {
      const databaseName = `Banco de teste de agentes ${suffix}`;
      await db.createDatabase({ name: databaseName, description: "Banco temporário para teste", type: "novo", isActive: true, createdBy: 1 });
      activeDb = (await db.getAllDatabases()).find((item) => item.name === databaseName);
      createdDatabaseId = activeDb?.id;
    }
    expect(activeDb).toBeDefined();
    const agentName = `Agente de teste ${suffix}`;
    const clientName = `Cliente de teste ${suffix}`;
    const clientEmail = `cliente-${suffix}@example.com`;
    const ctx = {
      user: {
        id: 1,
        openId: "agent-test-user",
        username: "Draco",
        passwordHash: null,
        name: "Draco",
        email: "draco@example.com",
        loginMethod: "local",
        role: "super_admin",
        canView: true,
        canInsert: true,
        canEdit: true,
        canDelete: true,
        canGenerateReports: true,
        canAccessSettings: true,
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => undefined, cookie: () => undefined },
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);

    let clientId: number | undefined;
    let loanId: number | undefined;
    let openLoanId: number | undefined;
    let agentId: number | undefined;
    const paymentIds: number[] = [];
    const databaseId = activeDb!.id;

    try {
      await db.setActiveDatabase(databaseId);
      await caller.clients.create({ name: clientName, email: clientEmail });
      const client = (await db.getClientsByDatabase(databaseId)).find((item) => item.name === clientName);
      expect(client).toBeDefined();
      clientId = client!.id;

      await caller.loans.create({
        clientId,
        amount: "3000.00",
        interestRate: "0.00",
        installments: 5,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        description: "Empréstimo para teste de comissão",
      });
      const loan = (await db.getLoansByDatabase(databaseId)).find((item) => item.clientId === clientId);
      expect(loan).toBeDefined();
      loanId = loan!.id;

      await caller.loans.create({
        clientId,
        amount: "500.00",
        interestRate: "5.00",
        startDate: new Date().toISOString(),
        description: "Contrato aberto sem parcelas",
      });
      const openLoan = (await db.getLoansByDatabase(databaseId)).find((item) => item.description === "Contrato aberto sem parcelas");
      expect(openLoan).toBeDefined();
      openLoanId = openLoan!.id;
      expect(openLoan!.installments).toBe(1);

      await expect(caller.agents.create({ name: agentName, defaultCommissionPercentage: 2.5 })).resolves.toBeDefined();
      const agent = (await db.getAgentsByDatabase(databaseId)).find((item) => item.name === agentName);
      expect(agent).toBeDefined();
      agentId = agent!.id;
      expect(Number(agent!.defaultCommissionPercentage)).toBe(2.5);

      await db.setActiveDatabase(databaseId);
      const paymentDate = new Date().toISOString();
      const cases = [
        { installmentNumber: 1, amount: "1000.00", percentage: undefined, commission: 25, net: 975 },
        { installmentNumber: 2, amount: "100.00", percentage: 1, commission: 1, net: 99 },
        { installmentNumber: 3, amount: "200.00", percentage: 5, commission: 10, net: 190 },
        { installmentNumber: 4, amount: "100.00", percentage: 10, commission: 10, net: 90 },
        { installmentNumber: 5, amount: "400.00", percentage: 2.5, commission: 10, net: 390 },
      ];
      for (const item of cases) {
        await caller.payments.create({
          loanId,
          installmentNumber: item.installmentNumber,
          amount: item.amount,
          paymentDate,
          dueDate: paymentDate,
          status: "pago",
          agentId,
          ...(item.percentage === undefined ? {} : { commissionPercentage: item.percentage }),
        });
      }
      const agentPayments = (await db.getPaymentsByLoan(loanId, databaseId)).filter((item) => item.agentId === agentId);
      expect(agentPayments).toHaveLength(5);
      for (const [index, item] of cases.entries()) {
        expect(Number(agentPayments[index]!.commissionPercentage)).toBe(item.percentage ?? 2.5);
        expect(Number(agentPayments[index]!.commissionAmount)).toBe(item.commission);
        expect(Number(agentPayments[index]!.netAmount)).toBe(item.net);
        paymentIds.push(agentPayments[index]!.id);
      }

      await caller.payments.create({
        loanId,
        installmentNumber: 6,
        amount: "50.55",
        paymentDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        status: "pago",
      });
      const noAgentPayment = (await db.getPaymentsByLoan(loanId, databaseId)).find((item) => item.installmentNumber === 6);
      expect(noAgentPayment).toBeDefined();
      expect(Number(noAgentPayment!.commissionAmount)).toBe(0);
      expect(Number(noAgentPayment!.netAmount)).toBe(50.55);
      paymentIds.push(noAgentPayment!.id);

      const cashEntries = (await db.getCashFlowByDatabase(databaseId)).filter((entry) => entry.loanId === loanId);
      expect(cashEntries).toHaveLength(6);
      expect(cashEntries.every((entry) => entry.type === "ENTRADA")).toBe(true);

      const history = await caller.agents.history({ agentId });
      expect(history.totals.totalPayments).toBe(5);
      expect(history.totals.totalCommission).toBe(56);

      await expect(caller.payments.create({
        loanId,
        installmentNumber: 1,
        amount: "1000.00",
        paymentDate,
        dueDate: paymentDate,
        status: "pago",
        agentId,
      })).rejects.toMatchObject({ code: "CONFLICT" });

      const futurePerformance = await caller.dashboard.agentPerformance({
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      });
      expect(futurePerformance.kpis.totalPayments).toBe(0);

      const performance = await caller.dashboard.agentPerformance();
      expect(performance.kpis.totalCommissions).toBeGreaterThanOrEqual(25);
      expect(performance.ranking.some((item) => item.agentId === agentId)).toBe(true);

      await caller.cashFlow.create({ type: "SAIDA", category: `TESTE_SAIDA_${suffix}`, description: "Saída manual de teste", amount: 35, movementDate: new Date().toISOString() });
      const manualOut = (await db.getCashFlowByDatabase(databaseId)).find((entry) => entry.category === `TESTE_SAIDA_${suffix}`);
      expect(manualOut?.type).toBe("SAIDA");
      const dashboardStats = await caller.dashboard.stats();
      expect(Number(dashboardStats?.totalSaidas)).toBeGreaterThanOrEqual(35);

      await caller.agents.deactivate({ id: agentId });
      const historyAfterDeactivation = await caller.agents.history({ agentId });
      expect(historyAfterDeactivation.totals.totalPayments).toBe(5);
      await expect(caller.payments.create({
        loanId,
        installmentNumber: 2,
        amount: "100.00",
        paymentDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        status: "pago",
        agentId,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      for (const paymentId of paymentIds) await db.deletePayment(paymentId);
      if (agentId) {
        const connection = await db.getDb();
        if (connection) {
          await connection.delete(cashFlow).where(eq(cashFlow.category, `TESTE_SAIDA_${suffix}`));
          await connection.delete(payments).where(eq(payments.agentId, agentId));
          await connection.delete(agents).where(eq(agents.id, agentId));
        }
      }
      if (openLoanId) await db.deleteLoan(openLoanId);
      if (loanId) await db.deleteLoan(loanId);
      if (clientId) await db.deleteClient(clientId);
      if (createdDatabaseId) await db.deleteDatabase(createdDatabaseId);
    }
  }, 15000);
});
