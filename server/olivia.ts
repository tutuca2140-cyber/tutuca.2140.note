import * as db from "./db";
import type { Database, User } from "../drizzle/schema";

export type OliviaConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const digits = (value: string | null | undefined) =>
  String(value ?? "").replace(/\D/g, "");

const ignoredSearchWords = new Set([
  "cliente",
  "clientes",
  "contrato",
  "contratos",
  "parcela",
  "parcelas",
  "pagamento",
  "pagamentos",
  "historico",
  "mostrar",
  "mostre",
  "localizar",
  "procurar",
  "buscar",
  "quero",
  "preciso",
  "qual",
  "quais",
  "como",
  "para",
  "pelo",
  "pela",
  "telefone",
]);

export function clientMatchesPrompt(
  client: {
    name: string;
    phone: string | null;
    whatsapp: string | null;
    cpf: string | null;
  },
  prompt: string
) {
  const normalizedPrompt = normalize(prompt);
  const promptDigits = digits(prompt);
  const identifyingDigits = [client.phone, client.whatsapp, client.cpf]
    .map(digits)
    .filter(Boolean);

  if (
    promptDigits.length >= 6 &&
    identifyingDigits.some(
      value => value.includes(promptDigits) || promptDigits.includes(value)
    )
  ) {
    return true;
  }

  const normalizedName = normalize(client.name).trim();
  if (normalizedName.length >= 3 && normalizedPrompt.includes(normalizedName)) {
    return true;
  }

  const searchWords = normalizedPrompt
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3 && !ignoredSearchWords.has(word));
  const nameWords = normalizedName
    .split(/\s+/)
    .filter(word => word.length >= 3);
  return searchWords.some(word =>
    nameWords.some(
      nameWord => nameWord.startsWith(word) || word.startsWith(nameWord)
    )
  );
}

function sanitizeProfile(
  profile: Awaited<ReturnType<typeof db.getClientProfile>>
) {
  if (!profile) return undefined;
  return {
    client: {
      id: profile.client.id,
      name: profile.client.name,
      phone: profile.client.phone,
      whatsapp: profile.client.whatsapp,
      profession: profile.client.profession,
      city: profile.client.city,
      state: profile.client.state,
    },
    contracts: {
      loans: profile.loans.map(loan => ({
        id: loan.id,
        amount: loan.amount,
        interestType: loan.interestType,
        interestRate: loan.interestRate,
        ratePeriod: loan.ratePeriod,
        installments: loan.installments,
        installmentAmount: loan.installmentAmount,
        totalAmount: loan.totalAmount,
        remainingBalance: loan.remainingBalance,
        totalPaid: loan.totalPaid,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        description: loan.description,
      })),
      financings: profile.financings.map(financing => ({
        id: financing.id,
        assetType: financing.assetType,
        vehiclePrice: financing.vehiclePrice,
        downPayment: financing.downPayment,
        financedAmount: financing.financedAmount,
        interestRate: financing.interestRate,
        installments: financing.installments,
        installmentAmount: financing.installmentAmount,
        totalAmount: financing.totalAmount,
        startDate: financing.startDate,
        endDate: financing.endDate,
        status: financing.status,
      })),
    },
    payments: profile.payments.slice(0, 60).map(payment => ({
      id: payment.id,
      loanId: payment.loanId,
      vehicleFinancingId: payment.vehicleFinancingId,
      installmentNumber: payment.installmentNumber,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      dueDate: payment.dueDate,
      status: payment.status,
      lateFee: payment.lateFee,
      interest: payment.interest,
      remainingBalance: payment.remainingBalance,
    })),
    totals: profile.financialHistory,
  };
}

async function buildScopedContext(prompt: string, database: Database) {
  const [clients, payments, loans, financings] = await Promise.all([
    db.getClientsByDatabase(database.id),
    db.getPaymentsByDatabase(database.id),
    db.getLoansByDatabase(database.id),
    db.getVehicleFinancingsByDatabase(database.id),
  ]);
  const matchedClients = clients
    .filter(client => clientMatchesPrompt(client, prompt))
    .slice(0, 5);
  const profiles = (
    await Promise.all(
      matchedClients.map(client => db.getClientProfile(client.id, database.id))
    )
  )
    .map(sanitizeProfile)
    .filter(Boolean);

  const now = new Date();
  const nextThirtyDays = new Date(now);
  nextThirtyDays.setDate(nextThirtyDays.getDate() + 30);
  const pendingPayments = payments
    .filter(payment => payment.status !== "pago")
    .sort(
      (left, right) =>
        new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()
    );
  const clientNames = new Map(clients.map(client => [client.id, client.name]));
  const loanClients = new Map(loans.map(loan => [loan.id, loan.clientId]));
  const financingClients = new Map(
    financings.map(financing => [financing.id, financing.clientId])
  );
  const sanitizeInstallment = (payment: (typeof payments)[number]) => {
    const clientId = payment.loanId
      ? loanClients.get(payment.loanId)
      : payment.vehicleFinancingId
        ? financingClients.get(payment.vehicleFinancingId)
        : undefined;
    return {
      id: payment.id,
      contractType: payment.loanId ? "loan" : "financing",
      contractId: payment.loanId ?? payment.vehicleFinancingId,
      clientName: clientId ? clientNames.get(clientId) : undefined,
      installmentNumber: payment.installmentNumber,
      amount: payment.amount,
      dueDate: payment.dueDate,
      status: payment.status,
      lateFee: payment.lateFee,
      interest: payment.interest,
    };
  };

  return {
    generatedAt: now.toISOString(),
    database: { id: database.id, name: database.name },
    matchedClients: profiles,
    clientDirectory: clients.slice(0, 50).map(client => ({
      id: client.id,
      name: client.name,
    })),
    installments: {
      overdue: pendingPayments
        .filter(payment => new Date(payment.dueDate) < now)
        .slice(0, 50)
        .map(sanitizeInstallment),
      nextThirtyDays: pendingPayments
        .filter(payment => {
          const dueDate = new Date(payment.dueDate);
          return dueDate >= now && dueDate <= nextThirtyDays;
        })
        .slice(0, 50)
        .map(sanitizeInstallment),
    },
    limits: {
      matchedClients: 5,
      directoryClients: 50,
      paymentsPerSection: 50,
    },
  };
}

function validateWebhookUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("O webhook da Olivia deve usar HTTPS.");
  }
  return url.toString();
}

export async function askOlivia(input: {
  prompt: string;
  messages: OliviaConversationMessage[];
  user: User;
  database: Database;
}) {
  const webhookUrl = process.env.N8N_OLIVIA_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_OLIVIA_SECRET;
  if (!webhookUrl || !webhookSecret) {
    throw new Error(
      "A Olivia ainda não está conectada ao n8n. Configure N8N_OLIVIA_WEBHOOK_URL e N8N_OLIVIA_SECRET."
    );
  }

  const context = await buildScopedContext(input.prompt, input.database);
  const response = await fetch(validateWebhookUrl(webhookUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-olivia-secret": webhookSecret,
    },
    body: JSON.stringify({
      message: input.prompt,
      history: input.messages.slice(-10).map(message => ({
        role: message.role,
        content: message.content.slice(0, 2_000),
      })),
      requester: {
        id: input.user.id,
        name: input.user.name || input.user.username || "Usuário",
      },
      context,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`O n8n respondeu com erro (${response.status}).`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const answer = [payload.output, payload.answer, payload.response].find(
    value => typeof value === "string"
  );
  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("O n8n não retornou uma resposta válida para a Olivia.");
  }

  return {
    answer: answer.trim().slice(0, 12_000),
    database: { id: input.database.id, name: input.database.name },
  };
}
