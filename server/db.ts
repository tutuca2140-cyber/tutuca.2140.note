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
  auditLogs, InsertAuditLog
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clients).where(eq(clients.id, id));
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

export async function deleteLoan(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(loans).where(eq(loans.id, id));
}

export async function getLoansByClient(clientId: number, databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans)
    .where(and(eq(loans.clientId, clientId), eq(loans.databaseId, databaseId)))
    .orderBy(desc(loans.createdAt));
}

// ==================== PAYMENTS ====================

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
    .orderBy(payments.installmentNumber);
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

export async function deleteVehicle(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(vehicles).where(eq(vehicles.id, id));
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
