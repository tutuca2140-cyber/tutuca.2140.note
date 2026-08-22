import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(cookieValues: string[] = []): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 999999,
    openId: "test-admin-open-id",
    username: "test-admin",
    passwordHash: null,
    name: "Administrador de teste",
    email: "admin-test@example.com",
    loginMethod: "local",
    role: "admin",
    canView: true,
    canInsert: true,
    canEdit: true,
    canDelete: true,
    canGenerateReports: true,
    canAccessSettings: true,
    isActive: true,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
      cookie: (_name: string, value: string) => {
        cookieValues.push(value);
      },
    } as TrpcContext["res"],
  };
}

describe("super administrador Draco", () => {
  it("faz login local e cria uma sessão autenticada", async () => {
    const cookieValues: string[] = [];
    const caller = appRouter.createCaller(createAdminContext(cookieValues));
    const result = await caller.auth.loginLocal({
      username: "Draco",
      password: "762762",
    });

    expect(result).toEqual({ success: true });
    expect(cookieValues).toHaveLength(1);
    expect(cookieValues[0]).toHaveLength(32);

    await db.deleteLocalSession(cookieValues[0]!);
  });

  it("existe, autentica com a senha configurada e possui acesso total", async () => {
    const draco = await db.getUserByUsername("Draco");

    expect(draco).toBeDefined();
    expect(draco?.role).toBe("super_admin");
    expect(draco?.isActive).toBe(true);
    expect(draco?.canView).toBe(true);
    expect(draco?.canInsert).toBe(true);
    expect(draco?.canEdit).toBe(true);
    expect(draco?.canDelete).toBe(true);
    expect(draco?.canGenerateReports).toBe(true);
    expect(draco?.canAccessSettings).toBe(true);
    expect(draco?.passwordHash).toBeTruthy();
    await expect(bcrypt.compare("762762", draco?.passwordHash ?? "")).resolves.toBe(true);
  });

  it("recusa alterações de permissões, perfil, status e exclusão", async () => {
    const draco = await db.getUserByUsername("Draco");
    expect(draco?.id).toBeTypeOf("number");

    const caller = appRouter.createCaller(createAdminContext());

    await expect(caller.users.updatePermissions({
      userId: draco!.id,
      canDelete: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(caller.users.updateRole({
      userId: draco!.id,
      role: "admin",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(caller.users.toggleActive({
      userId: draco!.id,
      isActive: false,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(caller.users.delete({
      userId: draco!.id,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
