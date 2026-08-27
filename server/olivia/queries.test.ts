import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "../db";
import {
  getDuePaymentsForOlivia,
  searchClientsForOlivia,
  type OliviaDuePeriod,
} from "./queries";
import type { OliviaUserContext } from "./authorization";

vi.mock("../db", () => ({
  getActiveDatabase: vi.fn(),
  getClientsByDatabase: vi.fn(),
  getPaymentsByDatabase: vi.fn(),
  getClientProfile: vi.fn(),
  getDashboardStats: vi.fn(),
  createAuditLog: vi.fn(),
}));

const user: OliviaUserContext = {
  id: 7,
  role: "user",
  username: "operador",
  name: "Operador",
  canUseOlivia: true,
  canView: true,
  canInsert: false,
  canEdit: false,
  canDelete: false,
  canGenerateReports: true,
  canAccessSettings: false,
  dashboardOnly: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getActiveDatabase).mockResolvedValue({ id: 2 } as never);
  vi.mocked(db.createAuditLog).mockResolvedValue(undefined as never);
});

describe("Olivia consultation services", () => {
  it("blocks a user whose Olivia access was not granted", async () => {
    await expect(searchClientsForOlivia({ ...user, canUseOlivia: false }, "Maria"))
      .rejects.toThrow("não foi liberado pelo Super Administrador");
  });

  it("searches by CPF internally without returning the CPF", async () => {
    vi.mocked(db.getClientsByDatabase).mockResolvedValue([
      { id: 1, databaseId: 2, name: "Maria", cpf: "123.456.789-00", phone: "21999999999" },
    ] as never);
    const result = await searchClientsForOlivia(user, "12345678900");
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("cpf");
  });

  it.each<OliviaDuePeriod>(["today", "week", "month", "overdue"])(
    "filters %s due items only from the active database result",
    async (period) => {
      vi.mocked(db.getPaymentsByDatabase).mockResolvedValue([
        { id: 1, status: "pendente", dueDate: new Date("2026-08-27T15:00:00Z") },
        { id: 2, status: "pago", dueDate: new Date("2026-08-27T15:00:00Z") },
        { id: 3, status: "pendente", dueDate: new Date("2026-08-20T15:00:00Z") },
      ] as never);
      const result = await getDuePaymentsForOlivia(user, period, new Date("2026-08-27T12:00:00Z"));
      expect(result.every((payment) => payment.status !== "pago")).toBe(true);
    },
  );
});
