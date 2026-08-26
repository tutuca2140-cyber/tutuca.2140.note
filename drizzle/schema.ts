import {
  integer,
  serial,
  pgTable,
  text,
  timestamp,
  varchar,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extended with permissions and role management for DEATH NOTE system.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  role: varchar("role", { length: 64, enum: ["user", "admin", "super_admin"] })
    .default("user")
    .notNull(),

  // Permissions (6 tipos granulares)
  canView: boolean("canView").default(true).notNull(),
  canInsert: boolean("canInsert").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  canGenerateReports: boolean("canGenerateReports").default(false).notNull(),
  canAccessSettings: boolean("canAccessSettings").default(false).notNull(),
  dashboardOnly: boolean("dashboardOnly").default(false).notNull(),
  failedLoginAttempts: integer("failedLoginAttempts").default(0).notNull(),

  isActive: boolean("isActive").default(true).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Local authentication sessions - para manter sessões de usuários que fazem login com usuário/senha
 */
export const localSessions = pgTable("local_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LocalSession = typeof localSessions.$inferSelect;
export type InsertLocalSession = typeof localSessions.$inferInsert;

/**
 * Tokens temporários para recuperação de senha local.
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
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
export const databases = pgTable("databases", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  type: varchar("type", {
    length: 64,
    enum: ["novo", "copia", "existente"],
  }).notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Database = typeof databases.$inferSelect;
export type InsertDatabase = typeof databases.$inferInsert;

/** Bancos em que cada usuário pode trabalhar (máximo de três, validado pela API). */
export const userDatabaseAccess = pgTable(
  "user_database_access",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    databaseId: integer("databaseId")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    isActive: boolean("isActive").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    userDatabaseUnique: uniqueIndex(
      "user_database_access_user_database_unique"
    ).on(table.userId, table.databaseId),
  })
);

export type UserDatabaseAccess = typeof userDatabaseAccess.$inferSelect;
export type InsertUserDatabaseAccess = typeof userDatabaseAccess.$inferInsert;

/**
 * Clients table - Clientes dos empréstimos
 */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(), // Isolamento por banco
  name: varchar("name", { length: 255 }).notNull(),
  // Campo legado mantido apenas para compatibilidade de dados; não é exposto pela API/interface.
  cpf: varchar("cpf", { length: 14 }),
  birthDate: timestamp("birthDate"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  profession: varchar("profession", { length: 120 }),
  indicatorAgentId: integer("indicatorAgentId"),
  address: text("address"),
  residentialAddress: jsonb("residentialAddress"),
  commercialAddress: jsonb("commercialAddress"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  notes: text("notes"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Loans table - Empréstimos
 */
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(), // Isolamento por banco
  clientId: integer("clientId").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  interestType: varchar("interestType", {
    length: 64,
    enum: ["simple", "compound"],
  })
    .default("simple")
    .notNull(),
  interestRate: numeric("interestRate", { precision: 8, scale: 4 }).notNull(), // Taxa de juros (%)
  ratePeriod: varchar("ratePeriod", {
    length: 64,
    enum: ["day", "week", "month", "year"],
  })
    .default("month")
    .notNull(),
  installments: integer("installments").notNull(), // Número de parcelas/períodos
  installmentAmount: numeric("installmentAmount", {
    precision: 15,
    scale: 2,
  }).notNull(), // Valor da parcela
  totalAmount: numeric("totalAmount", { precision: 15, scale: 2 }).notNull(), // Valor total com juros
  remainingBalance: numeric("remainingBalance", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  principalBalance: numeric("principalBalance", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  accruedInterest: numeric("accruedInterest", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  totalPaid: numeric("totalPaid", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  lastInterestPeriod: varchar("lastInterestPeriod", { length: 20 }),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: varchar("status", {
    length: 64,
    enum: ["ativo", "pago", "atrasado", "cancelado"],
  })
    .default("ativo")
    .notNull(),
  description: text("description"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

/** Histórico mensal de juros, com uma linha única por contrato e período de referência. */
export const loanInterestHistory = pgTable(
  "loan_interest_history",
  {
    id: serial("id").primaryKey(),
    databaseId: integer("databaseId").notNull(),
    loanId: integer("loanId")
      .notNull()
      .references(() => loans.id),
    periodReference: varchar("periodReference", { length: 20 }).notNull(),
    previousPrincipalBalance: numeric("previousPrincipalBalance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    interestGenerated: numeric("interestGenerated", {
      precision: 15,
      scale: 2,
    }).notNull(),
    paymentAmount: numeric("paymentAmount", { precision: 15, scale: 2 })
      .default("0.00")
      .notNull(),
    interestPaid: numeric("interestPaid", { precision: 15, scale: 2 })
      .default("0.00")
      .notNull(),
    principalAmortized: numeric("principalAmortized", {
      precision: 15,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    updatedPrincipalBalance: numeric("updatedPrincipalBalance", {
      precision: 15,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    loanPeriodUnique: uniqueIndex(
      "loan_interest_history_loan_period_unique"
    ).on(table.loanId, table.periodReference),
  })
);

export type LoanInterestHistory = typeof loanInterestHistory.$inferSelect;
export type InsertLoanInterestHistory = typeof loanInterestHistory.$inferInsert;

/**
 * Agents table - Agentes comissionados isolados por banco de dados
 */
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  defaultCommissionPercentage: numeric("defaultCommissionPercentage", {
    precision: 5,
    scale: 2,
  })
    .default("0.00")
    .notNull(),
  status: varchar("status", { length: 64, enum: ["ACTIVE", "INACTIVE"] })
    .default("ACTIVE")
    .notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

/**
 * Payments table - Pagamentos de empréstimos
 */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(), // Isolamento por banco
  loanId: integer("loanId"),
  vehicleFinancingId: integer("vehicleFinancingId").references(
    () => vehicleFinancings.id
  ),
  installmentNumber: integer("installmentNumber").notNull(), // Número da parcela
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  status: varchar("status", {
    length: 64,
    enum: ["pago", "pendente", "atrasado"],
  })
    .default("pendente")
    .notNull(),
  lateFee: numeric("lateFee", { precision: 15, scale: 2 }).default("0.00"), // Multa por atraso
  interest: numeric("interest", { precision: 15, scale: 2 }).default("0.00"), // Juros de mora
  principalAmount: numeric("principalAmount", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  interestAmount: numeric("interestAmount", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  remainingBalance: numeric("remainingBalance", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  notes: text("notes"),
  agentId: integer("agentId").references(() => agents.id),
  commissionPercentage: numeric("commissionPercentage", {
    precision: 5,
    scale: 2,
  })
    .default("0.00")
    .notNull(),
  commissionAmount: numeric("commissionAmount", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  netAmount: numeric("netAmount", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/** Movimentações financeiras reais do banco ativo. */
export const cashFlow = pgTable(
  "cash_flow",
  {
    id: serial("id").primaryKey(),
    databaseId: integer("databaseId").notNull(),
    type: varchar("type", { length: 64, enum: ["ENTRADA", "SAIDA"] }).notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    movementDate: timestamp("movementDate").notNull(),
    clientId: integer("clientId").references(() => clients.id, {
      onDelete: "set null",
    }),
    loanId: integer("loanId").references(() => loans.id, {
      onDelete: "set null",
    }),
    vehicleId: integer("vehicleId").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    vehicleSaleId: integer("vehicleSaleId").references(() => vehicleSales.id, {
      onDelete: "set null",
    }),
    paymentId: integer("paymentId").references(() => payments.id, {
      onDelete: "set null",
    }),
    responsible: varchar("responsible", { length: 255 }),
    notes: text("notes"),
    /** Chave idempotente da origem automática; entradas manuais permanecem nulas. */
    sourceKey: varchar("sourceKey", { length: 180 }),
    createdBy: integer("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sourceKeyUnique: uniqueIndex("cash_flow_source_key_unique").on(
      table.sourceKey
    ),
  })
);

export type CashFlow = typeof cashFlow.$inferSelect;
export type InsertCashFlow = typeof cashFlow.$inferInsert;

/**
 * Vehicles table - Veículos para financiamento
 */
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(), // Isolamento por banco
  clientId: integer("clientId").references(() => clients.id),
  vehicleType: varchar("vehicleType", {
    length: 64,
    enum: ["CARRO", "MOTO", "PRODUTO", "OUTRO"],
  })
    .default("OUTRO")
    .notNull(),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }).notNull(),
  year: integer("year"),
  color: varchar("color", { length: 50 }),
  plate: varchar("plate", { length: 20 }),
  renavam: varchar("renavam", { length: 30 }),
  chassi: varchar("chassi", { length: 50 }),
  mileage: integer("mileage"),
  purchasePrice: numeric("purchasePrice", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  expenses: numeric("expenses", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  salePrice: numeric("salePrice", { precision: 15, scale: 2 }),
  purchaseDate: timestamp("purchaseDate"),
  stockEntryDate: timestamp("stockEntryDate").defaultNow().notNull(),
  price: numeric("price", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  status: varchar("status", {
    length: 64,
    enum: ["disponivel", "vendido", "reservado", "indisponivel"],
  })
    .default("disponivel")
    .notNull(),
  description: text("description"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;

/** Vendas de veículos sempre apontam para um veículo já existente no estoque. */
export const vehicleSales = pgTable("vehicle_sales", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  vehicleId: integer("vehicleId")
    .notNull()
    .references(() => vehicles.id),
  clientId: integer("clientId").references(() => clients.id, {
    onDelete: "set null",
  }),
  saleAmount: numeric("saleAmount", { precision: 15, scale: 2 }).notNull(),
  receivedAmount: numeric("receivedAmount", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  receivableBalance: numeric("receivableBalance", { precision: 15, scale: 2 })
    .default("0.00")
    .notNull(),
  paymentMethod: varchar("paymentMethod", { length: 30 }),
  saleDate: timestamp("saleDate").notNull(),
  notes: text("notes"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VehicleSale = typeof vehicleSales.$inferSelect;
export type InsertVehicleSale = typeof vehicleSales.$inferInsert;

/**
 * Vehicle Financings table - Financiamentos de veículos
 */
export const vehicleFinancings = pgTable("vehicleFinancings", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(), // Isolamento por banco
  vehicleId: integer("vehicleId").notNull(),
  clientId: integer("clientId").notNull(),
  vehiclePrice: numeric("vehiclePrice", { precision: 15, scale: 2 }).notNull(),
  downPayment: numeric("downPayment", { precision: 15, scale: 2 }).notNull(), // Entrada
  financedAmount: numeric("financedAmount", {
    precision: 15,
    scale: 2,
  }).notNull(), // Valor financiado
  interestRate: numeric("interestRate", { precision: 5, scale: 2 }).notNull(), // Taxa de juros mensal (%)
  installments: integer("installments").notNull(), // Número de parcelas
  installmentAmount: numeric("installmentAmount", {
    precision: 15,
    scale: 2,
  }).notNull(), // Valor da parcela
  totalAmount: numeric("totalAmount", { precision: 15, scale: 2 }).notNull(), // Valor total a pagar
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: varchar("status", {
    length: 64,
    enum: ["ativo", "pago", "atrasado", "cancelado"],
  })
    .default("ativo")
    .notNull(),
  notes: text("notes"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VehicleFinancing = typeof vehicleFinancings.$inferSelect;
export type InsertVehicleFinancing = typeof vehicleFinancings.$inferInsert;

/**
 * Audit Logs table - Sistema de auditoria completo
 */
export const auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  userId: integer("userId"), // Pode ser null para ações do sistema
  username: varchar("username", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(), // login, logout, create_user, update_user, etc.
  entity: varchar("entity", { length: 100 }), // users, loans, payments, etc.
  entityId: integer("entityId"), // ID da entidade afetada
  databaseId: integer("databaseId"), // Banco de dados relacionado
  details: text("details"), // JSON com detalhes da ação
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  status: varchar("status", {
    length: 64,
    enum: ["success", "failed", "warning"],
  })
    .default("success")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
