import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMock = vi.hoisted(() => ({
  withUserDatabaseScope: vi.fn((_user, operation) => operation()),
  getActiveDatabase: vi.fn(),
  getClientById: vi.fn(),
  getVehicleById: vi.fn(),
  getVehicleFinancingById: vi.fn(),
  getPaymentsByFinancing: vi.fn(),
  paymentAlreadyRegistered: vi.fn(),
  createPaymentBundle: vi.fn(),
  createAgent: vi.fn(),
  createVehicleFinancing: vi.fn(),
  createLoanBundle: vi.fn(),
  getLoanById: vi.fn(),
  deleteLoanSafely: vi.fn(),
  deleteManualCashFlowEntry: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserByEmail: vi.fn(),
  createLocalUser: vi.fn(),
  assignUserDatabases: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("./db", () => dbMock);

import { appRouter } from "./routers";

const context = {
  user: {
    id: 1,
    openId: "save-flow-test",
    username: "Tester",
    passwordHash: null,
    name: "Tester",
    email: "tester@example.com",
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
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
} as unknown as TrpcContext;

describe("fluxos de gravação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getActiveDatabase.mockResolvedValue({ id: 7, name: "Principal" });
    dbMock.getClientById.mockResolvedValue({ id: 11, databaseId: 7, name: "Cliente" });
    dbMock.getVehicleById.mockResolvedValue({ id: 13, databaseId: 7, model: "Veículo" });
    dbMock.getVehicleFinancingById.mockResolvedValue({ id: 19, databaseId: 7, clientId: 11, financedAmount: "10000.00", totalAmount: "12400.00", installmentAmount: "1033.33", interestRate: "2.00", installments: 12, startDate: new Date("2026-08-25T12:00:00.000Z"), endDate: new Date("2027-08-25T12:00:00.000Z"), status: "ativo" });
    dbMock.getPaymentsByFinancing.mockResolvedValue([]);
    dbMock.paymentAlreadyRegistered.mockResolvedValue(false);
    dbMock.createPaymentBundle.mockResolvedValue({ id: 29 });
    dbMock.createAuditLog.mockResolvedValue(undefined);
    dbMock.getLoanById.mockResolvedValue({ id: 23, databaseId: 7, clientId: 11, amount: "1000.00", status: "ativo" });
    dbMock.deleteLoanSafely.mockResolvedValue({ deleted: false, cancelled: true, relations: { payments: 1, interestHistory: 1, cashMovements: 1 } });
  });

  it("normaliza e salva um agente", async () => {
    dbMock.createAgent.mockResolvedValue({ id: 17, name: "Agente" });
    const result = await appRouter.createCaller(context).agents.create({
      name: "  Agente  ",
      defaultCommissionPercentage: 2.5,
    });
    expect(result).toMatchObject({ id: 17 });
    expect(dbMock.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: 7,
      name: "Agente",
      defaultCommissionPercentage: "2.50",
      createdBy: 1,
    }));
  });

  it("valida referências e salva um financiamento", async () => {
    dbMock.createVehicleFinancing.mockResolvedValue({ id: 19 });
    const result = await appRouter.createCaller(context).vehicleFinancings.create({
      clientId: 11,
      vehicleId: 13,
      vehiclePrice: "30000.00",
      downPayment: "5000.00",
      interestRate: "2.00",
      installments: 24,
      startDate: "2026-08-25T12:00:00.000Z",
    });
    expect(result).toMatchObject({ id: 19 });
    expect(dbMock.createVehicleFinancing).toHaveBeenCalledWith(expect.objectContaining({
      databaseId: 7,
      clientId: 11,
      vehicleId: 13,
      financedAmount: "25000.00",
      totalAmount: "37000.00",
      installmentAmount: "1541.67",
      createdBy: 1,
    }));
  });

  it("rejeita financiamento inválido sem tocar no banco", async () => {
    await expect(appRouter.createCaller(context).vehicleFinancings.create({
      clientId: 11,
      vehicleId: 13,
      vehiclePrice: "10000.00",
      downPayment: "12000.00",
      interestRate: "1.00",
      installments: 12,
      startDate: "2026-08-25T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMock.createVehicleFinancing).not.toHaveBeenCalled();
  });

  it("registra a cota escolhida e separa o excedente como amortização", async () => {
    await appRouter.createCaller(context).payments.create({
      vehicleFinancingId: 19,
      installmentNumber: 3,
      amount: "1200.00",
      paymentDate: "2026-11-20T12:00:00.000Z",
      dueDate: "2026-11-20T12:00:00.000Z",
      status: "pago",
    });
    expect(dbMock.createPaymentBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleFinancingId: 19,
        installmentNumber: 3,
        amount: "1200.00",
        interestAmount: "200.00",
        principalAmount: "1000.00",
        remainingBalance: "11200.00",
        dueDate: new Date("2026-11-25T12:00:00.000Z"),
      }),
      expect.objectContaining({ amount: "1200.00", category: "PAGAMENTO_FINANCIAMENTO" }),
      undefined,
    );
  });

  it("impede pagar duas vezes a mesma cota de financiamento", async () => {
    dbMock.getPaymentsByFinancing.mockResolvedValue([{ installmentNumber: 3, status: "pago", amount: "1033.33" }]);
    await expect(appRouter.createCaller(context).payments.create({
      vehicleFinancingId: 19,
      installmentNumber: 3,
      amount: "1033.33",
      paymentDate: "2026-11-20T12:00:00.000Z",
      dueDate: "2026-11-20T12:00:00.000Z",
      status: "pago",
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("salva empréstimo e saída de caixa no mesmo bundle", async () => {
    dbMock.createLoanBundle.mockResolvedValue({ loanId: 23, result: { id: 23 } });
    const result = await appRouter.createCaller(context).loans.create({
      clientId: 11,
      amount: "1000.00",
      interestRate: "5.00",
      installments: 10,
      startDate: "2026-08-25T12:00:00.000Z",
    });
    expect(result).toMatchObject({ loanId: 23 });
    expect(dbMock.createLoanBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseId: 7,
        clientId: 11,
        amount: "1000.00",
        accruedInterest: "50.00",
        remainingBalance: "1050.00",
        totalAmount: "1050.00",
        createdBy: 1,
      }),
      expect.objectContaining({ databaseId: 7, type: "SAIDA", clientId: 11, amount: "1000.00", createdBy: 1 }),
    );
  });

  it("inclui imediatamente 30% de juros no saldo sem inflar a saída de caixa", async () => {
    dbMock.createLoanBundle.mockResolvedValue({ loanId: 24, result: { id: 24 } });
    await appRouter.createCaller(context).loans.create({
      clientId: 11,
      amount: "1000.00",
      interestRate: "30.00",
      installments: 1,
      startDate: "2026-08-25T12:00:00.000Z",
    });
    expect(dbMock.createLoanBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: "1000.00",
        accruedInterest: "300.00",
        remainingBalance: "1300.00",
        totalAmount: "1300.00",
      }),
      expect.objectContaining({ amount: "1000.00", category: "LIBERACAO_EMPRESTIMO" }),
    );
  });

  it("remove empréstimo do operacional e registra a observação na auditoria", async () => {
    const result = await appRouter.createCaller(context).loans.delete({
      id: 23,
      reason: "Lançamento realizado em duplicidade",
    });
    expect(result).toMatchObject({ success: true, cancelled: true });
    expect(dbMock.deleteLoanSafely).toHaveBeenCalledWith(23, 7);
    expect(dbMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancel_loan",
        entityId: 23,
        details: expect.stringContaining("Lançamento realizado em duplicidade"),
      })
    );
  });

  it("permite ao Super Admin excluir um lançamento manual do caixa", async () => {
    dbMock.deleteManualCashFlowEntry.mockResolvedValue({
      deleted: true,
      entry: { id: 31, type: "SAIDA", category: "OUTROS", description: "Despesa manual", amount: "25.00" },
    });
    await expect(appRouter.createCaller(context).cashFlow.delete({ id: 31 })).resolves.toMatchObject({ success: true });
    expect(dbMock.deleteManualCashFlowEntry).toHaveBeenCalledWith(31, 7);
    expect(dbMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "delete_manual_cash_flow", entityId: 31 }));
  });

  it("bloqueia exclusão direta de movimentos automáticos", async () => {
    dbMock.deleteManualCashFlowEntry.mockResolvedValue({
      deleted: false,
      reason: "automatic",
      entry: { id: 32, type: "SAIDA", category: "LIBERACAO_EMPRESTIMO", description: "Liberação", amount: "1000.00" },
    });
    await expect(appRouter.createCaller(context).cashFlow.delete({ id: 32 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("nega a exclusão no caixa para quem não é Super Admin", async () => {
    const adminContext = { ...context, user: { ...context.user!, role: "admin" as const } } as TrpcContext;
    await expect(appRouter.createCaller(adminContext).cashFlow.delete({ id: 31 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.deleteManualCashFlowEntry).not.toHaveBeenCalled();
  });

  it("cria usuário com o perfil e todas as permissões selecionadas", async () => {
    dbMock.getUserByUsername
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 41, username: "operador", role: "user" });
    dbMock.getUserByEmail.mockResolvedValue(undefined);
    dbMock.createLocalUser.mockResolvedValue({ id: 41 });

    await appRouter.createCaller(context).users.create({
      username: "operador",
      email: "operador@example.com",
      name: "Operador",
      password: "senha-segura",
      role: "user",
      canView: true,
      canInsert: true,
      canEdit: false,
      canDelete: false,
      canGenerateReports: true,
      canAccessSettings: false,
    });

    expect(dbMock.createLocalUser).toHaveBeenCalledWith(expect.objectContaining({
      username: "operador",
      role: "user",
      canView: true,
      canInsert: true,
      canEdit: false,
      canDelete: false,
      canGenerateReports: true,
      canAccessSettings: false,
      passwordHash: expect.any(String),
    }));
    expect(dbMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "create_user",
      entityId: 41,
    }));
  });

  it("impede administrador comum de criar usuários ou alterar permissões", async () => {
    const adminContext = { ...context, user: { ...context.user!, role: "admin" as const } } as TrpcContext;
    const caller = appRouter.createCaller(adminContext);

    await expect(caller.users.create({
      username: "indevido",
      email: "indevido@example.com",
      name: "Indevido",
      password: "senha-segura",
      role: "user",
      canView: true,
      canInsert: false,
      canEdit: false,
      canDelete: false,
      canGenerateReports: false,
      canAccessSettings: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.users.updatePermissions({ userId: 41, canDelete: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMock.createLocalUser).not.toHaveBeenCalled();
  });

  it("restringe o perfil mais simples somente ao dashboard", async () => {
    const dashboardContext = {
      ...context,
      user: { ...context.user!, role: "user" as const, dashboardOnly: true },
    } as TrpcContext;
    await expect(appRouter.createCaller(dashboardContext).clients.list())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
