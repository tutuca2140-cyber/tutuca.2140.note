import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import { cashFlow, vehicleSales } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 1, openId: "vehicle-test", email: "vehicle@example.com", name: "Vehicle Test", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: true, canView: true, canInsert: true, canEdit: true, canDelete: true, canGenerateReports: true, canAccessSettings: true },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("estoque e vendas de veículos", () => {
  it("cadastra somente com modelo e registra venda/recebimento no caixa", async () => {
    let activeDb = await db.getActiveDatabase();
    let createdDatabaseId: number | undefined;
    const suffix = Date.now();
    if (!activeDb) {
      await db.createDatabase({ name: `Banco veículos ${suffix}`, description: "Banco temporário", type: "novo", isActive: true, createdBy: 1 });
      activeDb = (await db.getAllDatabases()).find((item) => item.name === `Banco veículos ${suffix}`);
      createdDatabaseId = activeDb?.id;
    }
    if (!activeDb) return;
    const caller = appRouter.createCaller(context());
    let vehicleId: number | undefined;
    let unsoldVehicleId: number | undefined;
    let saleId: number | undefined;
    try {
      const statsBefore = await db.getDashboardStats(activeDb.id);
      await caller.vehicles.create({ model: `Modelo não vendido ${suffix}`, salePrice: 900, purchasePrice: 0 });
      const unsoldVehicle = (await db.getVehiclesByDatabase(activeDb.id)).find((item) => item.model === `Modelo não vendido ${suffix}`);
      unsoldVehicleId = unsoldVehicle?.id;
      const statsAfterUnsold = await db.getDashboardStats(activeDb.id);
      expect(statsAfterUnsold?.vehicleSalesCount).toBe(statsBefore?.vehicleSalesCount);
      expect(statsAfterUnsold?.vehicleProfit).toBe(statsBefore?.vehicleProfit);
      await caller.vehicles.create({ model: `Modelo ${suffix}`, purchasePrice: 50 });
      const vehicle = (await db.getVehiclesByDatabase(activeDb.id)).find((item) => item.model === `Modelo ${suffix}`);
      expect(vehicle).toBeDefined();
      vehicleId = vehicle!.id;
      const purchaseMovement = (await db.getCashFlowByDatabase(activeDb.id)).find((item) => item.vehicleId === vehicleId && item.category === "COMPRA_VEICULO");
      expect(Number(purchaseMovement?.amount)).toBe(50);
      const created = await caller.vehicleSales.create({ vehicleId, saleAmount: 500, receivedAmount: 100, saleDate: new Date().toISOString(), paymentMethod: "PIX" });
      saleId = created.saleId;
      expect(saleId).toBeDefined();
      const listedSale = (await db.getVehicleSalesByDatabase(activeDb.id)).find((item) => item.id === saleId);
      expect(Number(listedSale?.receivedAmount)).toBe(100);
      expect(Number(listedSale?.receivableBalance)).toBe(400);
      const received = await caller.vehicleSales.receive({ saleId: saleId!, amount: 400, movementDate: new Date().toISOString() });
      expect(received.nextBalance).toBe(0);
      const movements = await db.getCashFlowByDatabase(activeDb.id);
      expect(movements.filter((item) => item.vehicleSaleId === saleId).length).toBe(2);
    } finally {
      const connection = await db.getDb();
      if (connection && saleId) {
        await connection.delete(cashFlow).where(eq(cashFlow.vehicleSaleId, saleId));
        await connection.delete(vehicleSales).where(eq(vehicleSales.id, saleId));
      }
      if (connection && vehicleId) await connection.delete(cashFlow).where(eq(cashFlow.vehicleId, vehicleId));
      if (connection && unsoldVehicleId) await connection.delete(cashFlow).where(eq(cashFlow.vehicleId, unsoldVehicleId));
      if (vehicleId) await db.deleteVehicle(vehicleId);
      if (unsoldVehicleId) await db.deleteVehicle(unsoldVehicleId);
      if (createdDatabaseId) await db.deleteDatabase(createdDatabaseId);
    }
  }, 15000);
});
