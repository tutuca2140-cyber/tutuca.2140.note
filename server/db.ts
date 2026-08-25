import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import WebSocket from "ws";
import { 
  InsertUser, users, 
  databases, InsertDatabase,
  clients, InsertClient,
  loans, InsertLoan,
  loanInterestHistory, InsertLoanInterestHistory,
  payments, InsertPayment,
  cashFlow, InsertCashFlow, CashFlow,
  vehicles, InsertVehicle,
  vehicleSales, InsertVehicleSale,
  vehicleFinancings, InsertVehicleFinancing,
  auditLogs, InsertAuditLog,
  agents, InsertAgent,
  localSessions, InsertLocalSession,
  passwordResetTokens, InsertPasswordResetToken
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { allocatePayment, allocateBalancePayment, roundMoney } from "../shared/finance";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Os fluxos financeiros usam transações interativas. O driver neon-http
      // não oferece esse recurso; WebSocket mantém empréstimo + caixa atômicos.
      _db = drizzle({ connection: process.env.DATABASE_URL, ws: WebSocket });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USERS ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    
    // Set role - owner becomes super_admin
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'super_admin';
      updateSet.role = 'super_admin';
      // Super admin gets all permissions
      values.canView = true;
      values.canInsert = true;
      values.canEdit = true;
      values.canDelete = true;
      values.canGenerateReports = true;
      values.canAccessSettings = true;
      updateSet.canView = true;
      updateSet.canInsert = true;
      updateSet.canEdit = true;
      updateSet.canDelete = true;
      updateSet.canGenerateReports = true;
      updateSet.canAccessSettings = true;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPermissions(userId: number, permissions: {
  canView?: boolean;
  canInsert?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canGenerateReports?: boolean;
  canAccessSettings?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(permissions).where(eq(users.id, userId));
}

export async function updateUserRole(userId: number, role: 'user' | 'admin' | 'super_admin') {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function toggleUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
}

export async function updateLocalUser(userId: number, data: {
  username?: string;
  email?: string;
  name?: string;
  role?: 'user' | 'admin';
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function deleteUserSessions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(localSessions).where(eq(localSessions.userId, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Reaplica a política de imutabilidade e acesso total do super administrador
 * fixo. A senha nunca é alterada por esta rotina.
 */
export async function ensureDracoIntegrity() {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.username, 'Draco')).limit(1);
  const user = result[0];
  if (!user) return undefined;

  await db.update(users).set({
    role: 'super_admin',
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
    isActive: true,
  }).where(eq(users.id, user.id));

  return {
    ...user,
    role: 'super_admin' as const,
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
    isActive: true,
  };
}

// ==================== DATABASES ====================

export async function createDatabase(data: InsertDatabase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(databases).values(data);
  return result;
}

export async function getAllDatabases() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(databases).orderBy(desc(databases.createdAt));
}

export async function getDatabaseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActiveDatabase() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(databases).where(eq(databases.isActive, true)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setActiveDatabase(id: number) {
  const db = await getDb();
  if (!db) return;
  // Desativar todos
  await db.update(databases).set({ isActive: false });
  // Ativar o selecionado
  await db.update(databases).set({ isActive: true }).where(eq(databases.id, id));
}

export async function updateDatabase(id: number, data: Partial<InsertDatabase>) {
  const db = await getDb();
  if (!db) return;
  await db.update(databases).set(data).where(eq(databases.id, id));
}

export async function deleteDatabase(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(databases).where(eq(databases.id, id));
}

// ==================== CLIENTS ====================

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  return result;
}

export async function getClientsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clients).where(eq(clients.databaseId, databaseId)).orderBy(desc(clients.createdAt));
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) return;
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function updateClientInDatabase(id: number, data: Partial<InsertClient>, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(clients).set(data).where(and(eq(clients.id, id), eq(clients.databaseId, databaseId)));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clients).where(eq(clients.id, id));
}

export async function deleteClientInDatabase(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.databaseId, databaseId)));
}

export async function getClientProfile(clientId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const clientResult = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.databaseId, databaseId))).limit(1);
  const client = clientResult[0];
  if (!client) return undefined;

  const [loanRows, vehicleRows, financingRows] = await Promise.all([
    db.select().from(loans).where(and(eq(loans.clientId, clientId), eq(loans.databaseId, databaseId))).orderBy(desc(loans.createdAt)),
    db.select().from(vehicles).where(and(eq(vehicles.clientId, clientId), eq(vehicles.databaseId, databaseId))).orderBy(desc(vehicles.createdAt)),
    db.select().from(vehicleFinancings).where(and(eq(vehicleFinancings.clientId, clientId), eq(vehicleFinancings.databaseId, databaseId))).orderBy(desc(vehicleFinancings.createdAt)),
  ]);

  const loanPayments = (await Promise.all(loanRows.map((loan) => getPaymentsByLoan(loan.id, databaseId)))).flat();
  const financingPayments = (await Promise.all(financingRows.map((financing) => getPaymentsByFinancing(financing.id, databaseId)))).flat();
  const paymentsForClient = [...loanPayments, ...financingPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  const totalPaid = roundMoney(paymentsForClient.filter((payment) => payment.status === 'pago').reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const totalInterest = roundMoney(paymentsForClient.reduce((sum, payment) => sum + Number(payment.interestAmount || 0), 0));
  const totalPrincipal = roundMoney(paymentsForClient.reduce((sum, payment) => sum + Number(payment.principalAmount || 0), 0));
  const totalCommissions = roundMoney(paymentsForClient.reduce((sum, payment) => sum + Number(payment.commissionAmount || 0), 0));
  const remainingLoanBalance = loanRows.reduce((sum, loan) => sum + Number(loan.remainingBalance || loan.totalAmount || 0), 0);
  const remainingFinancingBalance = financingRows.reduce((sum, financing) => {
    const paid = financingPayments.filter((payment) => payment.vehicleFinancingId === financing.id && payment.status === 'pago').reduce((paidSum, payment) => paidSum + Number(payment.amount || 0), 0);
    return sum + Math.max(0, Number(financing.totalAmount || financing.financedAmount || 0) - paid);
  }, 0);
  const remainingBalance = roundMoney(remainingLoanBalance + remainingFinancingBalance);

  return {
    client,
    loans: loanRows,
    vehicles: vehicleRows,
    financings: financingRows,
    payments: paymentsForClient,
    financialHistory: { totalPaid, totalInterest, totalPrincipal, totalCommissions, remainingBalance, paymentCount: paymentsForClient.length },
  };
}

// ==================== LOANS ====================

export const INITIAL_LOAN_INTEREST_PERIOD = "CONTRATO_INICIAL";

export async function createLoan(data: InsertLoan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(loans).values(data);
  return result;
}

/** Cria a liberação do empréstimo e sua saída de caixa na mesma transação. */
export async function createLoanBundle(data: InsertLoan, cashEntry: Omit<InsertCashFlow, 'loanId' | 'sourceKey'>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdLoan] = await tx.insert(loans).values(data).returning({ id: loans.id });
    const loanId = createdLoan?.id;
    if (!loanId) throw new Error("Não foi possível identificar o empréstimo criado.");
    if (Number(data.accruedInterest || 0) > 0) {
      await tx.insert(loanInterestHistory).values({
        databaseId: data.databaseId,
        loanId,
        periodReference: INITIAL_LOAN_INTEREST_PERIOD,
        previousPrincipalBalance: data.amount,
        interestGenerated: data.accruedInterest!,
        paymentAmount: '0.00',
        interestPaid: '0.00',
        principalAmortized: '0.00',
        updatedPrincipalBalance: data.amount,
      });
    }
    await tx.insert(cashFlow).values({
      ...cashEntry,
      loanId,
      sourceKey: `LOAN_RELEASE:${loanId}`,
    });
    return { loanId, result: createdLoan };
  });
}

export async function getLoanFinancialRelations(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return { payments: 0, interestHistory: 0, cashMovements: 0 };
  const [paymentRows, interestRows, cashRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(payments).where(and(eq(payments.loanId, id), eq(payments.databaseId, databaseId))),
    db.select({ count: sql<number>`count(*)` }).from(loanInterestHistory).where(and(eq(loanInterestHistory.loanId, id), eq(loanInterestHistory.databaseId, databaseId))),
    db.select({ count: sql<number>`count(*)` }).from(cashFlow).where(and(eq(cashFlow.loanId, id), eq(cashFlow.databaseId, databaseId))),
  ]);
  return {
    payments: Number(paymentRows[0]?.count || 0),
    interestHistory: Number(interestRows[0]?.count || 0),
    cashMovements: Number(cashRows[0]?.count || 0),
  };
}

/** Cancela contratos com histórico e só remove fisicamente contratos sem vínculos financeiros. */
export async function deleteLoanSafely(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const loanRows = await tx.select().from(loans).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId))).limit(1);
    const loan = loanRows[0];
    if (!loan) return { deleted: false, cancelled: false, relations: { payments: 0, interestHistory: 0, cashMovements: 0 } };
    const [paymentRows, interestRows, cashRows] = await Promise.all([
      tx.select({ count: sql<number>`count(*)` }).from(payments).where(and(eq(payments.loanId, id), eq(payments.databaseId, databaseId))),
      tx.select({ count: sql<number>`count(*)` }).from(loanInterestHistory).where(and(eq(loanInterestHistory.loanId, id), eq(loanInterestHistory.databaseId, databaseId))),
      tx.select({ count: sql<number>`count(*)` }).from(cashFlow).where(and(eq(cashFlow.loanId, id), eq(cashFlow.databaseId, databaseId))),
    ]);
    const relations = {
      payments: Number(paymentRows[0]?.count || 0),
      interestHistory: Number(interestRows[0]?.count || 0),
      cashMovements: Number(cashRows[0]?.count || 0),
    };
    const hasRelations = Object.values(relations).some((value) => value > 0);
    if (hasRelations) {
      await tx.update(loans).set({ status: 'cancelado' }).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
      return { deleted: false, cancelled: true, relations };
    }
    await tx.delete(loans).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
    return { deleted: true, cancelled: false, relations };
  });
}

/** Recalcula alocações e saldo de um empréstimo usando apenas pagamentos pagos e juros lançados. */
async function recalculateLoanWithTransaction(tx: any, loanId: number, databaseId: number) {
  const loanRows = await tx.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.databaseId, databaseId))).limit(1);
  const loan = loanRows[0];
  if (!loan) return undefined;
  const paymentRows = await tx.select().from(payments).where(and(eq(payments.loanId, loanId), eq(payments.databaseId, databaseId))).orderBy(payments.paymentDate, payments.id);
  const historyRows = await tx.select().from(loanInterestHistory).where(and(eq(loanInterestHistory.loanId, loanId), eq(loanInterestHistory.databaseId, databaseId))).orderBy(loanInterestHistory.createdAt, loanInterestHistory.id);
  let interestPool = roundMoney(historyRows.reduce((sum: number, row: any) => sum + Number(row.interestGenerated || 0), 0));
  let principalBalance = roundMoney(Number(loan.amount || 0));
  let totalPaid = 0;
  for (const payment of paymentRows) {
    if (payment.status !== 'pago') {
      await tx.update(payments).set({ principalAmount: '0.00', interestAmount: '0.00', remainingBalance: roundMoney(principalBalance + interestPool).toFixed(2) }).where(eq(payments.id, payment.id));
      continue;
    }
    const allocation = allocateBalancePayment(Number(payment.amount || 0), interestPool, principalBalance);
    interestPool = roundMoney(Math.max(0, interestPool - allocation.interestAmount));
    principalBalance = roundMoney(Math.max(0, principalBalance - allocation.principalAmount));
    totalPaid = roundMoney(totalPaid + Number(payment.amount || 0));
    await tx.update(payments).set({
      principalAmount: allocation.principalAmount.toFixed(2),
      interestAmount: allocation.interestAmount.toFixed(2),
      remainingBalance: allocation.remainingBalance.toFixed(2),
      commissionAmount: roundMoney(Number(payment.amount || 0) * Number(payment.commissionPercentage || 0) / 100).toFixed(2),
      netAmount: roundMoney(Number(payment.amount || 0) - (Number(payment.amount || 0) * Number(payment.commissionPercentage || 0) / 100)).toFixed(2),
    }).where(eq(payments.id, payment.id));
  }
  const nextStatus = loan.status === 'cancelado'
    ? 'cancelado'
    : principalBalance + interestPool <= 0
      ? 'pago'
      : new Date(loan.endDate) < new Date()
        ? 'atrasado'
        : 'ativo';
  await tx.update(loans).set({
    principalBalance: principalBalance.toFixed(2),
    accruedInterest: interestPool.toFixed(2),
    remainingBalance: roundMoney(principalBalance + interestPool).toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    status: nextStatus,
  }).where(and(eq(loans.id, loanId), eq(loans.databaseId, databaseId)));
  return { principalBalance, accruedInterest: interestPool, remainingBalance: roundMoney(principalBalance + interestPool), totalPaid, status: nextStatus };
}

export async function updatePaymentBundle(id: number, databaseId: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId))).limit(1);
    const current = rows[0];
    if (!current) return undefined;
    const merged = { ...current, ...data };
    const amount = Number(merged.amount || 0);
    const commissionAmount = roundMoney(amount * Number(merged.commissionPercentage || 0) / 100);
    await tx.update(payments).set({
      ...data,
      amount: amount.toFixed(2),
      commissionAmount: commissionAmount.toFixed(2),
      netAmount: roundMoney(amount - commissionAmount).toFixed(2),
    }).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId)));
    const loanState = current.loanId ? await recalculateLoanWithTransaction(tx, current.loanId, databaseId) : undefined;
    const updatedPaymentRows = await tx.select().from(payments).where(eq(payments.id, id)).limit(1);
    const updatedPayment = updatedPaymentRows[0];
    const paymentCategory = current.loanId
      ? Number(updatedPayment?.interestAmount || 0) > 0 && Number(updatedPayment?.principalAmount || 0) === 0 ? 'JUROS_EMPRESTIMO' : loanState?.status === 'pago' ? 'QUITACAO_EMPRESTIMO' : 'PAGAMENTO_EMPRESTIMO'
      : 'PAGAMENTO_FINANCIAMENTO';
    const paymentCashRows = await tx.select().from(cashFlow).where(and(eq(cashFlow.paymentId, id), eq(cashFlow.databaseId, databaseId))).limit(1);
    if (merged.status === 'pago') {
      const cashData = {
        databaseId,
        type: 'ENTRADA' as const,
        category: paymentCategory,
        description: current.loanId ? `Recebimento do empréstimo #${current.loanId}` : `Recebimento do financiamento #${current.vehicleFinancingId}`,
        amount: amount.toFixed(2),
        movementDate: merged.paymentDate,
        clientId: undefined,
        loanId: current.loanId ?? undefined,
        paymentId: id,
        sourceKey: `PAYMENT:${id}`,
        responsible: undefined,
        notes: merged.notes,
        createdBy: current.createdBy,
      };
      if (paymentCashRows[0]) await tx.update(cashFlow).set(cashData).where(eq(cashFlow.id, paymentCashRows[0].id));
      else await tx.insert(cashFlow).values(cashData);
    } else if (paymentCashRows[0]) {
      await tx.delete(cashFlow).where(eq(cashFlow.id, paymentCashRows[0].id));
    }
    return current.loanId ? { payment: updatedPayment, loanState } : { payment: { ...merged, amount }, loanState: undefined };
  });
}

export async function deletePaymentBundle(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId))).limit(1);
    const payment = rows[0];
    if (!payment) return undefined;
    await tx.delete(cashFlow).where(and(eq(cashFlow.paymentId, id), eq(cashFlow.databaseId, databaseId)));
    await tx.delete(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId)));
    const loanState = payment.loanId ? await recalculateLoanWithTransaction(tx, payment.loanId, databaseId) : undefined;
    return { payment, loanState };
  });
}

export async function getLoansByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans).where(eq(loans.databaseId, databaseId)).orderBy(desc(loans.createdAt));
}

export async function getLoanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateLoan(id: number, data: Partial<InsertLoan>) {
  const db = await getDb();
  if (!db) return;
  await db.update(loans).set(data).where(eq(loans.id, id));
}

export async function updateLoanBalance(id: number, databaseId: number, data: Partial<InsertLoan>) {
  const db = await getDb();
  if (!db) return;
  await db.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
}

export async function updateLoanInDatabase(id: number, databaseId: number, data: Partial<InsertLoan>, initialInterest?: number) {
  const db = await getDb();
  if (!db) return;
  return db.transaction(async (tx) => {
    await tx.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));

    if (initialInterest !== undefined) {
      const initialRows = await tx.select().from(loanInterestHistory).where(and(
        eq(loanInterestHistory.loanId, id),
        eq(loanInterestHistory.databaseId, databaseId),
        eq(loanInterestHistory.periodReference, INITIAL_LOAN_INTEREST_PERIOD),
      )).limit(1);
      const principal = String(data.amount || '0.00');
      if (initialInterest > 0) {
        const historyValues = {
          previousPrincipalBalance: principal,
          interestGenerated: roundMoney(initialInterest).toFixed(2),
          paymentAmount: '0.00',
          interestPaid: '0.00',
          principalAmortized: '0.00',
          updatedPrincipalBalance: principal,
        };
        if (initialRows[0]) {
          await tx.update(loanInterestHistory).set(historyValues).where(eq(loanInterestHistory.id, initialRows[0].id));
        } else {
          await tx.insert(loanInterestHistory).values({
            databaseId,
            loanId: id,
            periodReference: INITIAL_LOAN_INTEREST_PERIOD,
            ...historyValues,
          });
        }
      } else if (initialRows[0]) {
        await tx.delete(loanInterestHistory).where(eq(loanInterestHistory.id, initialRows[0].id));
      }
      await recalculateLoanWithTransaction(tx, id, databaseId);
    }

    const cashUpdate: Partial<InsertCashFlow> = {};
    if (data.amount !== undefined) cashUpdate.amount = data.amount;
    if (data.startDate !== undefined) cashUpdate.movementDate = data.startDate;
    if (data.clientId !== undefined) cashUpdate.clientId = data.clientId;
    if (data.description !== undefined) cashUpdate.notes = data.description;
    if (Object.keys(cashUpdate).length > 0) {
      await tx.update(cashFlow).set(cashUpdate).where(and(
        eq(cashFlow.loanId, id),
        eq(cashFlow.databaseId, databaseId),
        eq(cashFlow.category, 'LIBERACAO_EMPRESTIMO'),
      ));
    }
  });
}

export async function deleteLoan(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(loans).where(eq(loans.id, id));
}

export async function deleteLoanInDatabase(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(loans).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
}

export async function getLoansByClient(clientId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans)
    .where(and(eq(loans.clientId, clientId), eq(loans.databaseId, databaseId)))
    .orderBy(desc(loans.createdAt));
}

export async function getLoanInterestHistory(loanId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanInterestHistory)
    .where(and(eq(loanInterestHistory.loanId, loanId), eq(loanInterestHistory.databaseId, databaseId)))
    .orderBy(desc(loanInterestHistory.createdAt));
}

export async function getLoanInterestPeriod(loanId: number, databaseId: number, periodReference: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(loanInterestHistory).where(and(
    eq(loanInterestHistory.loanId, loanId),
    eq(loanInterestHistory.databaseId, databaseId),
    eq(loanInterestHistory.periodReference, periodReference),
  )).limit(1);
  return rows[0];
}

export async function createLoanInterestHistory(data: InsertLoanInterestHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(loanInterestHistory).values(data);
}

// ==================== AGENTS ====================

export async function createAgent(data: InsertAgent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(agents).values(data).returning();
  if (!created) throw new Error("Não foi possível confirmar o agente criado.");
  return created;
}

export async function getAgentsByDatabase(databaseId: number, includeInactive = true) {
  const db = await getDb();
  if (!db) return [];
  const conditions = includeInactive
    ? eq(agents.databaseId, databaseId)
    : and(eq(agents.databaseId, databaseId), eq(agents.status, 'ACTIVE'));
  return await db.select().from(agents).where(conditions).orderBy(agents.name);
}

export async function getAgentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return result[0];
}

export async function updateAgent(id: number, data: Partial<InsertAgent>, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(agents).set(data).where(and(eq(agents.id, id), eq(agents.databaseId, databaseId)));
}

export async function deactivateAgent(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(agents).set({ status: 'INACTIVE' }).where(and(eq(agents.id, id), eq(agents.databaseId, databaseId)));
}

export async function getAgentPaymentHistory(agentId: number, databaseId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return { payments: [], totals: { totalPayments: 0, totalPaymentAmount: 0, totalCommission: 0, averageCommission: 0 } };

  const conditions = [eq(payments.agentId, agentId), eq(payments.databaseId, databaseId)];
  if (startDate) conditions.push(sql`${payments.paymentDate} >= ${startDate}` as any);
  if (endDate) conditions.push(sql`${payments.paymentDate} <= ${endDate}` as any);

  const rows = await db.select({
    id: payments.id,
    paymentDate: payments.paymentDate,
    loanId: payments.loanId,
    paymentAmount: payments.amount,
    commissionPercentage: payments.commissionPercentage,
    commissionAmount: payments.commissionAmount,
    netAmount: payments.netAmount,
    clientName: clients.name,
  }).from(payments)
    .leftJoin(loans, eq(payments.loanId, loans.id))
    .leftJoin(clients, eq(loans.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(desc(payments.paymentDate));

  const totalPaymentAmount = rows.reduce((sum, row) => sum + Number(row.paymentAmount || 0), 0);
  const totalCommission = rows.reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0);
  return {
    payments: rows,
    totals: {
      totalPayments: rows.length,
      totalPaymentAmount,
      totalCommission,
      averageCommission: rows.length ? totalCommission / rows.length : 0,
    },
  };
}

export async function getAgentPerformance(databaseId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return { kpis: { totalAgents: 0, activeAgents: 0, totalPayments: 0, totalPaymentVolume: 0, totalCommissions: 0, bestAgent: null }, ranking: [], evolution: [] };

  const agentConditions = [eq(agents.databaseId, databaseId)];
  const allAgents = await db.select().from(agents).where(and(...agentConditions));
  const paymentConditions = [eq(payments.databaseId, databaseId)];
  if (startDate) paymentConditions.push(sql`${payments.paymentDate} >= ${startDate}` as any);
  if (endDate) paymentConditions.push(sql`${payments.paymentDate} <= ${endDate}` as any);

  const rows = await db.select({
    agentId: payments.agentId,
    agentName: agents.name,
    paymentAmount: payments.amount,
    commissionAmount: payments.commissionAmount,
    paymentDate: payments.paymentDate,
  }).from(payments)
    .innerJoin(agents, eq(payments.agentId, agents.id))
    .where(and(...paymentConditions));

  const rankingMap = new Map<number, { agentId: number; agentName: string; paymentCount: number; paymentVolume: number; commissionAmount: number }>();
  const evolutionMap = new Map<string, { period: string; paymentVolume: number; commissionAmount: number }>();
  for (const row of rows) {
    if (!row.agentId) continue;
    const current = rankingMap.get(row.agentId) ?? { agentId: row.agentId, agentName: row.agentName, paymentCount: 0, paymentVolume: 0, commissionAmount: 0 };
    current.paymentCount += 1;
    current.paymentVolume += Number(row.paymentAmount || 0);
    current.commissionAmount += Number(row.commissionAmount || 0);
    rankingMap.set(row.agentId, current);
    const period = new Date(row.paymentDate).toISOString().slice(0, 10);
    const evolution = evolutionMap.get(period) ?? { period, paymentVolume: 0, commissionAmount: 0 };
    evolution.paymentVolume += Number(row.paymentAmount || 0);
    evolution.commissionAmount += Number(row.commissionAmount || 0);
    evolutionMap.set(period, evolution);
  }

  const ranking = Array.from(rankingMap.values()).sort((a, b) => b.paymentVolume - a.paymentVolume || b.commissionAmount - a.commissionAmount || b.paymentCount - a.paymentCount);
  const totalPaymentVolume = rows.reduce((sum, row) => sum + Number(row.paymentAmount || 0), 0);
  const totalCommissions = rows.reduce((sum, row) => sum + Number(row.commissionAmount || 0), 0);
  return {
    kpis: {
      totalAgents: allAgents.length,
      activeAgents: allAgents.filter((agent) => agent.status === 'ACTIVE').length,
      totalPayments: rows.length,
      totalPaymentVolume,
      totalCommissions,
      bestAgent: ranking[0] ?? null,
    },
    ranking,
    evolution: Array.from(evolutionMap.values()).sort((a, b) => a.period.localeCompare(b.period)),
  };
}

// ==================== PAYMENTS ====================

export async function paymentAlreadyRegistered(data: {
  databaseId: number;
  loanId?: number;
  vehicleFinancingId?: number;
  installmentNumber: number;
  amount: string;
  paymentDate: Date;
  agentId?: number;
}) {
  const db = await getDb();
  if (!db) return false;
  const contractCondition = data.loanId !== undefined
    ? eq(payments.loanId, data.loanId)
    : eq(payments.vehicleFinancingId, data.vehicleFinancingId!);
  const rows = await db.select({
    id: payments.id,
    agentId: payments.agentId,
    amount: payments.amount,
    paymentDate: payments.paymentDate,
  }).from(payments).where(and(
    eq(payments.databaseId, data.databaseId),
    contractCondition,
    eq(payments.installmentNumber, data.installmentNumber),
  ));
  const paymentDay = data.paymentDate.toISOString().slice(0, 10);
  return rows.some((row) => {
    const rowDay = new Date(row.paymentDate).toISOString().slice(0, 10);
    return (row.agentId ?? undefined) === data.agentId
      && Number(row.amount) === Number(data.amount)
      && rowDay === paymentDay;
  });
}

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(payments).values(data);
  return result;
}

export async function createPaymentBundle(data: InsertPayment, cashEntry: Omit<InsertCashFlow, 'paymentId'>, loanUpdate?: { id: number; databaseId: number; values: Partial<InsertLoan> }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdPayment] = await tx.insert(payments).values(data).returning({ id: payments.id });
    const paymentId = createdPayment?.id;
    if (data.status === 'pago') {
      await tx.insert(cashFlow).values({ ...cashEntry, paymentId, sourceKey: paymentId ? `PAYMENT:${paymentId}` : undefined });
    }
    if (loanUpdate) {
      await tx.update(loans).set(loanUpdate.values).where(and(eq(loans.id, loanUpdate.id), eq(loans.databaseId, loanUpdate.databaseId)));
    }
    return createdPayment;
  });
}

export async function getPaymentsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments).where(eq(payments.databaseId, databaseId)).orderBy(desc(payments.createdAt));
}

export async function createCashFlowEntry(data: InsertCashFlow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(cashFlow).values(data);
}

export async function getCashFlowByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cashFlow).where(eq(cashFlow.databaseId, databaseId)).orderBy(desc(cashFlow.movementDate));
}

const automaticCashCategories = new Set([
  'LIBERACAO_EMPRESTIMO',
  'JUROS_EMPRESTIMO',
  'PAGAMENTO_EMPRESTIMO',
  'QUITACAO_EMPRESTIMO',
  'PAGAMENTO_FINANCIAMENTO',
  'COMPRA_VEICULO',
  'VENDA_VEICULO',
  'RECEBIMENTO_VENDA_VEICULO',
]);

export function isManualCashFlowEntry(entry: Pick<CashFlow, 'sourceKey' | 'paymentId' | 'loanId' | 'vehicleId' | 'vehicleSaleId' | 'category'>) {
  return !entry.sourceKey
    && !entry.paymentId
    && !entry.loanId
    && !entry.vehicleId
    && !entry.vehicleSaleId
    && !automaticCashCategories.has(entry.category);
}

export async function deleteManualCashFlowEntry(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(cashFlow).where(and(eq(cashFlow.id, id), eq(cashFlow.databaseId, databaseId))).limit(1);
    const entry = rows[0];
    if (!entry) return { deleted: false as const, reason: 'not_found' as const };
    if (!isManualCashFlowEntry(entry)) return { deleted: false as const, reason: 'automatic' as const, entry };
    await tx.delete(cashFlow).where(and(eq(cashFlow.id, id), eq(cashFlow.databaseId, databaseId)));
    return { deleted: true as const, entry };
  });
}

export async function getCashFlowByLoan(loanId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cashFlow).where(and(eq(cashFlow.loanId, loanId), eq(cashFlow.databaseId, databaseId))).orderBy(desc(cashFlow.movementDate));
}

export async function getPaymentsByLoan(loanId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments)
    .where(and(eq(payments.loanId, loanId), eq(payments.databaseId, databaseId)))
    .orderBy(desc(payments.paymentDate));
}

export async function getPaymentsByFinancing(vehicleFinancingId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments)
    .where(and(eq(payments.vehicleFinancingId, vehicleFinancingId), eq(payments.databaseId, databaseId)))
    .orderBy(desc(payments.paymentDate));
}

export async function getPaymentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePayment(id: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) return;
  await db.update(payments).set(data).where(eq(payments.id, id));
}

export async function deletePayment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(payments).where(eq(payments.id, id));
}

// ==================== VEHICLES ====================

export async function createVehicle(data: InsertVehicle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vehicles).values(data);
  return result;
}

export async function createVehicleBundle(data: InsertVehicle, cashEntry?: InsertCashFlow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdVehicle] = await tx.insert(vehicles).values(data).returning({ id: vehicles.id });
    const vehicleId = createdVehicle?.id;
    if (cashEntry && vehicleId && Number(cashEntry.amount) > 0) await tx.insert(cashFlow).values({ ...cashEntry, vehicleId, sourceKey: `VEHICLE_PURCHASE:${vehicleId}` });
    return { vehicleId, result: createdVehicle };
  });
}

export async function getVehiclesByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vehicles).where(eq(vehicles.databaseId, databaseId)).orderBy(desc(vehicles.createdAt));
}

export async function getVehicleById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVehicle(id: number, data: Partial<InsertVehicle>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vehicles).set(data).where(eq(vehicles.id, id));
}

export async function updateVehicleInDatabase(id: number, data: Partial<InsertVehicle>, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(vehicles).set(data).where(and(eq(vehicles.id, id), eq(vehicles.databaseId, databaseId)));
}

export async function deleteVehicle(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vehicles).where(eq(vehicles.id, id));
}

export async function deleteVehicleInDatabase(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.databaseId, databaseId)));
}

export async function getVehicleSalesByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicleSales).where(eq(vehicleSales.databaseId, databaseId)).orderBy(desc(vehicleSales.saleDate));
}

export async function getVehicleSaleById(id: number, databaseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(vehicleSales).where(and(eq(vehicleSales.id, id), eq(vehicleSales.databaseId, databaseId))).limit(1);
  return rows[0];
}

export async function createVehicleSaleBundle(data: InsertVehicleSale, vehicleId: number, databaseId: number, cashEntry?: Omit<InsertCashFlow, "vehicleSaleId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const vehicle = (await tx.select().from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.databaseId, databaseId))).limit(1))[0];
    if (!vehicle || vehicle.status !== "disponivel") throw new Error("Veículo não disponível no estoque ativo.");
    const [createdSale] = await tx.insert(vehicleSales).values(data).returning({ id: vehicleSales.id });
    const saleId = createdSale?.id;
    await tx.update(vehicles).set({ status: "vendido", clientId: data.clientId ?? null, salePrice: data.saleAmount }).where(and(eq(vehicles.id, vehicleId), eq(vehicles.databaseId, databaseId)));
    if (cashEntry && Number(data.receivedAmount) > 0) await tx.insert(cashFlow).values({ ...cashEntry, vehicleId, vehicleSaleId: saleId, sourceKey: saleId ? `VEHICLE_SALE_INITIAL:${saleId}` : undefined });
    return { saleId, vehicle };
  });
}

export async function receiveVehicleSaleBundle(saleId: number, databaseId: number, amount: string, movementDate: Date, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const sale = (await tx.select().from(vehicleSales).where(and(eq(vehicleSales.id, saleId), eq(vehicleSales.databaseId, databaseId))).limit(1))[0];
    if (!sale) throw new Error("Venda de veículo não encontrada no banco ativo.");
    const remaining = Number(sale.receivableBalance);
    if (remaining <= 0) throw new Error("Esta venda já está totalmente paga.");
    const received = Math.min(Number(amount), remaining);
    const nextBalance = roundMoney(remaining - received);
    await tx.update(vehicleSales).set({ receivedAmount: roundMoney(Number(sale.receivedAmount) + received).toFixed(2), receivableBalance: nextBalance.toFixed(2) }).where(and(eq(vehicleSales.id, saleId), eq(vehicleSales.databaseId, databaseId)));
    await tx.insert(cashFlow).values({ databaseId, type: "ENTRADA", category: "RECEBIMENTO_VENDA_VEICULO", description: "Recebimento de venda de veículo", amount: received.toFixed(2), movementDate, vehicleId: sale.vehicleId, vehicleSaleId: sale.id, clientId: sale.clientId, createdBy });
    return { received, nextBalance };
  });
}

// ==================== VEHICLE FINANCINGS ====================

export async function createVehicleFinancing(data: InsertVehicleFinancing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(vehicleFinancings).values(data).returning();
  if (!created) throw new Error("Não foi possível confirmar o financiamento criado.");
  return created;
}

export async function getVehicleFinancingsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vehicleFinancings)
    .where(eq(vehicleFinancings.databaseId, databaseId))
    .orderBy(desc(vehicleFinancings.createdAt));
}

export async function getVehicleFinancingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(vehicleFinancings).where(eq(vehicleFinancings.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateVehicleFinancing(id: number, data: Partial<InsertVehicleFinancing>) {
  const db = await getDb();
  if (!db) return;
  await db.update(vehicleFinancings).set(data).where(eq(vehicleFinancings.id, id));
}

export async function deleteVehicleFinancing(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vehicleFinancings).where(eq(vehicleFinancings.id, id));
}

// ==================== AUDIT LOGS ====================

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values(data);
  } catch (error) {
    console.error("[Database] Failed to create audit log:", error);
  }
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function getAuditLogsByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAuditLogsByDatabase(databaseId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs)
    .where(eq(auditLogs.databaseId, databaseId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ==================== DASHBOARD STATS ====================

export async function getDashboardStats(databaseId: number) {
  const db = await getDb();
  if (!db) return null;

  try {
    const [activeLoansResult, paidLoansResult, pendingPaymentsResult, cashInResult, cashOutResult, clientsResult, loanRows, loanPaymentRows, vehicleRows, vehicleSaleRows, vehiclePurchaseRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)`, total: sql<string>`sum(${loans.totalAmount})` }).from(loans).where(and(eq(loans.databaseId, databaseId), eq(loans.status, 'ativo'))),
      db.select({ count: sql<number>`count(*)`, total: sql<string>`sum(${loans.totalAmount})` }).from(loans).where(and(eq(loans.databaseId, databaseId), eq(loans.status, 'pago'))),
      db.select({ count: sql<number>`count(*)`, total: sql<string>`sum(${payments.amount})` }).from(payments).where(and(eq(payments.databaseId, databaseId), eq(payments.status, 'pendente'))),
      db.select({ total: sql<string>`sum(${cashFlow.amount})` }).from(cashFlow).where(and(eq(cashFlow.databaseId, databaseId), eq(cashFlow.type, 'ENTRADA'))),
      db.select({ total: sql<string>`sum(${cashFlow.amount})` }).from(cashFlow).where(and(eq(cashFlow.databaseId, databaseId), eq(cashFlow.type, 'SAIDA'))),
      db.select({ count: sql<number>`count(*)` }).from(clients).where(eq(clients.databaseId, databaseId)),
      db.select({ amount: loans.amount, remainingBalance: loans.remainingBalance, accruedInterest: loans.accruedInterest, status: loans.status, endDate: loans.endDate }).from(loans).where(and(eq(loans.databaseId, databaseId), sql`${loans.status} <> 'cancelado'`)),
      db.select({ amount: payments.amount, interestAmount: payments.interestAmount, principalAmount: payments.principalAmount, status: payments.status, loanId: payments.loanId }).from(payments).where(and(eq(payments.databaseId, databaseId), sql`${payments.loanId} is not null`)),
      db.select({ expenses: vehicles.expenses }).from(vehicles).where(eq(vehicles.databaseId, databaseId)),
      db.select({ saleAmount: vehicleSales.saleAmount, purchasePrice: vehicles.purchasePrice, expenses: vehicles.expenses }).from(vehicleSales).innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id)).where(and(eq(vehicleSales.databaseId, databaseId), eq(vehicles.databaseId, databaseId))),
      db.select({ amount: cashFlow.amount }).from(cashFlow).where(and(eq(cashFlow.databaseId, databaseId), eq(cashFlow.type, 'SAIDA'), eq(cashFlow.category, 'COMPRA_VEICULO'))),
    ]);

    const totalEntradas = Number(cashInResult[0]?.total || 0);
    const totalSaidas = Number(cashOutResult[0]?.total || 0);
    const vehicleExpenses = vehicleRows.reduce((sum, vehicle) => sum + Number(vehicle.expenses || 0), 0);
    const vehicleProfit = vehicleSaleRows.reduce((sum, sale) => sum + Number(sale.saleAmount) - Number(sale.purchasePrice || 0) - Number(sale.expenses || 0), 0);
    const loanRowsNotCancelled = loanRows;
    const loanPaymentRowsPaid = loanPaymentRows.filter((payment) => payment.status === 'pago');
    const totalLent = loanRowsNotCancelled.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
    const totalReceived = loanPaymentRowsPaid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalInterestReceived = loanPaymentRowsPaid.reduce((sum, payment) => sum + Number(payment.interestAmount || 0), 0);
    const totalPrincipalAmortized = loanPaymentRowsPaid.reduce((sum, payment) => sum + Number(payment.principalAmount || 0), 0);
    const totalOpen = loanRowsNotCancelled.filter((loan) => !['pago', 'cancelado'].includes(loan.status)).reduce((sum, loan) => sum + Number(loan.remainingBalance || 0), 0);
    const totalInterestOpen = loanRowsNotCancelled.filter((loan) => !['pago', 'cancelado'].includes(loan.status)).reduce((sum, loan) => sum + Number(loan.accruedInterest || 0), 0);
    const overdueLoans = loanRowsNotCancelled.filter((loan) => loan.status === 'atrasado' || (loan.status === 'ativo' && new Date(loan.endDate).getTime() < Date.now()));
    const totalOverdue = overdueLoans.reduce((sum, loan) => sum + Number(loan.remainingBalance || 0), 0);
    const totalVehiclePurchases = vehiclePurchaseRows.reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

    return {
      activeLoans: { count: Number(activeLoansResult[0]?.count || 0), total: Number(activeLoansResult[0]?.total || 0) },
      paidLoans: { count: Number(paidLoansResult[0]?.count || 0), total: Number(paidLoansResult[0]?.total || 0) },
      pendingPayments: { count: Number(pendingPaymentsResult[0]?.count || 0), total: Number(pendingPaymentsResult[0]?.total || 0) },
      totalClients: Number(clientsResult[0]?.count || 0),
      totalEntradas: roundMoney(totalEntradas),
      totalSaidas: roundMoney(totalSaidas),
      saldoCaixa: roundMoney(totalEntradas - totalSaidas),
      vehicleProfit: roundMoney(vehicleProfit),
      vehicleExpenses: roundMoney(vehicleExpenses),
      vehicleSalesCount: vehicleSaleRows.length,
      loanMetrics: {
        totalLent: roundMoney(totalLent),
        totalReceived: roundMoney(totalReceived),
        totalInterestReceived: roundMoney(totalInterestReceived),
        totalPrincipalAmortized: roundMoney(totalPrincipalAmortized),
        totalOpen: roundMoney(totalOpen),
        totalInterestOpen: roundMoney(totalInterestOpen),
        overdueCount: overdueLoans.length,
        totalOverdue: roundMoney(totalOverdue),
        totalVehiclePurchases: roundMoney(totalVehiclePurchases),
        totalVehicleSales: roundMoney(vehicleSaleRows.reduce((sum, sale) => sum + Number(sale.saleAmount || 0), 0)),
      },
    };
  } catch (error) {
    console.error("[Database] Failed to get dashboard stats:", error);
    return null;
  }
}


// ==================== LOCAL AUTHENTICATION ====================

export async function createLocalUser(data: {
  username: string;
  email: string;
  name: string;
  passwordHash: string;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.insert(users).values({
      username: data.username,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      loginMethod: 'local',
      role: 'user',
      canView: true,
      canInsert: false,
      canEdit: false,
      canDelete: false,
      canGenerateReports: false,
      canAccessSettings: false,
      isActive: true,
      emailVerified: false,
      lastSignedIn: new Date(),
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create local user:", error);
    throw error;
  }
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get user by username:", error);
    return undefined;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get user by email:", error);
    return undefined;
  }
}

export async function createLocalSession(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.insert(localSessions).values({
      userId,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error("[Database] Failed to create local session:", error);
    throw error;
  }
}

export async function getLocalSession(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const result = await db.select().from(localSessions).where(eq(localSessions.token, token)).limit(1);
    if (result.length === 0) return undefined;
    
    const session = result[0];
    if (new Date(session.expiresAt) < new Date()) {
      return undefined; // Session expired
    }
    
    return session;
  } catch (error) {
    console.error("[Database] Failed to get local session:", error);
    return undefined;
  }
}

export async function deleteLocalSession(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.delete(localSessions).where(eq(localSessions.token, token));
  } catch (error) {
    console.error("[Database] Failed to delete local session:", error);
    throw error;
  }
}

export async function createPasswordResetToken(data: InsertPasswordResetToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(passwordResetTokens).values(data);
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token)).limit(1);
  const resetToken = result[0];
  if (!resetToken || resetToken.usedAt || new Date(resetToken.expiresAt) <= new Date()) {
    return undefined;
  }
  return resetToken;
}

export async function consumePasswordResetToken(tokenId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

export async function updateLocalPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash, loginMethod: 'local' }).where(eq(users.id, userId));
  await db.delete(localSessions).where(eq(localSessions.userId, userId));
}

export async function deletePasswordResetTokensForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}
