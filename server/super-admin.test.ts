import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./_core/sdk";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(cookieValues: string[] = [], cookieMaxAges: number[] = []): TrpcContext {
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
      cookie: (_name: string, value: string, options?: { maxAge?: number }) => {
        cookieValues.push(value);
        cookieMaxAges.push(options?.maxAge ?? 0);
      },
    } as TrpcContext["res"],
  };
}

describe("super administrador Draco", () => {
  it("faz login local e cria uma sessão autenticada", async () => {
    const cookieValues: string[] = [];
    const cookieMaxAges: number[] = [];
    const caller = appRouter.createCaller(createAdminContext(cookieValues, cookieMaxAges));
    const result = await caller.auth.loginLocal({
      username: "Draco",
      password: "762762",
    });

    expect(result).toEqual({ success: true });
    expect(cookieValues).toHaveLength(1);
    expect(cookieValues[0]).toHaveLength(32);
    expect(cookieMaxAges[0]).toBe(8 * 60 * 60 * 1000);

    const authenticated = await sdk.authenticateRequest({
      headers: { cookie: `${COOKIE_NAME}=${cookieValues[0]}` },
    } as any);
    expect(authenticated.username).toBe("Draco");

    const rememberedCookies: string[] = [];
    const rememberedMaxAges: number[] = [];
    const rememberedCaller = appRouter.createCaller(createAdminContext(rememberedCookies, rememberedMaxAges));
    await rememberedCaller.auth.loginLocal({ username: "Draco", password: "762762", rememberMe: true });
    expect(rememberedMaxAges[0]).toBe(30 * 24 * 60 * 60 * 1000);

    await db.deleteLocalSession(cookieValues[0]!);
    await db.deleteLocalSession(rememberedCookies[0]!);
  });

  it("executa recuperação de senha, invalida o token e rejeita token expirado", async () => {
    const username = `reset-${Date.now()}`;
    const email = `${username}@example.com`;
    const user = await db.createLocalUser({
      username,
      email,
      name: "Usuário de recuperação",
      passwordHash: await bcrypt.hash("senha-antiga", 10),
    });
    const createdUser = await db.getUserByUsername(username);
    expect(createdUser).toBeDefined();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    try {
      const caller = appRouter.createCaller(createAdminContext());
      await expect(caller.auth.requestPasswordReset({
        identifier: email,
        origin: "https://deathnoteapp-43aeutkx.manus.space",
      })).resolves.toEqual({ success: true });

      const notificationBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      const token = String(notificationBody.content).match(/reset=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();

      await expect(caller.auth.resetPassword({ token: token!, password: "senha-nova" }))
        .resolves.toEqual({ success: true });
      const updatedUser = await db.getUserByUsername(username);
      await expect(bcrypt.compare("senha-nova", updatedUser?.passwordHash ?? "")).resolves.toBe(true);

      await expect(caller.auth.resetPassword({ token: token!, password: "outra-senha" }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });

      const expiredToken = `expired-${Date.now()}`;
      await db.createPasswordResetToken({
        userId: createdUser!.id,
        token: expiredToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await db.getPasswordResetToken(expiredToken)).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
      if (createdUser) {
        await db.deletePasswordResetTokensForUser(createdUser.id);
        await db.deleteUser(createdUser.id);
      }
    }
  });

  it("rejeita token de recuperação inexistente", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.auth.resetPassword({ token: "token-inexistente", password: "nova senha" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
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

    await expect(caller.users.adminResetPassword({
      userId: draco!.id,
      password: "tentativa-de-troca",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
