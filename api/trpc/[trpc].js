// server/vercel-trpc.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/db.ts
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import WebSocket from "ws";

// drizzle/schema.ts
import { integer, serial, pgTable, text, timestamp, varchar, numeric, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  username: varchar("username", { length: 100 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  role: varchar("role", { length: 64, enum: ["user", "admin", "super_admin"] }).default("user").notNull(),
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var localSessions = pgTable("local_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var databases = pgTable("databases", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  type: varchar("type", { length: 64, enum: ["novo", "copia", "existente"] }).notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var userDatabaseAccess = pgTable("user_database_access", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  databaseId: integer("databaseId").notNull().references(() => databases.id, { onDelete: "cascade" }),
  isActive: boolean("isActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  userDatabaseUnique: uniqueIndex("user_database_access_user_database_unique").on(table.userId, table.databaseId)
}));
var clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  // Isolamento por banco
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  // Isolamento por banco
  clientId: integer("clientId").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  interestType: varchar("interestType", { length: 64, enum: ["simple", "compound"] }).default("simple").notNull(),
  interestRate: numeric("interestRate", { precision: 8, scale: 4 }).notNull(),
  // Taxa de juros (%)
  ratePeriod: varchar("ratePeriod", { length: 64, enum: ["day", "week", "month", "year"] }).default("month").notNull(),
  installments: integer("installments").notNull(),
  // Número de parcelas/períodos
  installmentAmount: numeric("installmentAmount", { precision: 15, scale: 2 }).notNull(),
  // Valor da parcela
  totalAmount: numeric("totalAmount", { precision: 15, scale: 2 }).notNull(),
  // Valor total com juros
  remainingBalance: numeric("remainingBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  principalBalance: numeric("principalBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  accruedInterest: numeric("accruedInterest", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalPaid: numeric("totalPaid", { precision: 15, scale: 2 }).default("0.00").notNull(),
  lastInterestPeriod: varchar("lastInterestPeriod", { length: 20 }),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: varchar("status", { length: 64, enum: ["ativo", "pago", "atrasado", "cancelado"] }).default("ativo").notNull(),
  description: text("description"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var loanInterestHistory = pgTable("loan_interest_history", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  loanId: integer("loanId").notNull().references(() => loans.id),
  periodReference: varchar("periodReference", { length: 20 }).notNull(),
  previousPrincipalBalance: numeric("previousPrincipalBalance", { precision: 15, scale: 2 }).notNull(),
  interestGenerated: numeric("interestGenerated", { precision: 15, scale: 2 }).notNull(),
  paymentAmount: numeric("paymentAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  interestPaid: numeric("interestPaid", { precision: 15, scale: 2 }).default("0.00").notNull(),
  principalAmortized: numeric("principalAmortized", { precision: 15, scale: 2 }).default("0.00").notNull(),
  updatedPrincipalBalance: numeric("updatedPrincipalBalance", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  loanPeriodUnique: uniqueIndex("loan_interest_history_loan_period_unique").on(table.loanId, table.periodReference)
}));
var agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  defaultCommissionPercentage: numeric("defaultCommissionPercentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  status: varchar("status", { length: 64, enum: ["ACTIVE", "INACTIVE"] }).default("ACTIVE").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  // Isolamento por banco
  loanId: integer("loanId"),
  vehicleFinancingId: integer("vehicleFinancingId").references(() => vehicleFinancings.id),
  installmentNumber: integer("installmentNumber").notNull(),
  // Número da parcela
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  status: varchar("status", { length: 64, enum: ["pago", "pendente", "atrasado"] }).default("pendente").notNull(),
  lateFee: numeric("lateFee", { precision: 15, scale: 2 }).default("0.00"),
  // Multa por atraso
  interest: numeric("interest", { precision: 15, scale: 2 }).default("0.00"),
  // Juros de mora
  principalAmount: numeric("principalAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  interestAmount: numeric("interestAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  remainingBalance: numeric("remainingBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  agentId: integer("agentId").references(() => agents.id),
  commissionPercentage: numeric("commissionPercentage", { precision: 5, scale: 2 }).default("0.00").notNull(),
  commissionAmount: numeric("commissionAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  netAmount: numeric("netAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var cashFlow = pgTable("cash_flow", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  type: varchar("type", { length: 64, enum: ["ENTRADA", "SAIDA"] }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  movementDate: timestamp("movementDate").notNull(),
  clientId: integer("clientId").references(() => clients.id, { onDelete: "set null" }),
  loanId: integer("loanId").references(() => loans.id, { onDelete: "set null" }),
  vehicleId: integer("vehicleId").references(() => vehicles.id, { onDelete: "set null" }),
  vehicleSaleId: integer("vehicleSaleId").references(() => vehicleSales.id, { onDelete: "set null" }),
  paymentId: integer("paymentId").references(() => payments.id, { onDelete: "set null" }),
  responsible: varchar("responsible", { length: 255 }),
  notes: text("notes"),
  /** Chave idempotente da origem automática; entradas manuais permanecem nulas. */
  sourceKey: varchar("sourceKey", { length: 180 }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  sourceKeyUnique: uniqueIndex("cash_flow_source_key_unique").on(table.sourceKey)
}));
var vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  // Isolamento por banco
  clientId: integer("clientId").references(() => clients.id),
  vehicleType: varchar("vehicleType", { length: 64, enum: ["CARRO", "MOTO", "OUTRO"] }).default("OUTRO").notNull(),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }).notNull(),
  year: integer("year"),
  color: varchar("color", { length: 50 }),
  plate: varchar("plate", { length: 20 }),
  renavam: varchar("renavam", { length: 30 }),
  chassi: varchar("chassi", { length: 50 }),
  mileage: integer("mileage"),
  purchasePrice: numeric("purchasePrice", { precision: 15, scale: 2 }).default("0.00").notNull(),
  expenses: numeric("expenses", { precision: 15, scale: 2 }).default("0.00").notNull(),
  salePrice: numeric("salePrice", { precision: 15, scale: 2 }),
  purchaseDate: timestamp("purchaseDate"),
  stockEntryDate: timestamp("stockEntryDate").defaultNow().notNull(),
  price: numeric("price", { precision: 15, scale: 2 }).default("0.00").notNull(),
  status: varchar("status", { length: 64, enum: ["disponivel", "vendido", "reservado", "indisponivel"] }).default("disponivel").notNull(),
  description: text("description"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var vehicleSales = pgTable("vehicle_sales", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  vehicleId: integer("vehicleId").notNull().references(() => vehicles.id),
  clientId: integer("clientId").references(() => clients.id, { onDelete: "set null" }),
  saleAmount: numeric("saleAmount", { precision: 15, scale: 2 }).notNull(),
  receivedAmount: numeric("receivedAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
  receivableBalance: numeric("receivableBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 30 }),
  saleDate: timestamp("saleDate").notNull(),
  notes: text("notes"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var vehicleFinancings = pgTable("vehicleFinancings", {
  id: serial("id").primaryKey(),
  databaseId: integer("databaseId").notNull(),
  // Isolamento por banco
  vehicleId: integer("vehicleId").notNull(),
  clientId: integer("clientId").notNull(),
  vehiclePrice: numeric("vehiclePrice", { precision: 15, scale: 2 }).notNull(),
  downPayment: numeric("downPayment", { precision: 15, scale: 2 }).notNull(),
  // Entrada
  financedAmount: numeric("financedAmount", { precision: 15, scale: 2 }).notNull(),
  // Valor financiado
  interestRate: numeric("interestRate", { precision: 5, scale: 2 }).notNull(),
  // Taxa de juros mensal (%)
  installments: integer("installments").notNull(),
  // Número de parcelas
  installmentAmount: numeric("installmentAmount", { precision: 15, scale: 2 }).notNull(),
  // Valor da parcela
  totalAmount: numeric("totalAmount", { precision: 15, scale: 2 }).notNull(),
  // Valor total a pagar
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  status: varchar("status", { length: 64, enum: ["ativo", "pago", "atrasado", "cancelado"] }).default("ativo").notNull(),
  notes: text("notes"),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var auditLogs = pgTable("auditLogs", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  // Pode ser null para ações do sistema
  username: varchar("username", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  // login, logout, create_user, update_user, etc.
  entity: varchar("entity", { length: 100 }),
  // users, loans, payments, etc.
  entityId: integer("entityId"),
  // ID da entidade afetada
  databaseId: integer("databaseId"),
  // Banco de dados relacionado
  details: text("details"),
  // JSON com detalhes da ação
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  status: varchar("status", { length: 64, enum: ["success", "failed", "warning"] }).default("success").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// shared/finance.ts
var roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
function calculateLoanPlan(input) {
  const principal = roundMoney(input.principal);
  const rate = input.ratePercent / 100;
  const periods = Math.max(1, Math.floor(input.periods));
  const finalAmount = input.interestType === "simple" ? principal * (1 + rate * periods) : principal * Math.pow(1 + rate, periods);
  const totalAmount = roundMoney(Math.max(principal, finalAmount));
  return {
    principal,
    interestAmount: roundMoney(totalAmount - principal),
    totalAmount,
    installmentAmount: roundMoney(totalAmount / periods),
    periods,
    ratePercent: input.ratePercent,
    interestType: input.interestType,
    ratePeriod: input.ratePeriod
  };
}
function calculateInterestOnBalance(principalBalance, monthlyRatePercent) {
  return roundMoney(Math.max(0, principalBalance) * Math.max(0, monthlyRatePercent) / 100);
}
function allocateBalancePayment(paymentAmount, accruedInterest, principalBalance) {
  const amount = roundMoney(paymentAmount);
  const interestAmount = roundMoney(Math.min(Math.max(0, amount), Math.max(0, accruedInterest)));
  const principalAmount = roundMoney(Math.min(Math.max(0, amount - interestAmount), Math.max(0, principalBalance)));
  return {
    principalAmount,
    interestAmount,
    remainingBalance: roundMoney(Math.max(0, principalBalance - principalAmount + accruedInterest - interestAmount))
  };
}
function addPeriods(startDate, periods, ratePeriod) {
  const result = new Date(startDate);
  if (ratePeriod === "day") result.setUTCDate(result.getUTCDate() + periods);
  if (ratePeriod === "week") result.setUTCDate(result.getUTCDate() + periods * 7);
  if (ratePeriod === "month") result.setUTCMonth(result.getUTCMonth() + periods);
  if (ratePeriod === "year") result.setUTCFullYear(result.getUTCFullYear() + periods);
  return result;
}

// server/db.ts
var _db = null;
var databaseScope = new AsyncLocalStorage();
function withUserDatabaseScope(user, operation) {
  return databaseScope.run(user, operation);
}
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle({ connection: process.env.DATABASE_URL, ws: WebSocket });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "super_admin";
      updateSet.role = "super_admin";
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
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return Promise.all(
    rows.map(async (user) => ({
      ...user,
      databaseIds: (await db.select({ databaseId: userDatabaseAccess.databaseId }).from(userDatabaseAccess).where(eq(userDatabaseAccess.userId, user.id))).map((access) => access.databaseId)
    }))
  );
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserPermissions(userId, permissions) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(permissions).where(eq(users.id, userId));
}
async function updateUserRole(userId, role) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}
async function toggleUserActive(userId, isActive) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(
    isActive ? { isActive: true, failedLoginAttempts: 0 } : { isActive: false }
  ).where(eq(users.id, userId));
}
async function registerFailedLogin(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [updated] = await db.update(users).set({
    failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
    updatedAt: /* @__PURE__ */ new Date()
  }).where(eq(users.id, userId)).returning({ failedLoginAttempts: users.failedLoginAttempts });
  const attempts = updated?.failedLoginAttempts ?? 0;
  if (attempts >= 2) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isActive: false }).where(eq(users.id, userId));
      await tx.delete(localSessions).where(eq(localSessions.userId, userId));
    });
  }
  return attempts;
}
async function resetFailedLogin(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ failedLoginAttempts: 0 }).where(eq(users.id, userId));
}
async function updateLocalUser(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
}
async function deleteUserSessions(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(localSessions).where(eq(localSessions.userId, userId));
}
async function deleteUser(userId) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async (tx) => {
    await tx.delete(userDatabaseAccess).where(eq(userDatabaseAccess.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
async function ensureDracoIntegrity() {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.username, "Draco")).limit(1);
  const user = result[0];
  if (!user) return void 0;
  await db.update(users).set({
    role: "super_admin",
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
    isActive: true
  }).where(eq(users.id, user.id));
  return {
    ...user,
    role: "super_admin",
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
    isActive: true
  };
}
async function createDatabase(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(databases).values(data);
  return result;
}
async function getAllDatabases() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(databases).orderBy(desc(databases.createdAt));
}
async function getDatabasesForUser(userId, role) {
  const db = await getDb();
  if (!db) return [];
  if (role === "super_admin") return getAllDatabases();
  const assigned = await db.select({ database: databases }).from(userDatabaseAccess).innerJoin(databases, eq(userDatabaseAccess.databaseId, databases.id)).where(eq(userDatabaseAccess.userId, userId));
  if (assigned.length || role !== "admin")
    return assigned.map((row) => row.database);
  return getAllDatabases();
}
async function assignUserDatabases(userId, databaseIds) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const uniqueIds = Array.from(new Set(databaseIds));
  if (uniqueIds.length > 3)
    throw new Error("Cada usu\xE1rio pode ser vinculado a no m\xE1ximo tr\xEAs bancos.");
  if (uniqueIds.length) {
    const existing = await db.select({ id: databases.id }).from(databases).where(inArray(databases.id, uniqueIds));
    if (existing.length !== uniqueIds.length)
      throw new Error("Um ou mais bancos selecionados n\xE3o existem.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(userDatabaseAccess).where(eq(userDatabaseAccess.userId, userId));
    if (uniqueIds.length) {
      await tx.insert(userDatabaseAccess).values(
        uniqueIds.map((databaseId, index) => ({
          userId,
          databaseId,
          isActive: index === 0
        }))
      );
    }
  });
}
async function getDatabaseById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getActiveDatabase() {
  const db = await getDb();
  if (!db) return void 0;
  const scope = databaseScope.getStore();
  if (scope && scope.role !== "super_admin") {
    const assigned = await db.select({ database: databases }).from(userDatabaseAccess).innerJoin(databases, eq(userDatabaseAccess.databaseId, databases.id)).where(
      and(
        eq(userDatabaseAccess.userId, scope.userId),
        eq(userDatabaseAccess.isActive, true)
      )
    ).limit(1);
    if (assigned[0]) return assigned[0].database;
    const fallback = await db.select({ database: databases }).from(userDatabaseAccess).innerJoin(databases, eq(userDatabaseAccess.databaseId, databases.id)).where(eq(userDatabaseAccess.userId, scope.userId)).limit(1);
    if (fallback[0]) return fallback[0].database;
    if (scope.role !== "admin") return void 0;
  }
  const result = await db.select().from(databases).where(eq(databases.isActive, true)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function setActiveDatabase(id) {
  const db = await getDb();
  if (!db) return;
  const scope = databaseScope.getStore();
  if (scope && scope.role !== "super_admin") {
    const access = await db.select().from(userDatabaseAccess).where(
      and(
        eq(userDatabaseAccess.userId, scope.userId),
        eq(userDatabaseAccess.databaseId, id)
      )
    ).limit(1);
    if (access[0]) {
      await db.transaction(async (tx) => {
        await tx.update(userDatabaseAccess).set({ isActive: false }).where(eq(userDatabaseAccess.userId, scope.userId));
        await tx.update(userDatabaseAccess).set({ isActive: true }).where(
          and(
            eq(userDatabaseAccess.userId, scope.userId),
            eq(userDatabaseAccess.databaseId, id)
          )
        );
      });
      return;
    }
    if (scope.role !== "admin")
      throw new Error("Voc\xEA n\xE3o tem acesso a este banco de dados.");
  }
  await db.update(databases).set({ isActive: false });
  await db.update(databases).set({ isActive: true }).where(eq(databases.id, id));
}
async function updateDatabase(id, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(databases).set(data).where(eq(databases.id, id));
}
async function deleteDatabase(id) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async (tx) => {
    await tx.delete(cashFlow).where(eq(cashFlow.databaseId, id));
    await tx.delete(payments).where(eq(payments.databaseId, id));
    await tx.delete(loanInterestHistory).where(eq(loanInterestHistory.databaseId, id));
    await tx.delete(vehicleFinancings).where(eq(vehicleFinancings.databaseId, id));
    await tx.delete(vehicleSales).where(eq(vehicleSales.databaseId, id));
    await tx.delete(loans).where(eq(loans.databaseId, id));
    await tx.delete(vehicles).where(eq(vehicles.databaseId, id));
    await tx.delete(clients).where(eq(clients.databaseId, id));
    await tx.delete(agents).where(eq(agents.databaseId, id));
    await tx.delete(userDatabaseAccess).where(eq(userDatabaseAccess.databaseId, id));
    await tx.delete(auditLogs).where(eq(auditLogs.databaseId, id));
    await tx.delete(databases).where(eq(databases.id, id));
  });
}
async function createClient(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  return result;
}
async function getClientsByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clients).where(eq(clients.databaseId, databaseId)).orderBy(desc(clients.createdAt));
}
async function getClientById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateClientInDatabase(id, data, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.update(clients).set(data).where(and(eq(clients.id, id), eq(clients.databaseId, databaseId)));
}
async function deleteClientInDatabase(id, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.databaseId, databaseId)));
}
async function getClientProfile(clientId, databaseId) {
  const db = await getDb();
  if (!db) return void 0;
  const clientResult = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.databaseId, databaseId))).limit(1);
  const client = clientResult[0];
  if (!client) return void 0;
  const [loanRows, vehicleRows, financingRows] = await Promise.all([
    db.select().from(loans).where(
      and(eq(loans.clientId, clientId), eq(loans.databaseId, databaseId))
    ).orderBy(desc(loans.createdAt)),
    db.select().from(vehicles).where(
      and(
        eq(vehicles.clientId, clientId),
        eq(vehicles.databaseId, databaseId)
      )
    ).orderBy(desc(vehicles.createdAt)),
    db.select().from(vehicleFinancings).where(
      and(
        eq(vehicleFinancings.clientId, clientId),
        eq(vehicleFinancings.databaseId, databaseId)
      )
    ).orderBy(desc(vehicleFinancings.createdAt))
  ]);
  const loanPayments = (await Promise.all(
    loanRows.map((loan) => getPaymentsByLoan(loan.id, databaseId))
  )).flat();
  const financingPayments = (await Promise.all(
    financingRows.map(
      (financing) => getPaymentsByFinancing(financing.id, databaseId)
    )
  )).flat();
  const paymentsForClient = [...loanPayments, ...financingPayments].sort(
    (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
  );
  const totalPaid = roundMoney(
    paymentsForClient.filter((payment) => payment.status === "pago").reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );
  const totalInterest = roundMoney(
    paymentsForClient.reduce(
      (sum, payment) => sum + Number(payment.interestAmount || 0),
      0
    )
  );
  const totalPrincipal = roundMoney(
    paymentsForClient.reduce(
      (sum, payment) => sum + Number(payment.principalAmount || 0),
      0
    )
  );
  const totalCommissions = roundMoney(
    paymentsForClient.reduce(
      (sum, payment) => sum + Number(payment.commissionAmount || 0),
      0
    )
  );
  const remainingLoanBalance = loanRows.reduce(
    (sum, loan) => sum + Number(loan.remainingBalance || loan.totalAmount || 0),
    0
  );
  const remainingFinancingBalance = financingRows.reduce((sum, financing) => {
    const paid = financingPayments.filter(
      (payment) => payment.vehicleFinancingId === financing.id && payment.status === "pago"
    ).reduce((paidSum, payment) => paidSum + Number(payment.amount || 0), 0);
    return sum + Math.max(
      0,
      Number(financing.totalAmount || financing.financedAmount || 0) - paid
    );
  }, 0);
  const remainingBalance = roundMoney(
    remainingLoanBalance + remainingFinancingBalance
  );
  return {
    client,
    loans: loanRows,
    vehicles: vehicleRows,
    financings: financingRows,
    payments: paymentsForClient,
    financialHistory: {
      totalPaid,
      totalInterest,
      totalPrincipal,
      totalCommissions,
      remainingBalance,
      paymentCount: paymentsForClient.length
    }
  };
}
var INITIAL_LOAN_INTEREST_PERIOD = "CONTRATO_INICIAL";
async function createLoanBundle(data, cashEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdLoan] = await tx.insert(loans).values(data).returning({ id: loans.id });
    const loanId = createdLoan?.id;
    if (!loanId)
      throw new Error("N\xE3o foi poss\xEDvel identificar o empr\xE9stimo criado.");
    if (Number(data.accruedInterest || 0) > 0) {
      await tx.insert(loanInterestHistory).values({
        databaseId: data.databaseId,
        loanId,
        periodReference: INITIAL_LOAN_INTEREST_PERIOD,
        previousPrincipalBalance: data.amount,
        interestGenerated: data.accruedInterest,
        paymentAmount: "0.00",
        interestPaid: "0.00",
        principalAmortized: "0.00",
        updatedPrincipalBalance: data.amount
      });
    }
    await tx.insert(cashFlow).values({
      ...cashEntry,
      loanId,
      sourceKey: `LOAN_RELEASE:${loanId}`
    });
    return { loanId, result: createdLoan };
  });
}
async function deleteLoanSafely(id, databaseId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const loanRows = await tx.select().from(loans).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId))).limit(1);
    const loan = loanRows[0];
    if (!loan)
      return {
        deleted: false,
        cancelled: false,
        relations: { payments: 0, interestHistory: 0, cashMovements: 0 }
      };
    const [paymentRows, interestRows, cashRows] = await Promise.all([
      tx.select({ count: sql`count(*)` }).from(payments).where(
        and(eq(payments.loanId, id), eq(payments.databaseId, databaseId))
      ),
      tx.select({ count: sql`count(*)` }).from(loanInterestHistory).where(
        and(
          eq(loanInterestHistory.loanId, id),
          eq(loanInterestHistory.databaseId, databaseId)
        )
      ),
      tx.select({ count: sql`count(*)` }).from(cashFlow).where(
        and(eq(cashFlow.loanId, id), eq(cashFlow.databaseId, databaseId))
      )
    ]);
    const relations = {
      payments: Number(paymentRows[0]?.count || 0),
      interestHistory: Number(interestRows[0]?.count || 0),
      cashMovements: Number(cashRows[0]?.count || 0)
    };
    const hasRelations = Object.values(relations).some((value) => value > 0);
    if (hasRelations) {
      await tx.update(loans).set({ status: "cancelado" }).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
      return { deleted: false, cancelled: true, relations };
    }
    await tx.delete(loans).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
    return { deleted: true, cancelled: false, relations };
  });
}
async function recalculateLoanWithTransaction(tx, loanId, databaseId) {
  const loanRows = await tx.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.databaseId, databaseId))).limit(1);
  const loan = loanRows[0];
  if (!loan) return void 0;
  const paymentRows = await tx.select().from(payments).where(
    and(eq(payments.loanId, loanId), eq(payments.databaseId, databaseId))
  ).orderBy(payments.paymentDate, payments.id);
  const historyRows = await tx.select().from(loanInterestHistory).where(
    and(
      eq(loanInterestHistory.loanId, loanId),
      eq(loanInterestHistory.databaseId, databaseId)
    )
  ).orderBy(loanInterestHistory.createdAt, loanInterestHistory.id);
  let interestPool = roundMoney(
    historyRows.reduce(
      (sum, row) => sum + Number(row.interestGenerated || 0),
      0
    )
  );
  let principalBalance = roundMoney(Number(loan.amount || 0));
  let totalPaid = 0;
  for (const payment of paymentRows) {
    if (payment.status !== "pago") {
      await tx.update(payments).set({
        principalAmount: "0.00",
        interestAmount: "0.00",
        remainingBalance: roundMoney(principalBalance + interestPool).toFixed(
          2
        )
      }).where(eq(payments.id, payment.id));
      continue;
    }
    const allocation = allocateBalancePayment(
      Number(payment.amount || 0),
      interestPool,
      principalBalance
    );
    interestPool = roundMoney(
      Math.max(0, interestPool - allocation.interestAmount)
    );
    principalBalance = roundMoney(
      Math.max(0, principalBalance - allocation.principalAmount)
    );
    totalPaid = roundMoney(totalPaid + Number(payment.amount || 0));
    await tx.update(payments).set({
      principalAmount: allocation.principalAmount.toFixed(2),
      interestAmount: allocation.interestAmount.toFixed(2),
      remainingBalance: allocation.remainingBalance.toFixed(2),
      commissionAmount: roundMoney(
        Number(payment.amount || 0) * Number(payment.commissionPercentage || 0) / 100
      ).toFixed(2),
      netAmount: roundMoney(
        Number(payment.amount || 0) - Number(payment.amount || 0) * Number(payment.commissionPercentage || 0) / 100
      ).toFixed(2)
    }).where(eq(payments.id, payment.id));
  }
  const nextStatus = loan.status === "cancelado" ? "cancelado" : principalBalance + interestPool <= 0 ? "pago" : new Date(loan.endDate) < /* @__PURE__ */ new Date() ? "atrasado" : "ativo";
  await tx.update(loans).set({
    principalBalance: principalBalance.toFixed(2),
    accruedInterest: interestPool.toFixed(2),
    remainingBalance: roundMoney(principalBalance + interestPool).toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    status: nextStatus
  }).where(and(eq(loans.id, loanId), eq(loans.databaseId, databaseId)));
  return {
    principalBalance,
    accruedInterest: interestPool,
    remainingBalance: roundMoney(principalBalance + interestPool),
    totalPaid,
    status: nextStatus
  };
}
async function updatePaymentBundle(id, databaseId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId))).limit(1);
    const current = rows[0];
    if (!current) return void 0;
    const merged = { ...current, ...data };
    const amount = Number(merged.amount || 0);
    const commissionAmount = roundMoney(
      amount * Number(merged.commissionPercentage || 0) / 100
    );
    await tx.update(payments).set({
      ...data,
      amount: amount.toFixed(2),
      commissionAmount: commissionAmount.toFixed(2),
      netAmount: roundMoney(amount - commissionAmount).toFixed(2)
    }).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId)));
    const loanState = current.loanId ? await recalculateLoanWithTransaction(tx, current.loanId, databaseId) : void 0;
    const updatedPaymentRows = await tx.select().from(payments).where(eq(payments.id, id)).limit(1);
    const updatedPayment = updatedPaymentRows[0];
    const paymentCategory = current.loanId ? Number(updatedPayment?.interestAmount || 0) > 0 && Number(updatedPayment?.principalAmount || 0) === 0 ? "JUROS_EMPRESTIMO" : loanState?.status === "pago" ? "QUITACAO_EMPRESTIMO" : "PAGAMENTO_EMPRESTIMO" : "PAGAMENTO_FINANCIAMENTO";
    const paymentCashRows = await tx.select().from(cashFlow).where(
      and(eq(cashFlow.paymentId, id), eq(cashFlow.databaseId, databaseId))
    ).limit(1);
    if (merged.status === "pago") {
      const cashData = {
        databaseId,
        type: "ENTRADA",
        category: paymentCategory,
        description: current.loanId ? `Recebimento do empr\xE9stimo #${current.loanId}` : `Recebimento do financiamento #${current.vehicleFinancingId}`,
        amount: amount.toFixed(2),
        movementDate: merged.paymentDate,
        clientId: void 0,
        loanId: current.loanId ?? void 0,
        paymentId: id,
        sourceKey: `PAYMENT:${id}`,
        responsible: void 0,
        notes: merged.notes,
        createdBy: current.createdBy
      };
      if (paymentCashRows[0])
        await tx.update(cashFlow).set(cashData).where(eq(cashFlow.id, paymentCashRows[0].id));
      else await tx.insert(cashFlow).values(cashData);
    } else if (paymentCashRows[0]) {
      await tx.delete(cashFlow).where(eq(cashFlow.id, paymentCashRows[0].id));
    }
    return current.loanId ? { payment: updatedPayment, loanState } : { payment: { ...merged, amount }, loanState: void 0 };
  });
}
async function deletePaymentBundle(id, databaseId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId))).limit(1);
    const payment = rows[0];
    if (!payment) return void 0;
    await tx.delete(cashFlow).where(
      and(eq(cashFlow.paymentId, id), eq(cashFlow.databaseId, databaseId))
    );
    await tx.delete(payments).where(and(eq(payments.id, id), eq(payments.databaseId, databaseId)));
    const loanState = payment.loanId ? await recalculateLoanWithTransaction(tx, payment.loanId, databaseId) : void 0;
    return { payment, loanState };
  });
}
async function getLoansByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans).where(
    and(eq(loans.databaseId, databaseId), sql`${loans.status} <> 'cancelado'`)
  ).orderBy(desc(loans.createdAt));
}
async function getLoanById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateLoanBalance(id, databaseId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
}
async function updateLoanInDatabase(id, databaseId, data, initialInterest) {
  const db = await getDb();
  if (!db) return;
  return db.transaction(async (tx) => {
    await tx.update(loans).set(data).where(and(eq(loans.id, id), eq(loans.databaseId, databaseId)));
    if (initialInterest !== void 0) {
      const initialRows = await tx.select().from(loanInterestHistory).where(
        and(
          eq(loanInterestHistory.loanId, id),
          eq(loanInterestHistory.databaseId, databaseId),
          eq(
            loanInterestHistory.periodReference,
            INITIAL_LOAN_INTEREST_PERIOD
          )
        )
      ).limit(1);
      const principal = String(data.amount || "0.00");
      if (initialInterest > 0) {
        const historyValues = {
          previousPrincipalBalance: principal,
          interestGenerated: roundMoney(initialInterest).toFixed(2),
          paymentAmount: "0.00",
          interestPaid: "0.00",
          principalAmortized: "0.00",
          updatedPrincipalBalance: principal
        };
        if (initialRows[0]) {
          await tx.update(loanInterestHistory).set(historyValues).where(eq(loanInterestHistory.id, initialRows[0].id));
        } else {
          await tx.insert(loanInterestHistory).values({
            databaseId,
            loanId: id,
            periodReference: INITIAL_LOAN_INTEREST_PERIOD,
            ...historyValues
          });
        }
      } else if (initialRows[0]) {
        await tx.delete(loanInterestHistory).where(eq(loanInterestHistory.id, initialRows[0].id));
      }
      await recalculateLoanWithTransaction(tx, id, databaseId);
    }
    const cashUpdate = {};
    if (data.amount !== void 0) cashUpdate.amount = data.amount;
    if (data.startDate !== void 0) cashUpdate.movementDate = data.startDate;
    if (data.clientId !== void 0) cashUpdate.clientId = data.clientId;
    if (data.description !== void 0) cashUpdate.notes = data.description;
    if (Object.keys(cashUpdate).length > 0) {
      await tx.update(cashFlow).set(cashUpdate).where(
        and(
          eq(cashFlow.loanId, id),
          eq(cashFlow.databaseId, databaseId),
          eq(cashFlow.category, "LIBERACAO_EMPRESTIMO")
        )
      );
    }
  });
}
async function getLoansByClient(clientId, databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans).where(and(eq(loans.clientId, clientId), eq(loans.databaseId, databaseId))).orderBy(desc(loans.createdAt));
}
async function getLoanInterestHistory(loanId, databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanInterestHistory).where(
    and(
      eq(loanInterestHistory.loanId, loanId),
      eq(loanInterestHistory.databaseId, databaseId)
    )
  ).orderBy(desc(loanInterestHistory.createdAt));
}
async function getLoanInterestPeriod(loanId, databaseId, periodReference) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(loanInterestHistory).where(
    and(
      eq(loanInterestHistory.loanId, loanId),
      eq(loanInterestHistory.databaseId, databaseId),
      eq(loanInterestHistory.periodReference, periodReference)
    )
  ).limit(1);
  return rows[0];
}
async function createLoanInterestHistory(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(loanInterestHistory).values(data);
}
async function createAgent(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(agents).values(data).returning();
  if (!created) throw new Error("N\xE3o foi poss\xEDvel confirmar o agente criado.");
  return created;
}
async function getAgentsByDatabase(databaseId, includeInactive = true) {
  const db = await getDb();
  if (!db) return [];
  const conditions = includeInactive ? eq(agents.databaseId, databaseId) : and(eq(agents.databaseId, databaseId), eq(agents.status, "ACTIVE"));
  return await db.select().from(agents).where(conditions).orderBy(agents.name);
}
async function getAgentById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return result[0];
}
async function updateAgent(id, data, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.update(agents).set(data).where(and(eq(agents.id, id), eq(agents.databaseId, databaseId)));
}
async function deactivateAgent(id, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.update(agents).set({ status: "INACTIVE" }).where(and(eq(agents.id, id), eq(agents.databaseId, databaseId)));
}
async function getAgentPaymentHistory(agentId, databaseId, startDate, endDate) {
  const db = await getDb();
  if (!db)
    return {
      payments: [],
      totals: {
        totalPayments: 0,
        totalPaymentAmount: 0,
        totalCommission: 0,
        averageCommission: 0
      }
    };
  const conditions = [
    eq(payments.agentId, agentId),
    eq(payments.databaseId, databaseId)
  ];
  if (startDate)
    conditions.push(sql`${payments.paymentDate} >= ${startDate}`);
  if (endDate)
    conditions.push(sql`${payments.paymentDate} <= ${endDate}`);
  const rows = await db.select({
    id: payments.id,
    paymentDate: payments.paymentDate,
    loanId: payments.loanId,
    paymentAmount: payments.amount,
    commissionPercentage: payments.commissionPercentage,
    commissionAmount: payments.commissionAmount,
    netAmount: payments.netAmount,
    clientName: clients.name
  }).from(payments).leftJoin(loans, eq(payments.loanId, loans.id)).leftJoin(clients, eq(loans.clientId, clients.id)).where(and(...conditions)).orderBy(desc(payments.paymentDate));
  const totalPaymentAmount = rows.reduce(
    (sum, row) => sum + Number(row.paymentAmount || 0),
    0
  );
  const totalCommission = rows.reduce(
    (sum, row) => sum + Number(row.commissionAmount || 0),
    0
  );
  return {
    payments: rows,
    totals: {
      totalPayments: rows.length,
      totalPaymentAmount,
      totalCommission,
      averageCommission: rows.length ? totalCommission / rows.length : 0
    }
  };
}
async function getAgentPerformance(databaseId, startDate, endDate) {
  const db = await getDb();
  if (!db)
    return {
      kpis: {
        totalAgents: 0,
        activeAgents: 0,
        totalPayments: 0,
        totalPaymentVolume: 0,
        totalCommissions: 0,
        bestAgent: null
      },
      ranking: [],
      evolution: []
    };
  const agentConditions = [eq(agents.databaseId, databaseId)];
  const allAgents = await db.select().from(agents).where(and(...agentConditions));
  const paymentConditions = [eq(payments.databaseId, databaseId)];
  if (startDate)
    paymentConditions.push(sql`${payments.paymentDate} >= ${startDate}`);
  if (endDate)
    paymentConditions.push(sql`${payments.paymentDate} <= ${endDate}`);
  const rows = await db.select({
    agentId: payments.agentId,
    agentName: agents.name,
    paymentAmount: payments.amount,
    commissionAmount: payments.commissionAmount,
    paymentDate: payments.paymentDate
  }).from(payments).innerJoin(agents, eq(payments.agentId, agents.id)).where(and(...paymentConditions));
  const rankingMap = /* @__PURE__ */ new Map();
  const evolutionMap = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!row.agentId) continue;
    const current = rankingMap.get(row.agentId) ?? {
      agentId: row.agentId,
      agentName: row.agentName,
      paymentCount: 0,
      paymentVolume: 0,
      commissionAmount: 0
    };
    current.paymentCount += 1;
    current.paymentVolume += Number(row.paymentAmount || 0);
    current.commissionAmount += Number(row.commissionAmount || 0);
    rankingMap.set(row.agentId, current);
    const period = new Date(row.paymentDate).toISOString().slice(0, 10);
    const evolution = evolutionMap.get(period) ?? {
      period,
      paymentVolume: 0,
      commissionAmount: 0
    };
    evolution.paymentVolume += Number(row.paymentAmount || 0);
    evolution.commissionAmount += Number(row.commissionAmount || 0);
    evolutionMap.set(period, evolution);
  }
  const ranking = Array.from(rankingMap.values()).sort(
    (a, b) => b.paymentVolume - a.paymentVolume || b.commissionAmount - a.commissionAmount || b.paymentCount - a.paymentCount
  );
  const totalPaymentVolume = rows.reduce(
    (sum, row) => sum + Number(row.paymentAmount || 0),
    0
  );
  const totalCommissions = rows.reduce(
    (sum, row) => sum + Number(row.commissionAmount || 0),
    0
  );
  return {
    kpis: {
      totalAgents: allAgents.length,
      activeAgents: allAgents.filter((agent) => agent.status === "ACTIVE").length,
      totalPayments: rows.length,
      totalPaymentVolume,
      totalCommissions,
      bestAgent: ranking[0] ?? null
    },
    ranking,
    evolution: Array.from(evolutionMap.values()).sort(
      (a, b) => a.period.localeCompare(b.period)
    )
  };
}
async function paymentAlreadyRegistered(data) {
  const db = await getDb();
  if (!db) return false;
  const contractCondition = data.loanId !== void 0 ? eq(payments.loanId, data.loanId) : eq(payments.vehicleFinancingId, data.vehicleFinancingId);
  const rows = await db.select({
    id: payments.id,
    agentId: payments.agentId,
    amount: payments.amount,
    paymentDate: payments.paymentDate
  }).from(payments).where(
    and(
      eq(payments.databaseId, data.databaseId),
      contractCondition,
      eq(payments.installmentNumber, data.installmentNumber)
    )
  );
  const paymentDay = data.paymentDate.toISOString().slice(0, 10);
  return rows.some((row) => {
    const rowDay = new Date(row.paymentDate).toISOString().slice(0, 10);
    return (row.agentId ?? void 0) === data.agentId && Number(row.amount) === Number(data.amount) && rowDay === paymentDay;
  });
}
async function createPaymentBundle(data, cashEntry, loanUpdate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdPayment] = await tx.insert(payments).values(data).returning({ id: payments.id });
    const paymentId = createdPayment?.id;
    if (data.status === "pago") {
      await tx.insert(cashFlow).values({
        ...cashEntry,
        paymentId,
        sourceKey: paymentId ? `PAYMENT:${paymentId}` : void 0
      });
    }
    if (loanUpdate) {
      await tx.update(loans).set(loanUpdate.values).where(
        and(
          eq(loans.id, loanUpdate.id),
          eq(loans.databaseId, loanUpdate.databaseId)
        )
      );
    }
    return createdPayment;
  });
}
async function getPaymentsByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments).where(eq(payments.databaseId, databaseId)).orderBy(desc(payments.createdAt));
}
async function createCashFlowEntry(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(cashFlow).values(data);
}
async function getCashFlowByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cashFlow).where(eq(cashFlow.databaseId, databaseId)).orderBy(desc(cashFlow.movementDate));
}
async function deleteCashFlowEntry(id, databaseId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(cashFlow).where(and(eq(cashFlow.id, id), eq(cashFlow.databaseId, databaseId))).limit(1);
    const entry = rows[0];
    if (!entry)
      return { deleted: false, reason: "not_found" };
    await tx.delete(cashFlow).where(and(eq(cashFlow.id, id), eq(cashFlow.databaseId, databaseId)));
    return { deleted: true, entry };
  });
}
async function getCashFlowByLoan(loanId, databaseId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cashFlow).where(
    and(eq(cashFlow.loanId, loanId), eq(cashFlow.databaseId, databaseId))
  ).orderBy(desc(cashFlow.movementDate));
}
async function getPaymentsByLoan(loanId, databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments).where(
    and(eq(payments.loanId, loanId), eq(payments.databaseId, databaseId))
  ).orderBy(desc(payments.paymentDate));
}
async function getPaymentsByFinancing(vehicleFinancingId, databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(payments).where(
    and(
      eq(payments.vehicleFinancingId, vehicleFinancingId),
      eq(payments.databaseId, databaseId)
    )
  ).orderBy(desc(payments.paymentDate));
}
async function getPaymentById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createVehicleBundle(data, cashEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [createdVehicle] = await tx.insert(vehicles).values(data).returning({ id: vehicles.id });
    const vehicleId = createdVehicle?.id;
    if (cashEntry && vehicleId && Number(cashEntry.amount) > 0)
      await tx.insert(cashFlow).values({
        ...cashEntry,
        vehicleId,
        sourceKey: `VEHICLE_PURCHASE:${vehicleId}`
      });
    return { vehicleId, result: createdVehicle };
  });
}
async function getVehiclesByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vehicles).where(eq(vehicles.databaseId, databaseId)).orderBy(desc(vehicles.createdAt));
}
async function getVehicleById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateVehicleInDatabase(id, data, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.update(vehicles).set(data).where(and(eq(vehicles.id, id), eq(vehicles.databaseId, databaseId)));
}
async function deleteVehicleInDatabase(id, databaseId) {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async (tx) => {
    const financingRows = await tx.select({ id: vehicleFinancings.id }).from(vehicleFinancings).where(
      and(
        eq(vehicleFinancings.vehicleId, id),
        eq(vehicleFinancings.databaseId, databaseId)
      )
    );
    const saleRows = await tx.select({ id: vehicleSales.id }).from(vehicleSales).where(
      and(
        eq(vehicleSales.vehicleId, id),
        eq(vehicleSales.databaseId, databaseId)
      )
    );
    const financingIds = financingRows.map((row) => row.id);
    const saleIds = saleRows.map((row) => row.id);
    const paymentRows = financingIds.length ? await tx.select({ id: payments.id }).from(payments).where(
      and(
        eq(payments.databaseId, databaseId),
        inArray(payments.vehicleFinancingId, financingIds)
      )
    ) : [];
    const paymentIds = paymentRows.map((row) => row.id);
    const cashConditions = [eq(cashFlow.vehicleId, id)];
    if (saleIds.length)
      cashConditions.push(inArray(cashFlow.vehicleSaleId, saleIds));
    if (paymentIds.length)
      cashConditions.push(inArray(cashFlow.paymentId, paymentIds));
    await tx.delete(cashFlow).where(and(eq(cashFlow.databaseId, databaseId), or(...cashConditions)));
    if (paymentIds.length)
      await tx.delete(payments).where(inArray(payments.id, paymentIds));
    if (financingIds.length)
      await tx.delete(vehicleFinancings).where(inArray(vehicleFinancings.id, financingIds));
    if (saleIds.length)
      await tx.delete(vehicleSales).where(inArray(vehicleSales.id, saleIds));
    await tx.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.databaseId, databaseId)));
  });
}
async function getVehicleSalesByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vehicleSales).where(eq(vehicleSales.databaseId, databaseId)).orderBy(desc(vehicleSales.saleDate));
}
async function createVehicleSaleBundle(data, vehicleId, databaseId, cashEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const vehicle = (await tx.select().from(vehicles).where(
      and(eq(vehicles.id, vehicleId), eq(vehicles.databaseId, databaseId))
    ).limit(1))[0];
    if (!vehicle || vehicle.status !== "disponivel")
      throw new Error("Ve\xEDculo n\xE3o dispon\xEDvel no estoque ativo.");
    const [createdSale] = await tx.insert(vehicleSales).values(data).returning({ id: vehicleSales.id });
    const saleId = createdSale?.id;
    await tx.update(vehicles).set({
      status: "vendido",
      clientId: data.clientId ?? null,
      salePrice: data.saleAmount
    }).where(
      and(eq(vehicles.id, vehicleId), eq(vehicles.databaseId, databaseId))
    );
    if (cashEntry && Number(data.receivedAmount) > 0)
      await tx.insert(cashFlow).values({
        ...cashEntry,
        vehicleId,
        vehicleSaleId: saleId,
        sourceKey: saleId ? `VEHICLE_SALE_INITIAL:${saleId}` : void 0
      });
    return { saleId, vehicle };
  });
}
async function receiveVehicleSaleBundle(saleId, databaseId, amount, movementDate, createdBy) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const sale = (await tx.select().from(vehicleSales).where(
      and(
        eq(vehicleSales.id, saleId),
        eq(vehicleSales.databaseId, databaseId)
      )
    ).limit(1))[0];
    if (!sale)
      throw new Error("Venda de ve\xEDculo n\xE3o encontrada no banco ativo.");
    const remaining = Number(sale.receivableBalance);
    if (remaining <= 0) throw new Error("Esta venda j\xE1 est\xE1 totalmente paga.");
    const received = Math.min(Number(amount), remaining);
    const nextBalance = roundMoney(remaining - received);
    await tx.update(vehicleSales).set({
      receivedAmount: roundMoney(
        Number(sale.receivedAmount) + received
      ).toFixed(2),
      receivableBalance: nextBalance.toFixed(2)
    }).where(
      and(
        eq(vehicleSales.id, saleId),
        eq(vehicleSales.databaseId, databaseId)
      )
    );
    await tx.insert(cashFlow).values({
      databaseId,
      type: "ENTRADA",
      category: "RECEBIMENTO_VENDA_VEICULO",
      description: "Recebimento de venda de ve\xEDculo",
      amount: received.toFixed(2),
      movementDate,
      vehicleId: sale.vehicleId,
      vehicleSaleId: sale.id,
      clientId: sale.clientId,
      createdBy
    });
    return { received, nextBalance };
  });
}
async function createVehicleFinancing(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(vehicleFinancings).values(data).returning();
  if (!created)
    throw new Error("N\xE3o foi poss\xEDvel confirmar o financiamento criado.");
  return created;
}
async function getVehicleFinancingsByDatabase(databaseId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(vehicleFinancings).where(eq(vehicleFinancings.databaseId, databaseId)).orderBy(desc(vehicleFinancings.createdAt));
}
async function getVehicleFinancingById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(vehicleFinancings).where(eq(vehicleFinancings.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateVehicleFinancing(id, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(vehicleFinancings).set(data).where(eq(vehicleFinancings.id, id));
}
async function createAuditLog(data) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(auditLogs).values(data);
  } catch (error) {
    console.error("[Database] Failed to create audit log:", error);
  }
}
async function getAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
async function getAuditLogsByUser(userId, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
async function getAuditLogsByDatabase(databaseId, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(auditLogs).where(eq(auditLogs.databaseId, databaseId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
async function getDashboardStats(databaseId) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [
      activeLoansResult,
      paidLoansResult,
      pendingPaymentsResult,
      cashInResult,
      cashOutResult,
      clientsResult,
      loanRows,
      loanPaymentRows,
      vehicleRows,
      vehicleSaleRows,
      vehiclePurchaseRows,
      financingRows,
      allPaymentRows,
      clientRows
    ] = await Promise.all([
      db.select({
        count: sql`count(*)`,
        total: sql`sum(${loans.totalAmount})`
      }).from(loans).where(
        and(eq(loans.databaseId, databaseId), eq(loans.status, "ativo"))
      ),
      db.select({
        count: sql`count(*)`,
        total: sql`sum(${loans.totalAmount})`
      }).from(loans).where(and(eq(loans.databaseId, databaseId), eq(loans.status, "pago"))),
      db.select({
        count: sql`count(*)`,
        total: sql`sum(${payments.amount})`
      }).from(payments).where(
        and(
          eq(payments.databaseId, databaseId),
          eq(payments.status, "pendente")
        )
      ),
      db.select({ total: sql`sum(${cashFlow.amount})` }).from(cashFlow).where(
        and(eq(cashFlow.databaseId, databaseId), eq(cashFlow.type, "ENTRADA"))
      ),
      db.select({ total: sql`sum(${cashFlow.amount})` }).from(cashFlow).where(
        and(eq(cashFlow.databaseId, databaseId), eq(cashFlow.type, "SAIDA"))
      ),
      db.select({ count: sql`count(*)` }).from(clients).where(eq(clients.databaseId, databaseId)),
      db.select({
        id: loans.id,
        clientId: loans.clientId,
        amount: loans.amount,
        remainingBalance: loans.remainingBalance,
        accruedInterest: loans.accruedInterest,
        status: loans.status,
        startDate: loans.startDate,
        endDate: loans.endDate,
        installments: loans.installments,
        installmentAmount: loans.installmentAmount,
        ratePeriod: loans.ratePeriod,
        description: loans.description
      }).from(loans).where(
        and(
          eq(loans.databaseId, databaseId),
          sql`${loans.status} <> 'cancelado'`
        )
      ),
      db.select({
        amount: payments.amount,
        interestAmount: payments.interestAmount,
        principalAmount: payments.principalAmount,
        status: payments.status,
        loanId: payments.loanId
      }).from(payments).where(
        and(
          eq(payments.databaseId, databaseId),
          sql`${payments.loanId} is not null`
        )
      ),
      db.select({
        id: vehicles.id,
        model: vehicles.model,
        brand: vehicles.brand,
        status: vehicles.status,
        expenses: vehicles.expenses
      }).from(vehicles).where(eq(vehicles.databaseId, databaseId)),
      db.select({
        saleAmount: vehicleSales.saleAmount,
        purchasePrice: vehicles.purchasePrice,
        expenses: vehicles.expenses
      }).from(vehicleSales).innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id)).where(
        and(
          eq(vehicleSales.databaseId, databaseId),
          eq(vehicles.databaseId, databaseId)
        )
      ),
      db.select({ amount: cashFlow.amount }).from(cashFlow).where(
        and(
          eq(cashFlow.databaseId, databaseId),
          eq(cashFlow.type, "SAIDA"),
          eq(cashFlow.category, "COMPRA_VEICULO")
        )
      ),
      db.select().from(vehicleFinancings).where(
        and(
          eq(vehicleFinancings.databaseId, databaseId),
          sql`${vehicleFinancings.status} <> 'cancelado'`
        )
      ),
      db.select().from(payments).where(eq(payments.databaseId, databaseId)),
      db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.databaseId, databaseId))
    ]);
    const totalEntradas = Number(cashInResult[0]?.total || 0);
    const totalSaidas = Number(cashOutResult[0]?.total || 0);
    const vehicleExpenses = vehicleRows.reduce(
      (sum, vehicle) => sum + Number(vehicle.expenses || 0),
      0
    );
    const vehicleProfit = vehicleSaleRows.reduce(
      (sum, sale) => sum + Number(sale.saleAmount) - Number(sale.purchasePrice || 0) - Number(sale.expenses || 0),
      0
    );
    const loanRowsNotCancelled = loanRows;
    const loanPaymentRowsPaid = loanPaymentRows.filter(
      (payment) => payment.status === "pago"
    );
    const totalLent = loanRowsNotCancelled.reduce(
      (sum, loan) => sum + Number(loan.amount || 0),
      0
    );
    const totalReceived = loanPaymentRowsPaid.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );
    const totalInterestReceived = loanPaymentRowsPaid.reduce(
      (sum, payment) => sum + Number(payment.interestAmount || 0),
      0
    );
    const totalPrincipalAmortized = loanPaymentRowsPaid.reduce(
      (sum, payment) => sum + Number(payment.principalAmount || 0),
      0
    );
    const totalOpen = loanRowsNotCancelled.filter((loan) => !["pago", "cancelado"].includes(loan.status)).reduce((sum, loan) => sum + Number(loan.remainingBalance || 0), 0);
    const totalInterestOpen = loanRowsNotCancelled.filter((loan) => !["pago", "cancelado"].includes(loan.status)).reduce((sum, loan) => sum + Number(loan.accruedInterest || 0), 0);
    const overdueLoans = loanRowsNotCancelled.filter(
      (loan) => loan.status === "atrasado" || loan.status === "ativo" && new Date(loan.endDate).getTime() < Date.now()
    );
    const totalOverdue = overdueLoans.reduce(
      (sum, loan) => sum + Number(loan.remainingBalance || 0),
      0
    );
    const totalVehiclePurchases = vehiclePurchaseRows.reduce(
      (sum, movement) => sum + Number(movement.amount || 0),
      0
    );
    const clientNames = new Map(
      clientRows.map((client) => [client.id, client.name])
    );
    const vehicleNames = new Map(
      vehicleRows.map((vehicle) => [
        vehicle.id,
        `${vehicle.brand ?? ""} ${vehicle.model}`.trim()
      ])
    );
    const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const dateKey = (date) => {
      const parts = Object.fromEntries(
        dateFormatter.formatToParts(date).map((part) => [part.type, part.value])
      );
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const todayKey = dateKey(/* @__PURE__ */ new Date());
    const dueItems = [];
    const paidKeys = new Set(
      allPaymentRows.filter((payment) => payment.status === "pago").map(
        (payment) => payment.loanId ? `loan:${payment.loanId}:${payment.installmentNumber}` : `financing:${payment.vehicleFinancingId}:${payment.installmentNumber}`
      )
    );
    for (const loan of loanRows.filter(
      (item) => ["ativo", "atrasado"].includes(item.status)
    )) {
      for (let installmentNumber = 1; installmentNumber <= loan.installments; installmentNumber += 1) {
        if (paidKeys.has(`loan:${loan.id}:${installmentNumber}`)) continue;
        dueItems.push({
          clientId: loan.clientId,
          clientName: clientNames.get(loan.clientId) ?? `Cliente #${loan.clientId}`,
          amount: Number(loan.installmentAmount),
          product: loan.description?.trim() || `Empr\xE9stimo #${loan.id}`,
          dueDate: addPeriods(
            new Date(loan.startDate),
            installmentNumber,
            loan.ratePeriod
          ),
          installmentNumber,
          contractType: "emprestimo"
        });
      }
    }
    for (const financing of financingRows.filter(
      (item) => ["ativo", "atrasado"].includes(item.status)
    )) {
      for (let installmentNumber = 1; installmentNumber <= financing.installments; installmentNumber += 1) {
        if (paidKeys.has(`financing:${financing.id}:${installmentNumber}`))
          continue;
        dueItems.push({
          clientId: financing.clientId,
          clientName: clientNames.get(financing.clientId) ?? `Cliente #${financing.clientId}`,
          amount: Number(financing.installmentAmount),
          product: vehicleNames.get(financing.vehicleId) ?? `Financiamento #${financing.id}`,
          dueDate: addPeriods(
            new Date(financing.startDate),
            installmentNumber,
            "month"
          ),
          installmentNumber,
          contractType: "financiamento"
        });
      }
    }
    const serializeDue = (item) => ({
      ...item,
      dueDate: item.dueDate.toISOString()
    });
    const dueTodayItems = dueItems.filter((item) => dateKey(item.dueDate) === todayKey).sort((a, b) => a.clientName.localeCompare(b.clientName));
    const overdueItems = dueItems.filter((item) => dateKey(item.dueDate) < todayKey).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const dueToday = dueTodayItems.slice(0, 100).map(serializeDue);
    const overdue = overdueItems.slice(0, 100).map(serializeDue);
    const financedVehicleIds = new Set(
      financingRows.map((financing) => financing.vehicleId)
    );
    const soldVehicleIds = /* @__PURE__ */ new Set([
      ...vehicleRows.filter((vehicle) => vehicle.status === "vendido").map((vehicle) => vehicle.id),
      ...Array.from(financedVehicleIds)
    ]);
    const vehiclePayments = allPaymentRows.filter(
      (payment) => payment.vehicleFinancingId !== null
    );
    const paidVehiclePayments = vehiclePayments.filter(
      (payment) => payment.status === "pago"
    );
    const totalFinancingContracts = financingRows.reduce(
      (sum, financing) => sum + Number(financing.totalAmount || 0),
      0
    );
    const totalFinancingPaid = paidVehiclePayments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0
    );
    return {
      activeLoans: {
        count: Number(activeLoansResult[0]?.count || 0),
        total: Number(activeLoansResult[0]?.total || 0)
      },
      paidLoans: {
        count: Number(paidLoansResult[0]?.count || 0),
        total: Number(paidLoansResult[0]?.total || 0)
      },
      pendingPayments: {
        count: Number(pendingPaymentsResult[0]?.count || 0),
        total: Number(pendingPaymentsResult[0]?.total || 0)
      },
      totalClients: Number(clientsResult[0]?.count || 0),
      totalEntradas: roundMoney(totalEntradas),
      totalSaidas: roundMoney(totalSaidas),
      saldoCaixa: roundMoney(totalEntradas - totalSaidas),
      vehicleProfit: roundMoney(vehicleProfit),
      vehicleExpenses: roundMoney(vehicleExpenses),
      vehicleSalesCount: vehicleSaleRows.length,
      collections: { dueToday, overdue },
      vehicleMetrics: {
        carsSold: soldVehicleIds.size,
        financings: financingRows.length,
        installmentsPaid: vehiclePayments.filter(
          (payment) => payment.status === "pago"
        ).length,
        installmentsOverdue: overdueItems.filter(
          (item) => item.contractType === "financiamento"
        ).length,
        totalContracts: roundMoney(totalFinancingContracts),
        totalPaid: roundMoney(totalFinancingPaid)
      },
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
        totalVehicleSales: roundMoney(
          vehicleSaleRows.reduce(
            (sum, sale) => sum + Number(sale.saleAmount || 0),
            0
          )
        )
      }
    };
  } catch (error) {
    console.error("[Database] Failed to get dashboard stats:", error);
    return null;
  }
}
async function createLocalUser(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    const result = await db.insert(users).values({
      username: data.username,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      loginMethod: "local",
      role: data.role ?? "user",
      canView: data.canView ?? true,
      canInsert: data.canInsert ?? false,
      canEdit: data.canEdit ?? false,
      canDelete: data.canDelete ?? false,
      canGenerateReports: data.canGenerateReports ?? false,
      canAccessSettings: data.canAccessSettings ?? false,
      dashboardOnly: data.dashboardOnly ?? false,
      isActive: true,
      emailVerified: false,
      lastSignedIn: /* @__PURE__ */ new Date()
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create local user:", error);
    throw error;
  }
}
async function getUserByUsername(username) {
  const db = await getDb();
  if (!db) return void 0;
  try {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result.length > 0 ? result[0] : void 0;
  } catch (error) {
    console.error("[Database] Failed to get user by username:", error);
    return void 0;
  }
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) return void 0;
  try {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result.length > 0 ? result[0] : void 0;
  } catch (error) {
    console.error("[Database] Failed to get user by email:", error);
    return void 0;
  }
}
async function createLocalSession(userId, token, expiresAt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.insert(localSessions).values({
      userId,
      token,
      expiresAt
    });
  } catch (error) {
    console.error("[Database] Failed to create local session:", error);
    throw error;
  }
}
async function getLocalSession(token) {
  const db = await getDb();
  if (!db) return void 0;
  try {
    const result = await db.select().from(localSessions).where(eq(localSessions.token, token)).limit(1);
    if (result.length === 0) return void 0;
    const session = result[0];
    if (new Date(session.expiresAt) < /* @__PURE__ */ new Date()) {
      return void 0;
    }
    return session;
  } catch (error) {
    console.error("[Database] Failed to get local session:", error);
    return void 0;
  }
}
async function createPasswordResetToken(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(passwordResetTokens).values(data);
}
async function getPasswordResetToken(token) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
  const resetToken = result[0];
  if (!resetToken || resetToken.usedAt || new Date(resetToken.expiresAt) <= /* @__PURE__ */ new Date()) {
    return void 0;
  }
  return resetToken;
}
async function consumePasswordResetToken(tokenId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(passwordResetTokens).set({ usedAt: /* @__PURE__ */ new Date() }).where(eq(passwordResetTokens.id, tokenId));
}
async function updateLocalPassword(userId, passwordHash) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash, loginMethod: "local", failedLoginAttempts: 0 }).where(eq(users.id, userId));
  await db.delete(localSessions).where(eq(localSessions.userId, userId));
}

// server/routers.ts
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";

// shared/login-captcha.ts
import crypto from "node:crypto";
var secret = () => process.env.JWT_SECRET || "note-note-preview-captcha";
function createLoginCaptcha() {
  const left = crypto.randomInt(1, 10);
  const right = crypto.randomInt(1, 10);
  const payload = Buffer.from(JSON.stringify({
    answer: left + right,
    expiresAt: Date.now() + 5 * 60 * 1e3,
    nonce: crypto.randomBytes(12).toString("hex")
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return { question: `${left} + ${right} = ?`, token: `${payload}.${signature}` };
}
function verifyLoginCaptcha(token, answer) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.expiresAt >= Date.now() && Number(answer) === parsed.answer;
  } catch {
    return false;
  }
}

// server/routers.ts
var optionalText = z2.string().optional();
var optionalEmail = z2.union([z2.string().email(), z2.literal("")]).optional();
var optionalAddress = z2.record(z2.string(), z2.string()).optional();
var positiveDecimal = (label) => z2.string().trim().min(1, `${label} \xE9 obrigat\xF3rio.`).refine(
  (value) => Number.isFinite(Number(value)) && Number(value) > 0,
  `${label} deve ser maior que zero.`
);
var nonNegativeDecimal = (label) => z2.string().trim().min(1, `${label} \xE9 obrigat\xF3rio.`).refine(
  (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
  `${label} n\xE3o pode ser negativo.`
);
var validDate = (label) => z2.string().trim().min(1, `${label} \xE9 obrigat\xF3ria.`).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  `${label} \xE9 inv\xE1lida.`
);
var stripLegacyCpf = (client) => {
  const { cpf: _cpf, ...withoutCpf } = client;
  return withoutCpf;
};
var protectedProcedure2 = protectedProcedure.use(({ ctx, next, path }) => {
  const dashboardAllowed = path.startsWith("dashboard.") || ["databases.list", "databases.getActive", "databases.setActive"].includes(
    path
  );
  if (ctx.user.dashboardOnly && !dashboardAllowed) {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "Este usu\xE1rio possui acesso somente ao dashboard."
    });
  }
  return withUserDatabaseScope(
    { userId: ctx.user.id, role: ctx.user.role },
    () => next({ ctx })
  );
});
var adminProcedure2 = protectedProcedure2.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "Acesso negado. Apenas administradores podem acessar este recurso."
    });
  }
  return next({ ctx });
});
var superAdminProcedure = protectedProcedure2.use(({ ctx, next }) => {
  if (ctx.user.role !== "super_admin") {
    throw new TRPCError3({
      code: "FORBIDDEN",
      message: "Apenas o Super Admin pode acessar este recurso."
    });
  }
  return next({ ctx });
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    captcha: publicProcedure.query(() => createLoginCaptcha()),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (ctx.user) {
        createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || "Desconhecido",
          action: "logout",
          entity: "auth",
          details: "Logout realizado com sucesso",
          status: "success"
        });
      }
      return { success: true };
    }),
    loginLocal: publicProcedure.input(
      z2.object({
        username: z2.string().min(1),
        password: z2.string().min(1),
        rememberMe: z2.boolean().optional().default(false),
        captchaToken: z2.string().min(1),
        captchaAnswer: z2.string().min(1)
      })
    ).mutation(async ({ input, ctx }) => {
      if (!verifyLoginCaptcha(input.captchaToken, input.captchaAnswer)) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Confirme corretamente que voc\xEA n\xE3o \xE9 um rob\xF4."
        });
      }
      const user = await getUserByUsername(input.username);
      if (!user || !user.passwordHash) {
        throw new TRPCError3({
          code: "UNAUTHORIZED",
          message: "Usu\xE1rio ou senha inv\xE1lidos"
        });
      }
      const passwordMatch = await bcrypt.compare(
        input.password,
        user.passwordHash
      );
      if (!passwordMatch) {
        if (user.role === "super_admin" || user.username?.toLowerCase() === "draco") {
          throw new TRPCError3({
            code: "UNAUTHORIZED",
            message: "Usu\xE1rio ou senha inv\xE1lidos"
          });
        }
        const attempts = await registerFailedLogin(user.id);
        throw new TRPCError3({
          code: attempts >= 2 ? "FORBIDDEN" : "UNAUTHORIZED",
          message: attempts >= 2 ? "Usu\xE1rio desativado ap\xF3s duas tentativas incorretas. Solicite a reativa\xE7\xE3o ao Super Admin." : "Usu\xE1rio ou senha inv\xE1lidos. Mais uma tentativa incorreta desativar\xE1 a conta."
        });
      }
      if (!user.isActive) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Usu\xE1rio desativado"
        });
      }
      await resetFailedLogin(user.id);
      const token = nanoid(32);
      const sessionDuration = input.rememberMe ? 30 * 24 * 60 * 60 * 1e3 : 8 * 60 * 60 * 1e3;
      const expiresAt = new Date(Date.now() + sessionDuration);
      await createLocalSession(user.id, token, expiresAt);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: sessionDuration
      });
      await createAuditLog({
        userId: user.id,
        username: user.username || user.email || "Desconhecido",
        action: "login_local",
        entity: "auth",
        details: "Login local realizado com sucesso",
        status: "success"
      });
      return { success: true };
    }),
    registerLocal: publicProcedure.input(
      z2.object({
        username: z2.string().min(3).max(100),
        email: z2.string().email(),
        name: z2.string().min(1),
        password: z2.string().min(6)
      })
    ).mutation(async ({ input }) => {
      const existingUser = await getUserByUsername(input.username);
      if (existingUser) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Usu\xE1rio j\xE1 existe"
        });
      }
      const existingEmail = await getUserByEmail(input.email);
      if (existingEmail) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Email j\xE1 cadastrado"
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      await createLocalUser({
        username: input.username,
        email: input.email,
        name: input.name,
        passwordHash
      });
      return { success: true };
    }),
    requestPasswordReset: publicProcedure.input(
      z2.object({
        identifier: z2.string().min(1),
        origin: z2.string().url()
      })
    ).mutation(async ({ input }) => {
      const user = await getUserByUsername(input.identifier) ?? await getUserByEmail(input.identifier);
      if (!user?.passwordHash || user.username === "Draco") {
        return { success: true };
      }
      const token = nanoid(48);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1e3);
      await createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt
      });
      await notifyOwner({
        title: "Solicita\xE7\xE3o de recupera\xE7\xE3o de senha",
        content: `Usu\xE1rio: ${user.username ?? user.email}
Link v\xE1lido por 30 minutos: ${input.origin}/login?reset=${token}`
      });
      return { success: true };
    }),
    resetPassword: publicProcedure.input(
      z2.object({
        token: z2.string().min(1),
        password: z2.string().min(6)
      })
    ).mutation(async ({ input }) => {
      const resetToken = await getPasswordResetToken(input.token);
      if (!resetToken) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Token inv\xE1lido ou expirado"
        });
      }
      const user = await getUserById(resetToken.userId);
      if (!user || user.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Esta conta n\xE3o pode usar recupera\xE7\xE3o de senha."
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      await updateLocalPassword(user.id, passwordHash);
      await consumePasswordResetToken(resetToken.id);
      await createAuditLog({
        userId: user.id,
        username: user.username || user.email || "Usu\xE1rio",
        action: "password_reset",
        entity: "auth",
        details: "Senha local redefinida por token tempor\xE1rio",
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== USERS ====================
  users: router({
    list: adminProcedure2.query(async () => {
      return await getAllUsers();
    }),
    getById: adminProcedure2.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return await getUserById(input.id);
    }),
    create: superAdminProcedure.input(
      z2.object({
        username: z2.string().trim().min(3).max(100),
        email: z2.string().trim().email(),
        name: z2.string().trim().min(1).max(200),
        password: z2.string().min(6),
        role: z2.enum(["user", "admin"]).default("user"),
        canView: z2.boolean().default(true),
        canInsert: z2.boolean().default(false),
        canEdit: z2.boolean().default(false),
        canDelete: z2.boolean().default(false),
        canGenerateReports: z2.boolean().default(false),
        canAccessSettings: z2.boolean().default(false),
        dashboardOnly: z2.boolean().default(false),
        databaseIds: z2.array(z2.number().int().positive()).max(3).default([])
      })
    ).mutation(async ({ input, ctx }) => {
      if (await getUserByUsername(input.username)) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Nome de usu\xE1rio j\xE1 cadastrado."
        });
      }
      if (await getUserByEmail(input.email)) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "E-mail j\xE1 cadastrado."
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      const { databaseIds, ...userInput } = input;
      const created = await createLocalUser({
        ...userInput,
        passwordHash
      });
      const createdUser = await getUserByUsername(input.username);
      if (!createdUser)
        throw new TRPCError3({
          code: "INTERNAL_SERVER_ERROR",
          message: "N\xE3o foi poss\xEDvel confirmar o usu\xE1rio criado."
        });
      await assignUserDatabases(createdUser.id, databaseIds);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.username || ctx.user.email || "Super Admin",
        action: "create_user",
        entity: "users",
        entityId: createdUser?.id,
        details: JSON.stringify({
          username: input.username,
          role: input.role,
          permissions: {
            canView: input.canView,
            canInsert: input.canInsert,
            canEdit: input.canEdit,
            canDelete: input.canDelete,
            canGenerateReports: input.canGenerateReports,
            canAccessSettings: input.canAccessSettings
          },
          databaseIds
        }),
        status: "success"
      });
      return createdUser ?? created;
    }),
    update: superAdminProcedure.input(
      z2.object({
        userId: z2.number(),
        username: z2.string().trim().min(3).max(100),
        email: z2.string().trim().email(),
        name: z2.string().trim().min(1).max(200),
        role: z2.enum(["user", "admin"]),
        canView: z2.boolean(),
        canInsert: z2.boolean(),
        canEdit: z2.boolean(),
        canDelete: z2.boolean(),
        canGenerateReports: z2.boolean(),
        canAccessSettings: z2.boolean(),
        dashboardOnly: z2.boolean(),
        databaseIds: z2.array(z2.number().int().positive()).max(3)
      })
    ).mutation(async ({ input, ctx }) => {
      const target = await getUserById(input.userId);
      if (!target)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Usu\xE1rio n\xE3o encontrado."
        });
      if (target.username?.toLowerCase() === "draco")
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "O Super Admin protegido n\xE3o pode ser editado."
        });
      const usernameOwner = await getUserByUsername(input.username);
      if (usernameOwner && usernameOwner.id !== input.userId)
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Nome de usu\xE1rio j\xE1 cadastrado."
        });
      const emailOwner = await getUserByEmail(input.email);
      if (emailOwner && emailOwner.id !== input.userId)
        throw new TRPCError3({
          code: "CONFLICT",
          message: "E-mail j\xE1 cadastrado."
        });
      const { userId, databaseIds, ...data } = input;
      await updateLocalUser(userId, data);
      await assignUserDatabases(userId, databaseIds);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.username || ctx.user.email || "Super Admin",
        action: "update_user",
        entity: "users",
        entityId: userId,
        details: `Usu\xE1rio editado: ${input.username}`,
        status: "success"
      });
      return { success: true };
    }),
    updatePermissions: superAdminProcedure.input(
      z2.object({
        userId: z2.number(),
        canView: z2.boolean().optional(),
        canInsert: z2.boolean().optional(),
        canEdit: z2.boolean().optional(),
        canDelete: z2.boolean().optional(),
        canGenerateReports: z2.boolean().optional(),
        canAccessSettings: z2.boolean().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (targetUser?.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "As permiss\xF5es do super administrador Draco s\xE3o imut\xE1veis."
        });
      }
      const { userId, ...permissions } = input;
      await updateUserPermissions(userId, permissions);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "update_permissions",
        entity: "users",
        entityId: userId,
        details: JSON.stringify(permissions),
        status: "success"
      });
      return { success: true };
    }),
    updateRole: superAdminProcedure.input(
      z2.object({
        userId: z2.number(),
        role: z2.enum(["user", "admin", "super_admin"])
      })
    ).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (targetUser?.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "O super administrador Draco n\xE3o pode ter o perfil alterado."
        });
      }
      await updateUserRole(input.userId, input.role);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "update_role",
        entity: "users",
        entityId: input.userId,
        details: `Role alterado para: ${input.role}`,
        status: "success"
      });
      return { success: true };
    }),
    toggleActive: superAdminProcedure.input(
      z2.object({
        userId: z2.number(),
        isActive: z2.boolean()
      })
    ).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (targetUser?.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "O super administrador Draco n\xE3o pode ser desativado."
        });
      }
      await toggleUserActive(input.userId, input.isActive);
      if (!input.isActive) await deleteUserSessions(input.userId);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "toggle_user_active",
        entity: "users",
        entityId: input.userId,
        details: `Usu\xE1rio ${input.isActive ? "ativado" : "desativado"}`,
        status: "success"
      });
      return { success: true };
    }),
    adminResetPassword: superAdminProcedure.input(
      z2.object({
        userId: z2.number(),
        password: z2.string().min(6)
      })
    ).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (!targetUser) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Usu\xE1rio n\xE3o encontrado."
        });
      }
      if (targetUser.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "A senha do super administrador Draco n\xE3o pode ser alterada."
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 10);
      await updateLocalPassword(targetUser.id, passwordHash);
      await deleteUserSessions(targetUser.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "admin_password_reset",
        entity: "users",
        entityId: targetUser.id,
        details: `Senha redefinida pelo administrador para ${targetUser.username || targetUser.email}`,
        status: "success"
      });
      return { success: true };
    }),
    delete: superAdminProcedure.input(z2.object({ userId: z2.number() })).mutation(async ({ input, ctx }) => {
      const targetUser = await getUserById(input.userId);
      if (targetUser?.username === "Draco") {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "O super administrador Draco n\xE3o pode ser exclu\xEDdo."
        });
      }
      await deleteUser(input.userId);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "delete_user",
        entity: "users",
        entityId: input.userId,
        details: "Usu\xE1rio exclu\xEDdo",
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== DATABASES ====================
  databases: router({
    list: protectedProcedure2.query(async ({ ctx }) => {
      return await getDatabasesForUser(ctx.user.id, ctx.user.role);
    }),
    getActive: protectedProcedure2.query(async () => {
      return await getActiveDatabase();
    }),
    create: adminProcedure2.input(
      z2.object({
        name: z2.string().min(1),
        description: z2.string().optional(),
        type: z2.enum(["novo", "copia", "existente"])
      })
    ).mutation(async ({ input, ctx }) => {
      const result = await createDatabase({
        ...input,
        createdBy: ctx.user.id
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "create_database",
        entity: "databases",
        details: `Banco criado: ${input.name} (${input.type})`,
        status: "success"
      });
      return result;
    }),
    setActive: protectedProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      await setActiveDatabase(input.id);
      const dbInfo = await getDatabaseById(input.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "switch_database",
        entity: "databases",
        entityId: input.id,
        databaseId: input.id,
        details: `Banco ativado: ${dbInfo?.name}`,
        status: "success"
      });
      return { success: true };
    }),
    update: adminProcedure2.input(
      z2.object({
        id: z2.number(),
        name: z2.string().optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateDatabase(id, data);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "update_database",
        entity: "databases",
        entityId: id,
        details: JSON.stringify(data),
        status: "success"
      });
      return { success: true };
    }),
    delete: superAdminProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      const dbInfo = await getDatabaseById(input.id);
      if (!dbInfo)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Banco de dados n\xE3o encontrado."
        });
      await deleteDatabase(input.id);
      if (dbInfo.isActive) {
        const remaining = await getAllDatabases();
        if (remaining[0]) await setActiveDatabase(remaining[0].id);
      }
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Admin",
        action: "delete_database",
        entity: "databases",
        entityId: input.id,
        details: `Banco deletado: ${dbInfo?.name}`,
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== AGENTS ====================
  agents: router({
    list: protectedProcedure2.input(
      z2.object({ includeInactive: z2.boolean().default(true).optional() }).optional()
    ).query(async ({ input, ctx }) => {
      if (!ctx.user.canView) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar agentes."
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getAgentsByDatabase(
        activeDb.id,
        input?.includeInactive ?? true
      );
    }),
    getById: protectedProcedure2.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      const agent = await getAgentById(input.id);
      if (!agent)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Agente n\xE3o encontrado."
        });
      return agent;
    }),
    create: protectedProcedure2.input(
      z2.object({
        name: z2.string().trim().min(1).max(255),
        defaultCommissionPercentage: z2.coerce.number().min(0).max(100)
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir agentes."
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const result = await createAgent({
        databaseId: activeDb.id,
        name: input.name.trim(),
        defaultCommissionPercentage: input.defaultCommissionPercentage.toFixed(2),
        status: "ACTIVE",
        createdBy: ctx.user.id
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_agent",
        entity: "agents",
        databaseId: activeDb.id,
        details: `Agente criado: ${input.name}`,
        status: "success"
      });
      return result;
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number(),
        name: z2.string().min(1).max(255).optional(),
        defaultCommissionPercentage: z2.coerce.number().min(0).max(100).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar agentes."
        });
      }
      const activeDb = await getActiveDatabase();
      const targetAgent = activeDb ? await getAgentById(input.id) : void 0;
      if (!activeDb || !targetAgent || targetAgent.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Agente n\xE3o encontrado no banco ativo."
        });
      }
      const { id, defaultCommissionPercentage, ...rest } = input;
      await updateAgent(
        id,
        {
          ...rest,
          ...defaultCommissionPercentage === void 0 ? {} : {
            defaultCommissionPercentage: defaultCommissionPercentage.toFixed(2)
          }
        },
        activeDb.id
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_agent",
        entity: "agents",
        entityId: id,
        details: JSON.stringify(input),
        status: "success"
      });
      return { success: true };
    }),
    deactivate: protectedProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para desativar agentes."
        });
      }
      const activeDb = await getActiveDatabase();
      const targetAgent = activeDb ? await getAgentById(input.id) : void 0;
      if (!activeDb || !targetAgent || targetAgent.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Agente n\xE3o encontrado no banco ativo."
        });
      }
      await deactivateAgent(input.id, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "deactivate_agent",
        entity: "agents",
        entityId: input.id,
        details: "Agente desativado; hist\xF3rico preservado.",
        status: "success"
      });
      return { success: true };
    }),
    history: protectedProcedure2.input(
      z2.object({
        agentId: z2.number(),
        startDate: z2.string().optional(),
        endDate: z2.string().optional()
      })
    ).query(async ({ input, ctx }) => {
      if (!ctx.user.canView) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar o hist\xF3rico."
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        return {
          payments: [],
          totals: {
            totalPayments: 0,
            totalPaymentAmount: 0,
            totalCommission: 0,
            averageCommission: 0
          }
        };
      return await getAgentPaymentHistory(
        input.agentId,
        activeDb.id,
        input.startDate ? new Date(input.startDate) : void 0,
        input.endDate ? new Date(input.endDate) : void 0
      );
    })
  }),
  // ==================== CLIENTS ====================
  clients: router({
    list: protectedProcedure2.query(async ({ ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar clientes."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return (await getClientsByDatabase(activeDb.id)).map(stripLegacyCpf);
    }),
    getById: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).query(async ({ input }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) return void 0;
      const client = await getClientById(input.id);
      if (!client || client.databaseId !== activeDb.id) return void 0;
      return stripLegacyCpf(client);
    }),
    profile: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).query(async ({ input, ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar clientes."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return void 0;
      const profile = await getClientProfile(input.id, activeDb.id);
      if (!profile)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Cliente n\xE3o encontrado no banco ativo."
        });
      return { ...profile, client: stripLegacyCpf(profile.client) };
    }),
    create: protectedProcedure2.input(
      z2.object({
        name: z2.string().trim().min(1),
        birthDate: z2.string().optional(),
        email: optionalEmail,
        phone: optionalText,
        whatsapp: optionalText,
        profession: optionalText,
        indicatorAgentId: z2.number().int().positive().optional(),
        address: optionalText,
        residentialAddress: optionalAddress,
        commercialAddress: optionalAddress,
        city: optionalText,
        state: optionalText,
        zipCode: optionalText,
        notes: optionalText
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      }
      if (!ctx.user.canInsert) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir dados"
        });
      }
      const result = await createClient({
        name: input.name,
        birthDate: input.birthDate ? new Date(input.birthDate) : void 0,
        email: input.email,
        phone: input.phone,
        whatsapp: input.whatsapp,
        profession: input.profession,
        indicatorAgentId: input.indicatorAgentId,
        address: input.address,
        residentialAddress: input.residentialAddress,
        commercialAddress: input.commercialAddress,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        notes: input.notes,
        databaseId: activeDb.id,
        createdBy: ctx.user.id
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_client",
        entity: "clients",
        databaseId: activeDb.id,
        details: `Cliente criado: ${input.name}`,
        status: "success"
      });
      return result;
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number().int().positive(),
        name: z2.string().trim().min(1).optional(),
        birthDate: z2.string().optional(),
        email: optionalEmail,
        phone: optionalText,
        whatsapp: optionalText,
        profession: optionalText,
        indicatorAgentId: z2.number().int().positive().optional(),
        address: optionalText,
        residentialAddress: optionalAddress,
        commercialAddress: optionalAddress,
        city: optionalText,
        state: optionalText,
        zipCode: optionalText,
        notes: optionalText
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar dados"
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      const currentClient = await getClientById(input.id);
      if (!currentClient || currentClient.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Cliente n\xE3o encontrado no banco ativo."
        });
      const { id, birthDate, ...data } = input;
      await updateClientInDatabase(
        id,
        {
          ...data,
          ...birthDate !== void 0 ? { birthDate: birthDate ? new Date(birthDate) : null } : {}
        },
        activeDb.id
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_client",
        entity: "clients",
        entityId: id,
        databaseId: activeDb?.id,
        details: JSON.stringify(data),
        status: "success"
      });
      return { success: true };
    }),
    delete: superAdminProcedure.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      const currentClient = await getClientById(input.id);
      if (!currentClient || currentClient.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Cliente n\xE3o encontrado no banco ativo."
        });
      await deleteClientInDatabase(input.id, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "delete_client",
        entity: "clients",
        entityId: input.id,
        databaseId: activeDb?.id,
        details: "Cliente deletado",
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== LOANS ====================
  loans: router({
    list: protectedProcedure2.query(async ({ ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar empr\xE9stimos."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getLoansByDatabase(activeDb.id);
    }),
    getById: protectedProcedure2.input(z2.object({ id: z2.number() })).query(async ({ input, ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar empr\xE9stimos."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return null;
      const loan = await getLoanById(input.id);
      return loan?.databaseId === activeDb.id ? loan : null;
    }),
    details: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).query(async ({ input, ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar detalhes."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return null;
      const loan = await getLoanById(input.id);
      if (!loan || loan.databaseId !== activeDb.id) return null;
      const [client, payments2, interestHistory, cashFlow2] = await Promise.all(
        [
          getClientById(loan.clientId),
          getPaymentsByLoan(loan.id, activeDb.id),
          getLoanInterestHistory(loan.id, activeDb.id),
          getCashFlowByLoan(loan.id, activeDb.id)
        ]
      );
      return {
        loan,
        client: client && client.databaseId === activeDb.id ? client : null,
        payments: payments2,
        interestHistory,
        cashFlow: cashFlow2
      };
    }),
    getByClient: protectedProcedure2.input(z2.object({ clientId: z2.number() })).query(async ({ input, ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar empr\xE9stimos."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      const client = await getClientById(input.clientId);
      if (!client || client.databaseId !== activeDb.id) return [];
      return await getLoansByClient(input.clientId, activeDb.id);
    }),
    history: protectedProcedure2.input(z2.object({ loanId: z2.number().int().positive() })).query(async ({ input, ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar o hist\xF3rico."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      const loan = await getLoanById(input.loanId);
      if (!loan || loan.databaseId !== activeDb.id) return [];
      return getLoanInterestHistory(input.loanId, activeDb.id);
    }),
    generateInterest: protectedProcedure2.input(
      z2.object({
        loanId: z2.number().int().positive(),
        periodReference: z2.string().trim().min(1).max(20)
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para lan\xE7ar juros."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const loan = await getLoanById(input.loanId);
      if (!loan || loan.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Empr\xE9stimo n\xE3o encontrado no banco ativo."
        });
      if (loan.status === "pago" || loan.status === "cancelado")
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "N\xE3o \xE9 poss\xEDvel lan\xE7ar juros em um empr\xE9stimo encerrado."
        });
      if (await getLoanInterestPeriod(
        input.loanId,
        activeDb.id,
        input.periodReference
      )) {
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Os juros deste per\xEDodo j\xE1 foram lan\xE7ados."
        });
      }
      const principalBalance = Number(loan.principalBalance || loan.amount);
      const interest = calculateInterestOnBalance(
        principalBalance,
        Number(loan.interestRate)
      );
      const accruedInterest = roundMoney(
        Number(loan.accruedInterest || 0) + interest
      );
      await createLoanInterestHistory({
        databaseId: activeDb.id,
        loanId: loan.id,
        periodReference: input.periodReference,
        previousPrincipalBalance: principalBalance.toFixed(2),
        interestGenerated: interest.toFixed(2),
        paymentAmount: "0.00",
        interestPaid: "0.00",
        principalAmortized: "0.00",
        updatedPrincipalBalance: principalBalance.toFixed(2)
      });
      await updateLoanBalance(loan.id, activeDb.id, {
        principalBalance: principalBalance.toFixed(2),
        accruedInterest: accruedInterest.toFixed(2),
        remainingBalance: roundMoney(
          principalBalance + accruedInterest
        ).toFixed(2),
        lastInterestPeriod: input.periodReference
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "generate_loan_interest",
        entity: "loans",
        entityId: loan.id,
        databaseId: activeDb.id,
        details: `Juros de ${input.periodReference}: R$ ${interest.toFixed(2)}`,
        status: "success"
      });
      return { interest, accruedInterest, principalBalance };
    }),
    create: protectedProcedure2.input(
      z2.object({
        clientId: z2.number().int().positive(),
        amount: positiveDecimal("Valor principal"),
        interestType: z2.enum(["simple", "compound"]).default("simple").optional(),
        interestRate: nonNegativeDecimal("Taxa de juros"),
        ratePeriod: z2.enum(["day", "week", "month", "year"]).default("month").optional(),
        installments: z2.coerce.number().int().positive().optional(),
        installmentAmount: z2.string().optional(),
        totalAmount: z2.string().optional(),
        startDate: validDate("Data inicial"),
        endDate: validDate("Data final").optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      }
      if (!ctx.user.canInsert) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir dados"
        });
      }
      const client = await getClientById(input.clientId);
      if (!client || client.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Cliente inv\xE1lido para o banco ativo."
        });
      const principal = Number(input.amount);
      const ratePercent = Number(input.interestRate);
      if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Valor principal ou taxa de juros inv\xE1lidos."
        });
      }
      const interestType = input.interestType ?? "simple";
      const ratePeriod = input.ratePeriod ?? "month";
      const periods = input.installments ?? 1;
      const plan = calculateLoanPlan({
        principal,
        ratePercent,
        periods,
        interestType,
        ratePeriod
      });
      const initialInterest = calculateInterestOnBalance(
        principal,
        ratePercent
      );
      const installmentAmount = input.installmentAmount === void 0 || input.installmentAmount.trim() === "" ? plan.installmentAmount : Number(input.installmentAmount);
      if (!Number.isFinite(installmentAmount) || installmentAmount <= 0)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O valor da parcela deve ser maior que zero."
        });
      const startDate = new Date(input.startDate);
      if (Number.isNaN(startDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Data inicial inv\xE1lida."
        });
      const endDate = input.endDate ? new Date(input.endDate) : addPeriods(startDate, plan.periods, ratePeriod);
      if (Number.isNaN(endDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Data final inv\xE1lida."
        });
      if (endDate < startDate)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "A data final deve ser igual ou posterior \xE0 data inicial."
        });
      const result = await createLoanBundle(
        {
          clientId: input.clientId,
          amount: plan.principal.toFixed(2),
          interestType,
          interestRate: ratePercent.toFixed(4),
          ratePeriod,
          installments: plan.periods,
          installmentAmount: roundMoney(installmentAmount).toFixed(2),
          totalAmount: roundMoney(principal + initialInterest).toFixed(2),
          remainingBalance: roundMoney(principal + initialInterest).toFixed(
            2
          ),
          principalBalance: plan.principal.toFixed(2),
          accruedInterest: initialInterest.toFixed(2),
          totalPaid: "0.00",
          lastInterestPeriod: null,
          startDate,
          endDate,
          status: "ativo",
          description: input.description,
          databaseId: activeDb.id,
          createdBy: ctx.user.id
        },
        {
          databaseId: activeDb.id,
          type: "SAIDA",
          category: "LIBERACAO_EMPRESTIMO",
          description: "Libera\xE7\xE3o de empr\xE9stimo",
          amount: plan.principal.toFixed(2),
          movementDate: startDate,
          clientId: input.clientId,
          responsible: ctx.user.name || ctx.user.email || "Usu\xE1rio",
          notes: input.description,
          createdBy: ctx.user.id
        }
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_loan",
        entity: "loans",
        databaseId: activeDb.id,
        details: `Empr\xE9stimo criado: R$ ${input.amount}`,
        status: "success"
      });
      return result;
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number(),
        clientId: z2.number().int().positive().optional(),
        amount: z2.string().optional(),
        interestType: z2.enum(["simple", "compound"]).optional(),
        interestRate: z2.string().optional(),
        ratePeriod: z2.enum(["day", "week", "month", "year"]).optional(),
        installments: z2.coerce.number().int().positive().optional(),
        installmentAmount: z2.string().optional(),
        totalAmount: z2.string().optional(),
        startDate: z2.string().optional(),
        endDate: z2.string().optional(),
        status: z2.enum(["ativo", "pago", "atrasado", "cancelado"]).optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar dados"
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const currentLoan = await getLoanById(input.id);
      if (!currentLoan || currentLoan.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Empr\xE9stimo n\xE3o encontrado no banco ativo."
        });
      if (input.clientId !== void 0) {
        const client = await getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Cliente inv\xE1lido para o banco ativo."
          });
      }
      const startDate = input.startDate ? new Date(input.startDate) : currentLoan.startDate;
      const endDate = input.endDate ? new Date(input.endDate) : currentLoan.endDate;
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Datas do empr\xE9stimo inv\xE1lidas."
        });
      const principal = input.amount !== void 0 ? Number(input.amount) : Number(currentLoan.amount);
      const ratePercent = input.interestRate !== void 0 ? Number(input.interestRate) : Number(currentLoan.interestRate);
      if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Valor principal ou taxa de juros inv\xE1lidos."
        });
      const interestType = input.interestType ?? currentLoan.interestType;
      const ratePeriod = input.ratePeriod ?? currentLoan.ratePeriod;
      const periods = input.installments ?? currentLoan.installments ?? 1;
      const { id, status, description, clientId } = input;
      const plan = calculateLoanPlan({
        principal,
        ratePercent,
        periods,
        interestType,
        ratePeriod
      });
      const initialInterest = calculateInterestOnBalance(
        principal,
        ratePercent
      );
      const installmentAmount = input.installmentAmount === void 0 ? Number(currentLoan.installmentAmount) : Number(input.installmentAmount);
      if (!Number.isFinite(installmentAmount) || installmentAmount <= 0)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O valor da parcela deve ser maior que zero."
        });
      const financialTermsChanged = input.amount !== void 0 || input.interestType !== void 0 || input.interestRate !== void 0 || input.ratePeriod !== void 0 || input.installments !== void 0 || input.installmentAmount !== void 0 || input.totalAmount !== void 0;
      const hasInitialInterest = Boolean(
        await getLoanInterestPeriod(
          id,
          activeDb.id,
          INITIAL_LOAN_INTEREST_PERIOD
        )
      );
      await updateLoanInDatabase(
        id,
        activeDb.id,
        {
          clientId,
          amount: plan.principal.toFixed(2),
          interestType,
          interestRate: ratePercent.toFixed(4),
          ratePeriod,
          installments: plan.periods,
          installmentAmount: roundMoney(installmentAmount).toFixed(2),
          totalAmount: roundMoney(principal + initialInterest).toFixed(2),
          startDate,
          endDate,
          ...status !== void 0 ? { status } : {},
          ...description !== void 0 ? { description } : {}
        },
        financialTermsChanged || hasInitialInterest ? initialInterest : void 0
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_loan",
        entity: "loans",
        entityId: id,
        databaseId: activeDb.id,
        details: JSON.stringify(input),
        status: "success"
      });
      return { success: true, message: "Empr\xE9stimo atualizado com sucesso." };
    }),
    delete: protectedProcedure2.input(
      z2.object({
        id: z2.number().int().positive(),
        reason: z2.string().trim().min(3, "Informe uma observa\xE7\xE3o com pelo menos 3 caracteres.").max(500, "A observa\xE7\xE3o deve ter no m\xE1ximo 500 caracteres.")
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canDelete) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para deletar dados"
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const currentLoan = await getLoanById(input.id);
      if (!currentLoan || currentLoan.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Empr\xE9stimo n\xE3o encontrado no banco ativo."
        });
      const result = await deleteLoanSafely(input.id, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: result.cancelled ? "cancel_loan" : "delete_loan",
        entity: "loans",
        entityId: input.id,
        databaseId: activeDb.id,
        details: JSON.stringify({
          ...result,
          reason: input.reason,
          previousStatus: currentLoan.status,
          clientId: currentLoan.clientId,
          amount: currentLoan.amount
        }),
        status: result.cancelled ? "warning" : "success"
      });
      return {
        success: true,
        cancelled: result.cancelled,
        message: result.cancelled ? "Empr\xE9stimo removido dos registros operacionais e do dashboard." : "Empr\xE9stimo exclu\xEDdo com sucesso.",
        relations: result.relations
      };
    })
  }),
  // ==================== PAYMENTS ====================
  payments: router({
    list: protectedProcedure2.query(async () => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getPaymentsByDatabase(activeDb.id);
    }),
    getByLoan: protectedProcedure2.input(z2.object({ loanId: z2.number() })).query(async ({ input }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getPaymentsByLoan(input.loanId, activeDb.id);
    }),
    create: protectedProcedure2.input(
      z2.object({
        loanId: z2.number().int().positive().optional(),
        vehicleFinancingId: z2.number().int().positive().optional(),
        installmentNumber: z2.coerce.number().int().positive(),
        amount: z2.string(),
        paymentDate: z2.string(),
        dueDate: z2.string(),
        status: z2.enum(["pago", "pendente", "atrasado"]),
        lateFee: z2.string().optional(),
        interest: z2.string().optional(),
        notes: z2.string().optional(),
        agentId: z2.number().int().positive().optional(),
        commissionPercentage: z2.coerce.number().min(0).max(100).optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      if (!ctx.user.canInsert)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir dados"
        });
      if (input.loanId === void 0 === (input.vehicleFinancingId === void 0)) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Informe exatamente um empr\xE9stimo ou um financiamento."
        });
      }
      const loan = input.loanId === void 0 ? void 0 : await getLoanById(input.loanId);
      const vehicleFinancing = input.vehicleFinancingId === void 0 ? void 0 : await getVehicleFinancingById(input.vehicleFinancingId);
      if (input.loanId !== void 0 && (!loan || loan.databaseId !== activeDb.id || ["pago", "cancelado"].includes(loan.status))) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Empr\xE9stimo inv\xE1lido, encerrado ou fora do banco ativo."
        });
      }
      if (input.vehicleFinancingId !== void 0 && (!vehicleFinancing || vehicleFinancing.databaseId !== activeDb.id || ["pago", "cancelado"].includes(vehicleFinancing.status))) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Financiamento inv\xE1lido, encerrado ou fora do banco ativo."
        });
      }
      const paymentAmount = Number(input.amount);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O valor do pagamento deve ser maior que zero."
        });
      const paymentDate = new Date(input.paymentDate);
      const dueDate = new Date(input.dueDate);
      if (Number.isNaN(paymentDate.getTime()) || Number.isNaN(dueDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "As datas do pagamento s\xE3o inv\xE1lidas."
        });
      let commissionPercentage = 0;
      let agentId;
      if (input.agentId !== void 0) {
        const agent = await getAgentById(input.agentId);
        if (!agent || agent.databaseId !== activeDb.id)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Agente inv\xE1lido para o banco ativo."
          });
        if (agent.status !== "ACTIVE")
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Agentes inativos n\xE3o podem ser selecionados em novos pagamentos."
          });
        agentId = agent.id;
        commissionPercentage = input.commissionPercentage ?? Number(agent.defaultCommissionPercentage || 0);
      } else if (input.commissionPercentage !== void 0 && input.commissionPercentage !== 0) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "A comiss\xE3o s\xF3 pode ser informada quando um agente \xE9 selecionado."
        });
      }
      const priorPayments = loan ? await getPaymentsByLoan(loan.id, activeDb.id) : await getPaymentsByFinancing(vehicleFinancing.id, activeDb.id);
      if (vehicleFinancing && input.status === "pago") {
        if (input.installmentNumber > vehicleFinancing.installments)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: `A cota deve estar entre 1 e ${vehicleFinancing.installments}.`
          });
        if (priorPayments.some(
          (payment) => payment.status === "pago" && payment.installmentNumber === input.installmentNumber
        )) {
          throw new TRPCError3({
            code: "CONFLICT",
            message: `A cota ${input.installmentNumber} j\xE1 foi paga.`
          });
        }
      }
      const contractPrincipal = loan ? Number(loan.principalBalance || loan.amount) : Number(vehicleFinancing?.financedAmount || 0);
      const accruedInterest = loan ? Number(loan.accruedInterest || 0) : Math.max(
        0,
        Number(
          vehicleFinancing?.totalAmount || vehicleFinancing?.financedAmount || 0
        ) - contractPrincipal
      );
      const priorPaid = priorPayments.filter((payment) => payment.status === "pago").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const balanceBefore = loan ? roundMoney(contractPrincipal + accruedInterest) : Math.max(
        0,
        Number(
          vehicleFinancing?.totalAmount || vehicleFinancing?.financedAmount || 0
        ) - priorPaid
      );
      if (input.status === "pago" && paymentAmount > balanceBefore + 0.01)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O pagamento n\xE3o pode exceder o saldo do contrato."
        });
      const allocation = input.status === "pago" ? loan ? allocateBalancePayment(
        paymentAmount,
        accruedInterest,
        contractPrincipal
      ) : (() => {
        const installmentValue = Number(
          vehicleFinancing.installmentAmount
        );
        const installmentInterest = roundMoney(
          Math.max(
            0,
            Number(vehicleFinancing.totalAmount) - Number(vehicleFinancing.financedAmount)
          ) / vehicleFinancing.installments
        );
        const regularQuota = Math.min(
          paymentAmount,
          installmentValue
        );
        const extraAmortization = roundMoney(
          Math.max(0, paymentAmount - regularQuota)
        );
        const interestAmount = roundMoney(
          Math.min(regularQuota, installmentInterest)
        );
        return {
          interestAmount,
          principalAmount: roundMoney(
            Math.max(0, regularQuota - interestAmount) + extraAmortization
          ),
          remainingBalance: roundMoney(
            Math.max(0, balanceBefore - paymentAmount)
          )
        };
      })() : {
        principalAmount: 0,
        interestAmount: 0,
        remainingBalance: balanceBefore
      };
      const commissionAmount = Math.round(paymentAmount * commissionPercentage) / 100;
      const netAmount = Math.round((paymentAmount - commissionAmount) * 100) / 100;
      const duplicate = await paymentAlreadyRegistered({
        databaseId: activeDb.id,
        loanId: input.loanId,
        vehicleFinancingId: input.vehicleFinancingId,
        installmentNumber: input.installmentNumber,
        amount: input.amount,
        paymentDate,
        agentId
      });
      if (duplicate)
        throw new TRPCError3({
          code: "CONFLICT",
          message: "Este pagamento e sua comiss\xE3o j\xE1 foram registrados."
        });
      const paymentData = {
        loanId: input.loanId,
        vehicleFinancingId: input.vehicleFinancingId,
        installmentNumber: input.installmentNumber,
        amount: paymentAmount.toFixed(2),
        paymentDate,
        dueDate: vehicleFinancing ? addPeriods(
          new Date(vehicleFinancing.startDate),
          input.installmentNumber,
          "month"
        ) : dueDate,
        status: input.status,
        lateFee: input.lateFee,
        interest: input.interest,
        principalAmount: allocation.principalAmount.toFixed(2),
        interestAmount: allocation.interestAmount.toFixed(2),
        remainingBalance: allocation.remainingBalance.toFixed(2),
        notes: input.notes,
        agentId,
        commissionPercentage: commissionPercentage.toFixed(2),
        commissionAmount: commissionAmount.toFixed(2),
        netAmount: netAmount.toFixed(2),
        databaseId: activeDb.id,
        createdBy: ctx.user.id
      };
      const nextPrincipal = roundMoney(
        Math.max(
          0,
          Number(loan?.principalBalance || loan?.amount || 0) - allocation.principalAmount
        )
      );
      const nextInterest = roundMoney(
        Math.max(
          0,
          Number(loan?.accruedInterest || 0) - allocation.interestAmount
        )
      );
      const nextTotalPaid = roundMoney(
        Number(loan?.totalPaid || 0) + paymentAmount
      );
      const result = await createPaymentBundle(
        paymentData,
        {
          databaseId: activeDb.id,
          type: "ENTRADA",
          category: loan ? allocation.interestAmount > 0 && allocation.principalAmount === 0 ? "JUROS_EMPRESTIMO" : allocation.remainingBalance <= 0 ? "QUITACAO_EMPRESTIMO" : "PAGAMENTO_EMPRESTIMO" : "PAGAMENTO_FINANCIAMENTO",
          description: loan ? `Recebimento do empr\xE9stimo #${loan.id}` : `Recebimento do financiamento #${vehicleFinancing.id}`,
          amount: paymentAmount.toFixed(2),
          movementDate: paymentDate,
          clientId: loan?.clientId ?? vehicleFinancing?.clientId,
          loanId: loan?.id,
          responsible: ctx.user.name || ctx.user.email || "Usu\xE1rio",
          notes: input.notes,
          createdBy: ctx.user.id
        },
        loan && input.status === "pago" ? {
          id: loan.id,
          databaseId: activeDb.id,
          values: {
            principalBalance: nextPrincipal.toFixed(2),
            accruedInterest: nextInterest.toFixed(2),
            totalPaid: nextTotalPaid.toFixed(2),
            remainingBalance: allocation.remainingBalance.toFixed(2),
            status: allocation.remainingBalance <= 0 ? "pago" : new Date(loan.endDate) < /* @__PURE__ */ new Date() ? "atrasado" : "ativo"
          }
        } : void 0
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_payment",
        entity: "payments",
        databaseId: activeDb.id,
        details: `Pagamento registrado: R$ ${paymentAmount.toFixed(2)}; comiss\xE3o: R$ ${commissionAmount.toFixed(2)}`,
        status: "success"
      });
      return result;
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number(),
        amount: z2.string().optional(),
        status: z2.enum(["pago", "pendente", "atrasado"]).optional(),
        paymentDate: z2.string().optional(),
        dueDate: z2.string().optional(),
        notes: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar dados"
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const current = await getPaymentById(input.id);
      if (!current || current.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Pagamento n\xE3o encontrado no banco ativo."
        });
      const amount = input.amount !== void 0 ? Number(input.amount) : Number(current.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "O valor do pagamento deve ser maior que zero."
        });
      const paymentDate = input.paymentDate ? new Date(input.paymentDate) : current.paymentDate;
      const dueDate = input.dueDate ? new Date(input.dueDate) : current.dueDate;
      if (Number.isNaN(paymentDate.getTime()) || Number.isNaN(dueDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "As datas do pagamento s\xE3o inv\xE1lidas."
        });
      const result = await updatePaymentBundle(input.id, activeDb.id, {
        amount: amount.toFixed(2),
        status: input.status ?? current.status,
        paymentDate,
        dueDate,
        notes: input.notes !== void 0 ? input.notes : current.notes
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_payment",
        entity: "payments",
        entityId: input.id,
        databaseId: activeDb.id,
        details: JSON.stringify(input),
        status: "success"
      });
      return {
        success: true,
        message: "Pagamento atualizado e caixa reconciliado.",
        result
      };
    }),
    delete: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canDelete)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para excluir pagamentos."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const current = await getPaymentById(input.id);
      if (!current || current.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Pagamento n\xE3o encontrado no banco ativo."
        });
      const result = await deletePaymentBundle(input.id, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "delete_payment",
        entity: "payments",
        entityId: input.id,
        databaseId: activeDb.id,
        details: "Pagamento removido; caixa e saldo recalculados.",
        status: "warning"
      });
      return {
        success: true,
        message: "Pagamento exclu\xEDdo e caixa reconciliado.",
        result
      };
    })
  }),
  // ==================== CASH FLOW ====================
  cashFlow: router({
    list: protectedProcedure2.query(async ({ ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar o fluxo de caixa."
        });
      const activeDb = await getActiveDatabase();
      return activeDb ? getCashFlowByDatabase(activeDb.id) : [];
    }),
    create: protectedProcedure2.input(
      z2.object({
        type: z2.enum(["ENTRADA", "SAIDA"]),
        category: z2.string().trim().min(1),
        description: z2.string().trim().min(1),
        amount: z2.coerce.number().positive(),
        movementDate: z2.string(),
        responsible: z2.string().optional(),
        notes: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para registrar movimenta\xE7\xF5es."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const movementDate = new Date(input.movementDate);
      if (Number.isNaN(movementDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Data da movimenta\xE7\xE3o inv\xE1lida."
        });
      await createCashFlowEntry({
        ...input,
        amount: input.amount.toFixed(2),
        movementDate,
        databaseId: activeDb.id,
        createdBy: ctx.user.id
      });
      return { success: true };
    }),
    delete: superAdminProcedure.input(
      z2.object({
        id: z2.number().int().positive(),
        reason: z2.string().trim().min(3).max(500)
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const result = await deleteCashFlowEntry(input.id, activeDb.id);
      if (!result.deleted) {
        if (result.reason === "not_found")
          throw new TRPCError3({
            code: "NOT_FOUND",
            message: "Lan\xE7amento n\xE3o encontrado no banco ativo."
          });
      }
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Super Admin",
        action: "delete_cash_flow",
        entity: "cash_flow",
        entityId: result.entry.id,
        databaseId: activeDb.id,
        details: JSON.stringify({
          type: result.entry.type,
          category: result.entry.category,
          description: result.entry.description,
          amount: result.entry.amount,
          reason: input.reason,
          sourceKey: result.entry.sourceKey,
          paymentId: result.entry.paymentId,
          loanId: result.entry.loanId,
          vehicleId: result.entry.vehicleId,
          vehicleSaleId: result.entry.vehicleSaleId
        }),
        status: "warning"
      });
      return {
        success: true,
        message: "Lan\xE7amento exclu\xEDdo do caixa."
      };
    })
  }),
  // ==================== VEHICLES ====================
  vehicles: router({
    list: protectedProcedure2.query(async () => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getVehiclesByDatabase(activeDb.id);
    }),
    getById: protectedProcedure2.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      const activeDb = await getActiveDatabase();
      const vehicle = await getVehicleById(input.id);
      return activeDb && vehicle?.databaseId === activeDb.id ? vehicle : null;
    }),
    create: protectedProcedure2.input(
      z2.object({
        clientId: z2.number().int().positive().optional(),
        vehicleType: z2.enum(["CARRO", "MOTO", "OUTRO"]).optional(),
        brand: z2.string().trim().optional(),
        model: z2.string().trim().min(1, "Informe o modelo do ve\xEDculo."),
        year: z2.coerce.number().int().min(1900).max(2200).optional(),
        color: z2.string().optional(),
        plate: z2.string().optional(),
        renavam: z2.string().optional(),
        chassi: z2.string().optional(),
        mileage: z2.coerce.number().int().nonnegative().optional(),
        purchasePrice: z2.coerce.number().nonnegative().default(0),
        expenses: z2.coerce.number().nonnegative().default(0),
        salePrice: z2.coerce.number().nonnegative().optional(),
        purchaseDate: z2.string().optional(),
        price: z2.string().optional(),
        description: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      }
      if (!ctx.user.canInsert) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir dados"
        });
      }
      if (input.clientId !== void 0) {
        const client = await getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Cliente inv\xE1lido para o banco ativo."
          });
      }
      const purchasePrice = input.purchasePrice.toFixed(2);
      const vehicleData = {
        ...input,
        clientId: input.clientId ?? null,
        vehicleType: input.vehicleType ?? "OUTRO",
        brand: input.brand || null,
        year: input.year ?? null,
        purchasePrice,
        expenses: input.expenses.toFixed(2),
        salePrice: input.salePrice?.toFixed(2),
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
        price: input.price ?? input.salePrice?.toFixed(2) ?? "0.00",
        databaseId: activeDb.id,
        createdBy: ctx.user.id
      };
      const { result } = await createVehicleBundle(
        vehicleData,
        input.purchasePrice > 0 ? {
          databaseId: activeDb.id,
          type: "SAIDA",
          category: "COMPRA_VEICULO",
          description: `Compra de ve\xEDculo: ${input.model}`,
          amount: purchasePrice,
          movementDate: input.purchaseDate ? new Date(input.purchaseDate) : /* @__PURE__ */ new Date(),
          createdBy: ctx.user.id
        } : void 0
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_vehicle",
        entity: "vehicles",
        databaseId: activeDb.id,
        details: `Ve\xEDculo criado: ${input.brand} ${input.model}`,
        status: "success"
      });
      return result;
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number().int().positive(),
        clientId: z2.number().int().positive().optional().nullable(),
        vehicleType: z2.enum(["CARRO", "MOTO", "OUTRO"]).optional(),
        brand: z2.string().trim().optional().nullable(),
        model: z2.string().trim().min(1).optional(),
        year: z2.coerce.number().int().min(1900).max(2200).optional().nullable(),
        color: z2.string().optional().nullable(),
        plate: z2.string().optional().nullable(),
        renavam: z2.string().optional().nullable(),
        chassi: z2.string().optional().nullable(),
        mileage: z2.coerce.number().int().nonnegative().optional().nullable(),
        purchasePrice: z2.coerce.number().nonnegative().optional(),
        expenses: z2.coerce.number().nonnegative().optional(),
        salePrice: z2.coerce.number().nonnegative().optional().nullable(),
        status: z2.enum(["disponivel", "vendido", "reservado", "indisponivel"]).optional(),
        price: z2.string().optional(),
        description: z2.string().optional().nullable()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar dados"
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      const currentVehicle = await getVehicleById(input.id);
      if (!currentVehicle || currentVehicle.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Ve\xEDculo n\xE3o encontrado no banco ativo."
        });
      if (input.clientId !== void 0 && input.clientId !== null) {
        const client = await getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Cliente inv\xE1lido para o banco ativo."
          });
      }
      const { id, ...data } = input;
      const normalizedData = {
        ...data,
        purchasePrice: data.purchasePrice === void 0 ? void 0 : data.purchasePrice.toFixed(2),
        expenses: data.expenses === void 0 ? void 0 : data.expenses.toFixed(2),
        salePrice: data.salePrice === void 0 ? void 0 : data.salePrice === null ? null : data.salePrice.toFixed(2)
      };
      await updateVehicleInDatabase(id, normalizedData, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_vehicle",
        entity: "vehicles",
        entityId: id,
        databaseId: activeDb?.id,
        details: JSON.stringify(data),
        status: "success"
      });
      return { success: true };
    }),
    delete: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canDelete) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para deletar dados"
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      const currentVehicle = await getVehicleById(input.id);
      if (!currentVehicle || currentVehicle.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Ve\xEDculo n\xE3o encontrado no banco ativo."
        });
      await deleteVehicleInDatabase(input.id, activeDb.id);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "delete_vehicle",
        entity: "vehicles",
        entityId: input.id,
        databaseId: activeDb?.id,
        details: "Ve\xEDculo deletado",
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== VEHICLE SALES ====================
  vehicleSales: router({
    list: protectedProcedure2.query(async ({ ctx }) => {
      if (!ctx.user.canView)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar vendas."
        });
      const activeDb = await getActiveDatabase();
      return activeDb ? getVehicleSalesByDatabase(activeDb.id) : [];
    }),
    create: protectedProcedure2.input(
      z2.object({
        vehicleId: z2.number().int().positive(),
        clientId: z2.number().int().positive().optional(),
        saleAmount: z2.coerce.number().positive(),
        receivedAmount: z2.coerce.number().min(0).default(0),
        paymentMethod: z2.enum([
          "DINHEIRO",
          "PIX",
          "TRANSFERENCIA",
          "CARTAO",
          "FINANCIAMENTO",
          "OUTRO"
        ]).optional(),
        saleDate: z2.string(),
        notes: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para registrar vendas."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const saleDate = new Date(input.saleDate);
      if (Number.isNaN(saleDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Data da venda inv\xE1lida."
        });
      if (input.clientId !== void 0) {
        const client = await getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id)
          throw new TRPCError3({
            code: "BAD_REQUEST",
            message: "Cliente inv\xE1lido para o banco ativo."
          });
      }
      const receivedAmount = Math.min(input.receivedAmount, input.saleAmount);
      const data = {
        databaseId: activeDb.id,
        vehicleId: input.vehicleId,
        clientId: input.clientId ?? null,
        saleAmount: input.saleAmount.toFixed(2),
        receivedAmount: receivedAmount.toFixed(2),
        receivableBalance: (input.saleAmount - receivedAmount).toFixed(2),
        paymentMethod: input.paymentMethod,
        saleDate,
        notes: input.notes,
        createdBy: ctx.user.id
      };
      const result = await createVehicleSaleBundle(
        data,
        input.vehicleId,
        activeDb.id,
        {
          databaseId: activeDb.id,
          type: "ENTRADA",
          category: "VENDA_VEICULO",
          description: `Venda de ve\xEDculo #${input.vehicleId}`,
          amount: receivedAmount.toFixed(2),
          movementDate: saleDate,
          clientId: input.clientId ?? null,
          createdBy: ctx.user.id
        }
      );
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_vehicle_sale",
        entity: "vehicle_sales",
        entityId: result.saleId,
        databaseId: activeDb.id,
        details: JSON.stringify(input),
        status: "success"
      });
      return result;
    }),
    receive: protectedProcedure2.input(
      z2.object({
        saleId: z2.number().int().positive(),
        amount: z2.coerce.number().positive(),
        movementDate: z2.string()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert)
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para registrar recebimentos."
        });
      const activeDb = await getActiveDatabase();
      if (!activeDb)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo."
        });
      const movementDate = new Date(input.movementDate);
      if (Number.isNaN(movementDate.getTime()))
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Data do recebimento inv\xE1lida."
        });
      const result = await receiveVehicleSaleBundle(
        input.saleId,
        activeDb.id,
        input.amount.toFixed(2),
        movementDate,
        ctx.user.id
      );
      return { success: true, ...result };
    })
  }),
  // ==================== VEHICLE FINANCINGS ====================
  vehicleFinancings: router({
    list: protectedProcedure2.query(async () => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) return [];
      return await getVehicleFinancingsByDatabase(activeDb.id);
    }),
    getById: protectedProcedure2.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      const activeDb = await getActiveDatabase();
      const financing = await getVehicleFinancingById(input.id);
      if (!activeDb || !financing || financing.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Financiamento n\xE3o encontrado no banco ativo."
        });
      }
      return financing;
    }),
    details: protectedProcedure2.input(z2.object({ id: z2.number().int().positive() })).query(async ({ input }) => {
      const activeDb = await getActiveDatabase();
      const financing = await getVehicleFinancingById(input.id);
      if (!activeDb || !financing || financing.databaseId !== activeDb.id)
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Financiamento n\xE3o encontrado no banco ativo."
        });
      const [client, vehicle, payments2] = await Promise.all([
        getClientById(financing.clientId),
        getVehicleById(financing.vehicleId),
        getPaymentsByFinancing(financing.id, activeDb.id)
      ]);
      const paid = payments2.filter((payment) => payment.status === "pago");
      const totalPaid = roundMoney(
        paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      );
      return {
        financing,
        client,
        vehicle,
        payments: payments2,
        totalPaid,
        remainingBalance: roundMoney(
          Math.max(0, Number(financing.totalAmount) - totalPaid)
        )
      };
    }),
    create: protectedProcedure2.input(
      z2.object({
        vehicleId: z2.number().int().positive(),
        clientId: z2.number().int().positive(),
        vehiclePrice: positiveDecimal("Pre\xE7o do ve\xEDculo"),
        downPayment: nonNegativeDecimal("Entrada"),
        interestRate: nonNegativeDecimal("Taxa de juros"),
        installments: z2.number().int().positive(),
        startDate: validDate("Data inicial"),
        notes: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Nenhum banco de dados ativo"
        });
      }
      if (!ctx.user.canInsert) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para inserir dados"
        });
      }
      const [client, vehicle] = await Promise.all([
        getClientById(input.clientId),
        getVehicleById(input.vehicleId)
      ]);
      if (!client || client.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Cliente inv\xE1lido para o banco ativo."
        });
      }
      if (!vehicle || vehicle.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Ve\xEDculo inv\xE1lido para o banco ativo."
        });
      }
      const startDate = new Date(input.startDate);
      const vehiclePrice = Number(input.vehiclePrice);
      const downPayment = Number(input.downPayment);
      if (downPayment >= vehiclePrice) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "A entrada n\xE3o pode ser maior que o pre\xE7o do ve\xEDculo."
        });
      }
      const financedAmount = roundMoney(vehiclePrice - downPayment);
      const plan = calculateLoanPlan({
        principal: financedAmount,
        ratePercent: Number(input.interestRate),
        periods: input.installments,
        interestType: "simple",
        ratePeriod: "month"
      });
      const endDate = addPeriods(startDate, input.installments, "month");
      const result = await createVehicleFinancing({
        ...input,
        vehiclePrice: vehiclePrice.toFixed(2),
        downPayment: downPayment.toFixed(2),
        financedAmount: financedAmount.toFixed(2),
        totalAmount: plan.totalAmount.toFixed(2),
        installmentAmount: plan.installmentAmount.toFixed(2),
        startDate,
        endDate,
        databaseId: activeDb.id,
        createdBy: ctx.user.id
      });
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "create_vehicle_financing",
        entity: "vehicleFinancings",
        databaseId: activeDb.id,
        details: `Financiamento criado: principal R$ ${financedAmount.toFixed(2)}, total R$ ${plan.totalAmount.toFixed(2)}`,
        status: "success"
      });
      return {
        ...result,
        financedAmount,
        totalAmount: plan.totalAmount,
        installmentAmount: plan.installmentAmount,
        endDate
      };
    }),
    update: protectedProcedure2.input(
      z2.object({
        id: z2.number(),
        vehiclePrice: positiveDecimal("Pre\xE7o do ve\xEDculo").optional(),
        downPayment: nonNegativeDecimal("Entrada").optional(),
        interestRate: nonNegativeDecimal("Taxa de juros").optional(),
        installments: z2.coerce.number().int().positive().optional(),
        startDate: validDate("Data inicial").optional(),
        status: z2.enum(["ativo", "pago", "atrasado", "cancelado"]).optional(),
        notes: z2.string().optional()
      })
    ).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canEdit) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para editar dados"
        });
      }
      const activeDb = await getActiveDatabase();
      const financing = await getVehicleFinancingById(input.id);
      if (!activeDb || !financing || financing.databaseId !== activeDb.id) {
        throw new TRPCError3({
          code: "NOT_FOUND",
          message: "Financiamento n\xE3o encontrado no banco ativo."
        });
      }
      const { id } = input;
      const vehiclePrice = input.vehiclePrice === void 0 ? Number(financing.vehiclePrice) : Number(input.vehiclePrice);
      const downPayment = input.downPayment === void 0 ? Number(financing.downPayment) : Number(input.downPayment);
      if (downPayment >= vehiclePrice)
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "A entrada deve ser menor que o pre\xE7o do ve\xEDculo."
        });
      const interestRate = input.interestRate === void 0 ? Number(financing.interestRate) : Number(input.interestRate);
      const installments = input.installments ?? financing.installments;
      const startDate = input.startDate ? new Date(input.startDate) : financing.startDate;
      const financedAmount = roundMoney(vehiclePrice - downPayment);
      const plan = calculateLoanPlan({
        principal: financedAmount,
        ratePercent: interestRate,
        periods: installments,
        interestType: "simple",
        ratePeriod: "month"
      });
      const data = {
        vehiclePrice: vehiclePrice.toFixed(2),
        downPayment: downPayment.toFixed(2),
        financedAmount: financedAmount.toFixed(2),
        interestRate: interestRate.toFixed(2),
        installments,
        installmentAmount: plan.installmentAmount.toFixed(2),
        totalAmount: plan.totalAmount.toFixed(2),
        startDate,
        endDate: addPeriods(startDate, installments, "month"),
        ...input.status !== void 0 ? { status: input.status } : {},
        ...input.notes !== void 0 ? { notes: input.notes } : {}
      };
      await updateVehicleFinancing(id, data);
      await createAuditLog({
        userId: ctx.user.id,
        username: ctx.user.name || ctx.user.email || "Usu\xE1rio",
        action: "update_vehicle_financing",
        entity: "vehicleFinancings",
        entityId: id,
        databaseId: activeDb?.id,
        details: JSON.stringify(data),
        status: "success"
      });
      return { success: true };
    })
  }),
  // ==================== AUDIT LOGS ====================
  auditLogs: router({
    list: adminProcedure2.input(z2.object({ limit: z2.number().optional() })).query(async ({ input }) => {
      return await getAuditLogs(input.limit);
    }),
    byUser: adminProcedure2.input(z2.object({ userId: z2.number(), limit: z2.number().optional() })).query(async ({ input }) => {
      return await getAuditLogsByUser(input.userId, input.limit);
    }),
    byDatabase: adminProcedure2.input(z2.object({ databaseId: z2.number(), limit: z2.number().optional() })).query(async ({ input }) => {
      return await getAuditLogsByDatabase(input.databaseId, input.limit);
    })
  }),
  // ==================== DASHBOARD ====================
  dashboard: router({
    stats: protectedProcedure2.query(async () => {
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        return {
          activeLoans: { count: 0, total: 0 },
          paidLoans: { count: 0, total: 0 },
          pendingPayments: { count: 0, total: 0 },
          totalClients: 0,
          totalEntradas: 0,
          totalSaidas: 0,
          saldoCaixa: 0,
          vehicleProfit: 0,
          vehicleExpenses: 0,
          vehicleSalesCount: 0,
          collections: { dueToday: [], overdue: [] },
          vehicleMetrics: {
            carsSold: 0,
            financings: 0,
            installmentsPaid: 0,
            installmentsOverdue: 0,
            totalContracts: 0,
            totalPaid: 0
          },
          loanMetrics: {
            totalLent: 0,
            totalReceived: 0,
            totalInterestReceived: 0,
            totalPrincipalAmortized: 0,
            totalOpen: 0,
            totalInterestOpen: 0,
            overdueCount: 0,
            totalOverdue: 0,
            totalVehiclePurchases: 0,
            totalVehicleSales: 0
          }
        };
      }
      return await getDashboardStats(activeDb.id);
    }),
    agentPerformance: protectedProcedure2.input(
      z2.object({
        startDate: z2.string().optional(),
        endDate: z2.string().optional()
      }).optional()
    ).query(async ({ input, ctx }) => {
      if (!ctx.user.canView) {
        throw new TRPCError3({
          code: "FORBIDDEN",
          message: "Voc\xEA n\xE3o tem permiss\xE3o para visualizar performance."
        });
      }
      const activeDb = await getActiveDatabase();
      if (!activeDb) {
        return {
          kpis: {
            totalAgents: 0,
            activeAgents: 0,
            totalPayments: 0,
            totalPaymentVolume: 0,
            totalCommissions: 0,
            bestAgent: null
          },
          ranking: [],
          evolution: []
        };
      }
      return await getAgentPerformance(
        activeDb.id,
        input?.startDate ? new Date(input.startDate) : void 0,
        input?.endDate ? new Date(input.endDate) : void 0
      );
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret2 = ENV.cookieSecret;
    return new TextEncoder().encode(secret2);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    if (sessionCookie) {
      const localSession = await getLocalSession(sessionCookie);
      if (localSession) {
        const localUser = await getUserById(localSession.userId);
        if (!localUser) {
          throw ForbiddenError("Usu\xE1rio da sess\xE3o local n\xE3o encontrado");
        }
        if (localUser.username === "Draco") {
          const protectedUser = await ensureDracoIntegrity();
          if (protectedUser) return protectedUser;
        }
        if (!localUser.isActive) {
          throw ForbiddenError("Usu\xE1rio desativado");
        }
        return localUser;
      }
    }
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/bootstrap-schema.ts
import { neon } from "@neondatabase/serverless";
var bootstrapPromise = null;
function ensurePreviewBusinessSchema() {
  if (process.env.VERCEL_ENV !== "preview" || !process.env.DATABASE_URL) return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const sql2 = neon(process.env.DATABASE_URL);
    await sql2`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboardOnly" boolean DEFAULT false NOT NULL`;
    await sql2`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer DEFAULT 0 NOT NULL`;
    await sql2`CREATE TABLE IF NOT EXISTS "databases" ("id" serial PRIMARY KEY, "name" varchar(255) NOT NULL UNIQUE, "description" text, "type" varchar(64) NOT NULL, "isActive" boolean DEFAULT false NOT NULL, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "user_database_access" ("id" serial PRIMARY KEY, "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "databaseId" integer NOT NULL REFERENCES "databases"("id") ON DELETE CASCADE, "isActive" boolean DEFAULT false NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE UNIQUE INDEX IF NOT EXISTS "user_database_access_user_database_unique" ON "user_database_access" ("userId", "databaseId")`;
    await sql2`CREATE TABLE IF NOT EXISTS "agents" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "name" varchar(255) NOT NULL, "defaultCommissionPercentage" numeric(5,2) DEFAULT '0.00' NOT NULL, "status" varchar(64) DEFAULT 'ACTIVE' NOT NULL, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "clients" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "name" varchar(255) NOT NULL, "cpf" varchar(14), "birthDate" timestamp, "email" varchar(320), "phone" varchar(20), "whatsapp" varchar(20), "profession" varchar(120), "indicatorAgentId" integer, "address" text, "residentialAddress" jsonb, "commercialAddress" jsonb, "city" varchar(100), "state" varchar(2), "zipCode" varchar(10), "notes" text, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "loans" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "clientId" integer NOT NULL, "amount" numeric(15,2) NOT NULL, "interestType" varchar(64) DEFAULT 'simple' NOT NULL, "interestRate" numeric(8,4) NOT NULL, "ratePeriod" varchar(64) DEFAULT 'month' NOT NULL, "installments" integer NOT NULL, "installmentAmount" numeric(15,2) NOT NULL, "totalAmount" numeric(15,2) NOT NULL, "remainingBalance" numeric(15,2) DEFAULT '0.00' NOT NULL, "principalBalance" numeric(15,2) DEFAULT '0.00' NOT NULL, "accruedInterest" numeric(15,2) DEFAULT '0.00' NOT NULL, "totalPaid" numeric(15,2) DEFAULT '0.00' NOT NULL, "lastInterestPeriod" varchar(20), "startDate" timestamp NOT NULL, "endDate" timestamp NOT NULL, "status" varchar(64) DEFAULT 'ativo' NOT NULL, "description" text, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "vehicles" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "clientId" integer, "vehicleType" varchar(64) DEFAULT 'OUTRO' NOT NULL, "brand" varchar(100), "model" varchar(100) NOT NULL, "year" integer, "color" varchar(50), "plate" varchar(20), "renavam" varchar(30), "chassi" varchar(50), "mileage" integer, "purchasePrice" numeric(15,2) DEFAULT '0.00' NOT NULL, "expenses" numeric(15,2) DEFAULT '0.00' NOT NULL, "salePrice" numeric(15,2), "purchaseDate" timestamp, "stockEntryDate" timestamp DEFAULT now() NOT NULL, "price" numeric(15,2) DEFAULT '0.00' NOT NULL, "status" varchar(64) DEFAULT 'disponivel' NOT NULL, "description" text, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "vehicleFinancings" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "vehicleId" integer NOT NULL, "clientId" integer NOT NULL, "vehiclePrice" numeric(15,2) NOT NULL, "downPayment" numeric(15,2) NOT NULL, "financedAmount" numeric(15,2) NOT NULL, "interestRate" numeric(5,2) NOT NULL, "installments" integer NOT NULL, "installmentAmount" numeric(15,2) NOT NULL, "totalAmount" numeric(15,2) NOT NULL, "startDate" timestamp NOT NULL, "endDate" timestamp NOT NULL, "status" varchar(64) DEFAULT 'ativo' NOT NULL, "notes" text, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "loan_interest_history" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "loanId" integer NOT NULL, "periodReference" varchar(20) NOT NULL, "previousPrincipalBalance" numeric(15,2) NOT NULL, "interestGenerated" numeric(15,2) NOT NULL, "paymentAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "interestPaid" numeric(15,2) DEFAULT '0.00' NOT NULL, "principalAmortized" numeric(15,2) DEFAULT '0.00' NOT NULL, "updatedPrincipalBalance" numeric(15,2) NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE UNIQUE INDEX IF NOT EXISTS "loan_interest_history_loan_period_unique" ON "loan_interest_history" ("loanId", "periodReference")`;
    await sql2`CREATE TABLE IF NOT EXISTS "payments" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "loanId" integer, "vehicleFinancingId" integer, "installmentNumber" integer NOT NULL, "amount" numeric(15,2) NOT NULL, "paymentDate" timestamp NOT NULL, "dueDate" timestamp NOT NULL, "status" varchar(64) DEFAULT 'pendente' NOT NULL, "lateFee" numeric(15,2) DEFAULT '0.00', "interest" numeric(15,2) DEFAULT '0.00', "principalAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "interestAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "remainingBalance" numeric(15,2) DEFAULT '0.00' NOT NULL, "notes" text, "agentId" integer, "commissionPercentage" numeric(5,2) DEFAULT '0.00' NOT NULL, "commissionAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "netAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "vehicle_sales" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "vehicleId" integer NOT NULL, "clientId" integer, "saleAmount" numeric(15,2) NOT NULL, "receivedAmount" numeric(15,2) DEFAULT '0.00' NOT NULL, "receivableBalance" numeric(15,2) DEFAULT '0.00' NOT NULL, "paymentMethod" varchar(30), "saleDate" timestamp NOT NULL, "notes" text, "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE TABLE IF NOT EXISTS "cash_flow" ("id" serial PRIMARY KEY, "databaseId" integer NOT NULL, "type" varchar(64) NOT NULL, "category" varchar(120) NOT NULL, "description" text NOT NULL, "amount" numeric(15,2) NOT NULL, "movementDate" timestamp NOT NULL, "clientId" integer, "loanId" integer, "vehicleId" integer, "vehicleSaleId" integer, "paymentId" integer, "responsible" varchar(255), "notes" text, "sourceKey" varchar(180), "createdBy" integer NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`CREATE UNIQUE INDEX IF NOT EXISTS "cash_flow_source_key_unique" ON "cash_flow" ("sourceKey")`;
    await sql2`CREATE TABLE IF NOT EXISTS "auditLogs" ("id" serial PRIMARY KEY, "userId" integer, "username" varchar(255), "action" varchar(100) NOT NULL, "entity" varchar(100), "entityId" integer, "databaseId" integer, "details" text, "ipAddress" varchar(45), "userAgent" text, "status" varchar(64) DEFAULT 'success' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL)`;
    await sql2`INSERT INTO "databases" ("name", "description", "type", "isActive", "createdBy") SELECT 'Principal', 'Banco operacional principal', 'novo', true, u."id" FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "databases") ORDER BY CASE WHEN lower(coalesce(u."role", '')) = 'super_admin' THEN 0 ELSE 1 END, u."id" LIMIT 1`;
    console.info("[Database] Preview operational schema is ready");
  })().catch((error) => {
    bootstrapPromise = null;
    console.error("[Database] Preview schema bootstrap failed", error);
    throw error;
  });
  return bootstrapPromise;
}

// server/_core/context.ts
async function createContext(opts) {
  await ensurePreviewBusinessSchema();
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/vercel-trpc.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      const cause = error.cause;
      console.error("[tRPC] Request failed", {
        path,
        type,
        code: error.code,
        message: error.message,
        cause: cause instanceof Error ? { name: cause.name, message: cause.message, stack: cause.stack } : cause,
        stack: error.stack
      });
    }
  })
);
var vercel_trpc_default = app;
export {
  vercel_trpc_default as default
};
