import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { cashFlow, clients, loanInterestHistory, loans, payments } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "loan-cash-test", email: "loan-cash@example.com", name: "Loan Cash Test", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true, canView: true, canInsert: true, canEdit: true, canDelete: true, canGenerateReports: true, canAccessSettings: true },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

async function activeDatabase() {
  const active = await db.getActiveDatabase();
  if (!active) throw new Error("Nenhum banco ativo para o teste.");
  return active;
}

describe("ciclo financeiro de empréstimo e caixa", () => {
  it("cria uma única saída, edita sem duplicar e reconcilia edição/exclusão do pagamento", async () => {
    const database = await activeDatabase();
    const suffix = Date.now();
    const clientResult = await db.createClient({ databaseId: database.id, name: `Cliente ciclo ${suffix}`, createdBy: 1 });
    const clientId = Number((clientResult as unknown as Array<{ insertId?: number }>)[0]?.insertId || 0);
    const caller = appRouter.createCaller(context());
    let loanId = 0;
    let paymentId = 0;
    try {
      const created = await caller.loans.create({ clientId, amount: "1000.00", interestRate: "10", interestType: "simple", ratePeriod: "month", installments: 12, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000 * 30).toISOString(), description: `Ciclo ${suffix}` });
      loanId = created.loanId;
      let movements = await db.getCashFlowByDatabase(database.id);
      expect(movements.filter((movement) => movement.loanId === loanId && movement.category === "LIBERACAO_EMPRESTIMO")).toHaveLength(1);
      expect(Number(movements.find((movement) => movement.loanId === loanId && movement.category === "LIBERACAO_EMPRESTIMO")?.amount)).toBe(1000);

      await caller.loans.update({ id: loanId, amount: "1200.00", interestRate: "8", description: `Ciclo editado ${suffix}` });
      movements = await db.getCashFlowByDatabase(database.id);
      expect(movements.filter((movement) => movement.loanId === loanId && movement.category === "LIBERACAO_EMPRESTIMO")).toHaveLength(1);

      await caller.payments.create({ loanId, installmentNumber: 1, amount: "100.00", paymentDate: new Date().toISOString(), dueDate: new Date().toISOString(), status: "pago" });
      const payment = (await db.getPaymentsByLoan(loanId, database.id))[0];
      paymentId = payment.id;
      movements = await db.getCashFlowByDatabase(database.id);
      expect(movements.filter((movement) => movement.paymentId === paymentId)).toHaveLength(1);
      expect(Number(movements.find((movement) => movement.paymentId === paymentId)?.amount)).toBe(100);

      await caller.payments.update({ id: paymentId, amount: "200.00" });
      const edited = (await db.getPaymentsByLoan(loanId, database.id)).find((row) => row.id === paymentId);
      expect(Number(edited?.amount)).toBe(200);
      movements = await db.getCashFlowByDatabase(database.id);
      expect(movements.filter((movement) => movement.paymentId === paymentId)).toHaveLength(1);
      expect(Number(movements.find((movement) => movement.paymentId === paymentId)?.amount)).toBe(200);

      await caller.payments.delete({ id: paymentId });
      expect((await db.getPaymentsByLoan(loanId, database.id)).find((row) => row.id === paymentId)).toBeUndefined();
      expect((await db.getCashFlowByDatabase(database.id)).find((movement) => movement.paymentId === paymentId)).toBeUndefined();
      const restoredLoan = await db.getLoanById(loanId);
      expect(Number(restoredLoan?.totalPaid)).toBe(0);
      expect(Number(restoredLoan?.principalBalance)).toBe(1200);

      const deleted = await caller.loans.delete({ id: loanId });
      expect(deleted.cancelled).toBe(true);
      expect((await db.getLoanById(loanId))?.status).toBe("cancelado");
    } finally {
      const connection = await db.getDb();
      if (connection && loanId) {
        await connection.delete(cashFlow).where(and(eq(cashFlow.loanId, loanId), eq(cashFlow.databaseId, database.id)));
        await connection.delete(payments).where(and(eq(payments.loanId, loanId), eq(payments.databaseId, database.id)));
        await connection.delete(loanInterestHistory).where(and(eq(loanInterestHistory.loanId, loanId), eq(loanInterestHistory.databaseId, database.id)));
        await connection.delete(loans).where(and(eq(loans.id, loanId), eq(loans.databaseId, database.id)));
      }
      if (connection && clientId) await connection.delete(clients).where(and(eq(clients.id, clientId), eq(clients.databaseId, database.id)));
    }
  }, 20000);

  it("separa juros, amortização e entrada integral no caixa", async () => {
    const database = await activeDatabase();
    const suffix = Date.now();
    const clientResult = await db.createClient({ databaseId: database.id, name: `Cliente juros ${suffix}`, createdBy: 1 });
    const clientId = Number((clientResult as unknown as Array<{ insertId?: number }>)[0]?.insertId || 0);
    const caller = appRouter.createCaller(context());
    let loanId = 0;
    try {
      const created = await caller.loans.create({ clientId, amount: "1000.00", interestRate: "10", ratePeriod: "month", installments: 12, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000 * 30).toISOString() });
      loanId = created.loanId;
      await caller.loans.generateInterest({ loanId, periodReference: `period-${suffix}` });
      await caller.payments.create({ loanId, installmentNumber: 1, amount: "100.00", paymentDate: new Date().toISOString(), dueDate: new Date().toISOString(), status: "pago" });
      const firstPayment = (await db.getPaymentsByLoan(loanId, database.id)).find((row) => row.installmentNumber === 1)!;
      expect(Number(firstPayment.interestAmount)).toBe(100);
      expect(Number(firstPayment.principalAmount)).toBe(0);
      expect((await db.getCashFlowByDatabase(database.id)).find((movement) => movement.paymentId === firstPayment.id)?.category).toBe("JUROS_EMPRESTIMO");

      await caller.payments.create({ loanId, installmentNumber: 2, amount: "300.00", paymentDate: new Date().toISOString(), dueDate: new Date().toISOString(), status: "pago" });
      const secondPayment = (await db.getPaymentsByLoan(loanId, database.id)).find((row) => row.installmentNumber === 2)!;
      expect(Number(secondPayment.interestAmount)).toBe(0);
      expect(Number(secondPayment.principalAmount)).toBe(300);
      expect(Number((await db.getLoanById(loanId))?.principalBalance)).toBe(700);
      expect(Number((await db.getCashFlowByDatabase(database.id)).find((movement) => movement.paymentId === secondPayment.id)?.amount)).toBe(300);
    } finally {
      const connection = await db.getDb();
      if (connection && loanId) {
        await connection.delete(cashFlow).where(and(eq(cashFlow.loanId, loanId), eq(cashFlow.databaseId, database.id)));
        await connection.delete(payments).where(and(eq(payments.loanId, loanId), eq(payments.databaseId, database.id)));
        await connection.delete(loanInterestHistory).where(and(eq(loanInterestHistory.loanId, loanId), eq(loanInterestHistory.databaseId, database.id)));
        await connection.delete(loans).where(and(eq(loans.id, loanId), eq(loans.databaseId, database.id)));
      }
      if (connection && clientId) await connection.delete(clients).where(and(eq(clients.id, clientId), eq(clients.databaseId, database.id)));
    }
  }, 20000);
});
