import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with permissions and role management for DEATH NOTE system.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  role: mysqlEnum("role", ["user", "admin", "super_admin"]).default("user").notNull(),
  
  // Permissions (6 tipos granulares)
  canView: boolean("canView").default(true).notNull(),
  canInsert: boolean("canInsert").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  canGenerateReports: boolean("canGenerateReports").default(false).notNull(),
  canAccessSettings: boolean("canAccessSettings").default(false).notNull(),
  
  isActive: boolean("isActive").default(true).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Local authentication sessions - para manter sessões de usuários que fazem login com usuário/senha
 */
export const localSessions = mysqlTable("local_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LocalSession = typeof localSessions.$inferSelect;
export type InsertLocalSession = typeof localSessions.$inferInsert;

/**
 * Tokens temporários para recuperação de senha local.
 */
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

/**
 * Databases table - Sistema de múltiplos bancos de dados independentes
 */
export const databases = mysqlTable("databases", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  type: mysqlEnum("type", ["novo", "copia", "existente"]).notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Database = typeof databases.$inferSelect;
export type InsertDatabase = typeof databases.$inferInsert;

/**
 * Clients table - Clientes dos empréstimos
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  databaseId: int("databaseId").notNull(), // Isolamento por banco
  name: varchar("name", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 14 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Loans table - Empréstimos
 */
export const loans = mysqlTable("loans", {
  id: int("id").autoincrement().primaryKey(),
  databaseId: int("databaseId").notNull(), // Isolamento por banco
  clientId: int("clientId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull(), // Taxa de juros (%)
  installments: int("installments").notNull(), // Número de parcelas
  installmentAmount: decimal("installmentAmount", { precision: 15, scale: 2 }).notNull(), // Valor da parcela
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(), // Valor total com juros
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: mysqlEnum("status", ["ativo", "pago", "atrasado", "cancelado"]).default("ativo").notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

/**
 * Payments table - Pagamentos de empréstimos
 */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  databaseId: int("databaseId").notNull(), // Isolamento por banco
  loanId: int("loanId").notNull(),
  installmentNumber: int("installmentNumber").notNull(), // Número da parcela
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  status: mysqlEnum("status", ["pago", "pendente", "atrasado"]).default("pendente").notNull(),
  lateFee: decimal("lateFee", { precision: 15, scale: 2 }).default("0.00"), // Multa por atraso
  interest: decimal("interest", { precision: 15, scale: 2 }).default("0.00"), // Juros de mora
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Vehicles table - Veículos para financiamento
 */
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  databaseId: int("databaseId").notNull(), // Isolamento por banco
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  year: int("year").notNull(),
  color: varchar("color", { length: 50 }),
  plate: varchar("plate", { length: 20 }),
  chassi: varchar("chassi", { length: 50 }),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["disponivel", "vendido", "reservado"]).default("disponivel").notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

/**
 * Vehicle Financings table - Financiamentos de veículos
 */
export const vehicleFinancings = mysqlTable("vehicleFinancings", {
  id: int("id").autoincrement().primaryKey(),
  databaseId: int("databaseId").notNull(), // Isolamento por banco
  vehicleId: int("vehicleId").notNull(),
  clientId: int("clientId").notNull(),
  vehiclePrice: decimal("vehiclePrice", { precision: 15, scale: 2 }).notNull(),
  downPayment: decimal("downPayment", { precision: 15, scale: 2 }).notNull(), // Entrada
  financedAmount: decimal("financedAmount", { precision: 15, scale: 2 }).notNull(), // Valor financiado
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull(), // Taxa de juros mensal (%)
  installments: int("installments").notNull(), // Número de parcelas
  installmentAmount: decimal("installmentAmount", { precision: 15, scale: 2 }).notNull(), // Valor da parcela
  totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(), // Valor total a pagar
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: mysqlEnum("status", ["ativo", "pago", "atrasado", "cancelado"]).default("ativo").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VehicleFinancing = typeof vehicleFinancings.$inferSelect;
export type InsertVehicleFinancing = typeof vehicleFinancings.$inferInsert;

/**
 * Audit Logs table - Sistema de auditoria completo
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Pode ser null para ações do sistema
  username: varchar("username", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(), // login, logout, create_user, update_user, etc.
  entity: varchar("entity", { length: 100 }), // users, loans, payments, etc.
  entityId: int("entityId"), // ID da entidade afetada
  databaseId: int("databaseId"), // Banco de dados relacionado
  details: text("details"), // JSON com detalhes da ação
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  status: mysqlEnum("status", ["success", "failed", "warning"]).default("success").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
