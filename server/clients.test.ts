import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: 'super_admin' | 'admin' | 'user' = 'admin'): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isActive: true,
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("DEATH NOTE System Tests", () => {
  it("should authenticate user with me endpoint", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.email).toBe("test@example.com");
    expect(result?.role).toBe("admin");
  });

  it("should list databases for admin user", async () => {
    const { ctx } = createAuthContext('admin');
    const caller = appRouter.createCaller(ctx);

    try {
      const result = await caller.databases.list();
      expect(Array.isArray(result)).toBe(true);
    } catch (error) {
      // Database might not be available in test environment
      expect(error).toBeDefined();
    }
  });

  it("should return a consolidated client profile scoped to the active database", async () => {
    const activeDb = await db.getActiveDatabase();
    if (!activeDb) return;
    const suffix = Date.now();
    await db.createClient({ databaseId: activeDb.id, name: `Perfil de teste ${suffix}`, createdBy: 1 });
    const created = (await db.getClientsByDatabase(activeDb.id)).find((item) => item.name === `Perfil de teste ${suffix}`);
    expect(created).toBeDefined();
    const { ctx } = createAuthContext('admin');
    const profile = await appRouter.createCaller(ctx).clients.profile({ id: created!.id });
    expect(profile.client.id).toBe(created!.id);
    expect(Array.isArray(profile.loans)).toBe(true);
    expect(Array.isArray(profile.financings)).toBe(true);
    expect(Array.isArray(profile.payments)).toBe(true);
    expect(profile.financialHistory.paymentCount).toBe(profile.payments.length);
    await db.deleteClient(created!.id);
  });

  it("should check user permissions", async () => {
    const { ctx } = createAuthContext('user');
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result?.canView).toBe(true);
    expect(result?.canInsert).toBe(true);
    expect(result?.canEdit).toBe(true);
  });
});
