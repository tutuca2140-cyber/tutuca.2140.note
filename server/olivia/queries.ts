import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { assertOliviaActionAllowed, type OliviaUserContext } from "./authorization";

const stripLegacyCpf = <T extends { cpf?: unknown }>(client: T): Omit<T, "cpf"> => {
  const { cpf: _cpf, ...safeClient } = client;
  return safeClient;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

async function activeDatabaseOrThrow() {
  const activeDb = await db.getActiveDatabase();
  if (!activeDb) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum banco de dados ativo para a Olivia consultar." });
  }
  return activeDb;
}

async function auditConsultation(
  user: OliviaUserContext,
  databaseId: number,
  action: string,
  details: Record<string, unknown>,
) {
  await db.createAuditLog({
    userId: user.id,
    username: user.name || user.username || "Usuário",
    action,
    entity: "olivia",
    databaseId,
    details: JSON.stringify(details),
    status: "success",
  });
}

/**
 * Localiza clientes no banco ativo. CPF pode ser usado apenas como critério
 * interno de busca; ele não é devolvido na resposta da Olivia.
 */
export async function searchClientsForOlivia(user: OliviaUserContext, rawQuery: string) {
  assertOliviaActionAllowed(user, "view");
  const activeDb = await activeDatabaseOrThrow();
  const query = normalize(rawQuery);
  const queryDigits = digitsOnly(rawQuery);
  if (!query) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe nome, telefone ou CPF para localizar o cliente." });

  const clients = await db.getClientsByDatabase(activeDb.id);
  const matches = clients.filter((client) => {
    const textMatch = normalize(client.name).includes(query)
      || normalize(client.phone).includes(query)
      || normalize(client.whatsapp).includes(query);
    const digitMatch = queryDigits.length >= 3 && [client.phone, client.whatsapp, client.cpf]
      .some((value) => digitsOnly(value).includes(queryDigits));
    return textMatch || digitMatch;
  });

  await auditConsultation(user, activeDb.id, "olivia_search_clients", {
    queryType: queryDigits.length >= 3 ? "name_phone_or_cpf" : "name",
    results: matches.length,
  });

  return matches.slice(0, 20).map(stripLegacyCpf);
}

export async function getClientSummaryForOlivia(user: OliviaUserContext, clientId: number) {
  assertOliviaActionAllowed(user, "view");
  const activeDb = await activeDatabaseOrThrow();
  const profile = await db.getClientProfile(clientId, activeDb.id);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado no banco ativo." });

  await auditConsultation(user, activeDb.id, "olivia_client_summary", { clientId });
  return { ...profile, client: stripLegacyCpf(profile.client) };
}

function saoPauloDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function dateOrdinal(date: Date) {
  const { year, month, day } = saoPauloDateParts(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export type OliviaDuePeriod = "today" | "week" | "month" | "overdue";

/** Vencimentos sempre são calculados no fuso America/Sao_Paulo. */
export async function getDuePaymentsForOlivia(user: OliviaUserContext, period: OliviaDuePeriod, now = new Date()) {
  assertOliviaActionAllowed(user, "view");
  const activeDb = await activeDatabaseOrThrow();
  const payments = await db.getPaymentsByDatabase(activeDb.id);
  const today = dateOrdinal(now);
  const currentParts = saoPauloDateParts(now);

  const result = payments.filter((payment) => {
    if (payment.status === "pago") return false;
    const due = new Date(payment.dueDate);
    const dueOrdinal = dateOrdinal(due);
    const dueParts = saoPauloDateParts(due);
    if (period === "today") return dueOrdinal === today;
    if (period === "week") return dueOrdinal >= today && dueOrdinal <= today + 7;
    if (period === "month") return dueParts.year === currentParts.year && dueParts.month === currentParts.month;
    return dueOrdinal < today;
  });

  await auditConsultation(user, activeDb.id, "olivia_due_payments", { period, results: result.length });
  return result;
}

export async function getFinancialSummaryForOlivia(user: OliviaUserContext) {
  assertOliviaActionAllowed(user, "report");
  const activeDb = await activeDatabaseOrThrow();
  const stats = await db.getDashboardStats(activeDb.id);
  await auditConsultation(user, activeDb.id, "olivia_financial_summary", {});
  return stats;
}
