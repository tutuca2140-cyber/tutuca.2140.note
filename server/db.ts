import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  databases, InsertDatabase,
  clients, InsertClient,
  loans, InsertLoan,
  payments, InsertPayment,
  vehicles, InsertVehicle,
  vehicleFinancings, InsertVehicleFinancing,
  auditLogs, InsertAuditLog,
  agents, InsertAgent,
  localSessions, InsertLocalSession,
  passwordResetTokens, InsertPasswordResetToken
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { allocatePayment, roundMoney } from "../shared/finance";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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

export async function createLoan(data: InsertLoan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(loans).values(data);
  return result;
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

export async function updateLoanInDatabase(id: number, databaseId: number, data: Partial<InsertLoan>) {
  const db = await getDb();
  if (!db) return;
  await db.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
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

// ==================== AGENTS ====================

export async function createAgent(data: InsertAgent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(agents).values(data);
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

export async function getPaymentsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments).where(eq(payments.databaseId, databaseId)).orderBy(desc(payments.createdAt));
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

// ==================== VEHICLE FINANCINGS ====================

export async function createVehicleFinancing(data: InsertVehicleFinancing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(vehicleFinancings).values(data);
  return result;
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
    // Total de empréstimos ativos
    const activeLoansResult = await db
      .select({ count: sql<number>`count(*)`, total: sql<string>`sum(${loans.totalAmount})` })
      .from(loans)
      .where(and(eq(loans.databaseId, databaseId), eq(loans.status, 'ativo')));

    // Total de empréstimos pagos
    const paidLoansResult = await db
      .select({ count: sql<number>`count(*)`, total: sql<string>`sum(${loans.totalAmount})` })
      .from(loans)
      .where(and(eq(loans.databaseId, databaseId), eq(loans.status, 'pago')));

    // Total de pagamentos pendentes
    const pendingPaymentsResult = await db
      .select({ count: sql<number>`count(*)`, total: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(and(eq(payments.databaseId, databaseId), eq(payments.status, 'pendente')));

    // Total de clientes
    const clientsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(eq(clients.databaseId, databaseId));

    return {
      activeLoans: {
        count: activeLoansResult[0]?.count || 0,
        total: parseFloat(activeLoansResult[0]?.total || '0')
      },
      paidLoans: {
        count: paidLoansResult[0]?.count || 0,
        total: parseFloat(paidLoansResult[0]?.total || '0')
      },
      pendingPayments: {
        count: pendingPaymentsResult[0]?.count || 0,
        total: parseFloat(pendingPaymentsResult[0]?.total || '0')
      },
      totalClients: clientsResult[0]?.count || 0
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


