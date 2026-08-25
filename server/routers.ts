import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure as baseProtectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { notifyOwner } from "./_core/notification";
import { addPeriods, allocatePayment, allocateBalancePayment, calculateInterestOnBalance, calculateLoanPlan, roundMoney } from "../shared/finance";

const optionalText = z.string().optional();
const optionalEmail = z.union([z.string().email(), z.literal('')]).optional();
const optionalAddress = z.record(z.string(), z.string()).optional();
const positiveDecimal = (label: string) => z.string().trim().min(1, `${label} é obrigatório.`).refine(
  (value) => Number.isFinite(Number(value)) && Number(value) > 0,
  `${label} deve ser maior que zero.`,
);
const nonNegativeDecimal = (label: string) => z.string().trim().min(1, `${label} é obrigatório.`).refine(
  (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
  `${label} não pode ser negativo.`,
);
const validDate = (label: string) => z.string().trim().min(1, `${label} é obrigatória.`).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  `${label} é inválida.`,
);
const stripLegacyCpf = <T extends { cpf?: unknown }>(client: T): Omit<T, 'cpf'> => {
  const { cpf: _cpf, ...withoutCpf } = client;
  return withoutCpf;
};

const protectedProcedure = baseProtectedProcedure.use(({ ctx, next }) =>
  db.withUserDatabaseScope({ userId: ctx.user.id, role: ctx.user.role }, () => next({ ctx })),
);

// Admin procedure - requer role admin ou super_admin
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
    throw new TRPCError({ 
      code: 'FORBIDDEN',
      message: 'Acesso negado. Apenas administradores podem acessar este recurso.'
    });
  }
  return next({ ctx });
});

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'super_admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o Super Admin pode acessar este recurso.' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      
      // Log de auditoria
      if (ctx.user) {
        db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Desconhecido',
          action: 'logout',
          entity: 'auth',
          details: 'Logout realizado com sucesso',
          status: 'success'
        });
      }
      
      return { success: true } as const;
    }),

    loginLocal: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        rememberMe: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserByUsername(input.username);
        
        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Usuário ou senha inválidos'
          });
        }

        const passwordMatch = await bcrypt.compare(input.password, user.passwordHash);
        if (!passwordMatch) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Usuário ou senha inválidos'
          });
        }

        if (!user.isActive) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Usuário desativado'
          });
        }

        // Criar sessão
        const token = nanoid(32);
        const sessionDuration = input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + sessionDuration);
        await db.createLocalSession(user.id, token, expiresAt);

        // Atualizar lastSignedIn
        // await db.updateUserLastSignedIn(user.id);

        // Registrar no cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: sessionDuration });

        // Log de auditoria
        await db.createAuditLog({
          userId: user.id,
          username: user.username || user.email || 'Desconhecido',
          action: 'login_local',
          entity: 'auth',
          details: 'Login local realizado com sucesso',
          status: 'success'
        });

        return { success: true };
      }),

    registerLocal: publicProcedure
      .input(z.object({
        username: z.string().min(3).max(100),
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(6)
      }))
      .mutation(async ({ input }) => {
        // Verificar se usuário já existe
        const existingUser = await db.getUserByUsername(input.username);
        if (existingUser) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Usuário já existe'
          });
        }

        const existingEmail = await db.getUserByEmail(input.email);
        if (existingEmail) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Email já cadastrado'
          });
        }

        const passwordHash = await bcrypt.hash(input.password, 10);
        await db.createLocalUser({
          username: input.username,
          email: input.email,
          name: input.name,
          passwordHash
        });

        return { success: true };
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({
        identifier: z.string().min(1),
        origin: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        // Resposta uniforme evita revelar se um usuário existe.
        const user = await db.getUserByUsername(input.identifier) ?? await db.getUserByEmail(input.identifier);
        if (!user?.passwordHash || user.username === 'Draco') {
          return { success: true };
        }

        const token = nanoid(48);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await db.createPasswordResetToken({ userId: user.id, token, expiresAt });

        // O link é encaminhado ao proprietário do projeto para entrega segura.
        await notifyOwner({
          title: 'Solicitação de recuperação de senha',
          content: `Usuário: ${user.username ?? user.email}\nLink válido por 30 minutos: ${input.origin}/login?reset=${token}`,
        });

        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        password: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const resetToken = await db.getPasswordResetToken(input.token);
        if (!resetToken) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token inválido ou expirado' });
        }

        const user = await db.getUserById(resetToken.userId);
        if (!user || user.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Esta conta não pode usar recuperação de senha.' });
        }

        const passwordHash = await bcrypt.hash(input.password, 10);
        await db.updateLocalPassword(user.id, passwordHash);
        await db.consumePasswordResetToken(resetToken.id);
        await db.createAuditLog({
          userId: user.id,
          username: user.username || user.email || 'Usuário',
          action: 'password_reset',
          entity: 'auth',
          details: 'Senha local redefinida por token temporário',
          status: 'success',
        });

        return { success: true };
      }),
  }),

  // ==================== USERS ====================
  users: router({
    list: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getUserById(input.id);
      }),

    create: superAdminProcedure
      .input(z.object({
        username: z.string().trim().min(3).max(100),
        email: z.string().trim().email(),
        name: z.string().trim().min(1).max(200),
        password: z.string().min(6),
        role: z.enum(['user', 'admin']).default('user'),
        canView: z.boolean().default(true),
        canInsert: z.boolean().default(false),
        canEdit: z.boolean().default(false),
        canDelete: z.boolean().default(false),
        canGenerateReports: z.boolean().default(false),
        canAccessSettings: z.boolean().default(false),
        databaseIds: z.array(z.number().int().positive()).max(3).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (await db.getUserByUsername(input.username)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Nome de usuário já cadastrado.' });
        }
        if (await db.getUserByEmail(input.email)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'E-mail já cadastrado.' });
        }
        const passwordHash = await bcrypt.hash(input.password, 10);
        const { databaseIds, ...userInput } = input;
        const created = await db.createLocalUser({ ...userInput, passwordHash });
        const createdUser = await db.getUserByUsername(input.username);
        if (!createdUser) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível confirmar o usuário criado.' });
        await db.assignUserDatabases(createdUser.id, databaseIds);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.username || ctx.user.email || 'Super Admin',
          action: 'create_user',
          entity: 'users',
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
              canAccessSettings: input.canAccessSettings,
            },
            databaseIds,
          }),
          status: 'success',
        });
        return createdUser ?? created;
      }),

    update: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        username: z.string().trim().min(3).max(100),
        email: z.string().trim().email(),
        name: z.string().trim().min(1).max(200),
        role: z.enum(['user', 'admin']),
        canView: z.boolean(),
        canInsert: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
        canGenerateReports: z.boolean(),
        canAccessSettings: z.boolean(),
        databaseIds: z.array(z.number().int().positive()).max(3),
      }))
      .mutation(async ({ input, ctx }) => {
        const target = await db.getUserById(input.userId);
        if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
        if (target.username?.toLowerCase() === 'draco') throw new TRPCError({ code: 'FORBIDDEN', message: 'O Super Admin protegido não pode ser editado.' });
        const usernameOwner = await db.getUserByUsername(input.username);
        if (usernameOwner && usernameOwner.id !== input.userId) throw new TRPCError({ code: 'CONFLICT', message: 'Nome de usuário já cadastrado.' });
        const emailOwner = await db.getUserByEmail(input.email);
        if (emailOwner && emailOwner.id !== input.userId) throw new TRPCError({ code: 'CONFLICT', message: 'E-mail já cadastrado.' });
        const { userId, databaseIds, ...data } = input;
        await db.updateLocalUser(userId, data);
        await db.assignUserDatabases(userId, databaseIds);
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.username || ctx.user.email || 'Super Admin', action: 'update_user', entity: 'users', entityId: userId, details: `Usuário editado: ${input.username}`, status: 'success' });
        return { success: true };
      }),

    updatePermissions: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        canView: z.boolean().optional(),
        canInsert: z.boolean().optional(),
        canEdit: z.boolean().optional(),
        canDelete: z.boolean().optional(),
        canGenerateReports: z.boolean().optional(),
        canAccessSettings: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const targetUser = await db.getUserById(input.userId);
        if (targetUser?.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'As permissões do super administrador Draco são imutáveis.' });
        }

        const { userId, ...permissions } = input;
        await db.updateUserPermissions(userId, permissions);
        
        // Log de auditoria
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'update_permissions',
          entity: 'users',
          entityId: userId,
          details: JSON.stringify(permissions),
          status: 'success'
        });
        
        return { success: true };
      }),

    updateRole: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin', 'super_admin'])
      }))
      .mutation(async ({ input, ctx }) => {
        const targetUser = await db.getUserById(input.userId);
        if (targetUser?.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'O super administrador Draco não pode ter o perfil alterado.' });
        }

        await db.updateUserRole(input.userId, input.role);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'update_role',
          entity: 'users',
          entityId: input.userId,
          details: `Role alterado para: ${input.role}`,
          status: 'success'
        });
        
        return { success: true };
      }),

    toggleActive: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input, ctx }) => {
        const targetUser = await db.getUserById(input.userId);
        if (targetUser?.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'O super administrador Draco não pode ser desativado.' });
        }

        await db.toggleUserActive(input.userId, input.isActive);
        if (!input.isActive) await db.deleteUserSessions(input.userId);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'toggle_user_active',
          entity: 'users',
          entityId: input.userId,
          details: `Usuário ${input.isActive ? 'ativado' : 'desativado'}`,
          status: 'success'
        });
        
        return { success: true };
      }),

    adminResetPassword: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const targetUser = await db.getUserById(input.userId);
        if (!targetUser) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado.' });
        }
        if (targetUser.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'A senha do super administrador Draco não pode ser alterada.' });
        }

        const passwordHash = await bcrypt.hash(input.password, 10);
        await db.updateLocalPassword(targetUser.id, passwordHash);
        await db.deleteUserSessions(targetUser.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'admin_password_reset',
          entity: 'users',
          entityId: targetUser.id,
          details: `Senha redefinida pelo administrador para ${targetUser.username || targetUser.email}`,
          status: 'success',
        });

        return { success: true };
      }),

    delete: superAdminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const targetUser = await db.getUserById(input.userId);
        if (targetUser?.username === 'Draco') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'O super administrador Draco não pode ser excluído.' });
        }

        await db.deleteUser(input.userId);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'delete_user',
          entity: 'users',
          entityId: input.userId,
          details: 'Usuário excluído',
          status: 'success'
        });

        return { success: true };
      }),
  }),

  // ==================== DATABASES ====================
  databases: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getDatabasesForUser(ctx.user.id, ctx.user.role);
    }),

    getActive: protectedProcedure.query(async () => {
      return await db.getActiveDatabase();
    }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['novo', 'copia', 'existente'])
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createDatabase({
          ...input,
          createdBy: ctx.user.id
        });
        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'create_database',
          entity: 'databases',
          details: `Banco criado: ${input.name} (${input.type})`,
          status: 'success'
        });
        
        return result;
      }),

    setActive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.setActiveDatabase(input.id);
        
        const dbInfo = await db.getDatabaseById(input.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'switch_database',
          entity: 'databases',
          entityId: input.id,
          databaseId: input.id,
          details: `Banco ativado: ${dbInfo?.name}`,
          status: 'success'
        });
        
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateDatabase(id, data);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'update_database',
          entity: 'databases',
          entityId: id,
          details: JSON.stringify(data),
          status: 'success'
        });
        
        return { success: true };
      }),

    delete: superAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const dbInfo = await db.getDatabaseById(input.id);
        
        if (!dbInfo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Banco de dados não encontrado.' });
        await db.deleteDatabase(input.id);
        if (dbInfo.isActive) {
          const remaining = await db.getAllDatabases();
          if (remaining[0]) await db.setActiveDatabase(remaining[0].id);
        }
        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Admin',
          action: 'delete_database',
          entity: 'databases',
          entityId: input.id,
          details: `Banco deletado: ${dbInfo?.name}`,
          status: 'success'
        });
        
        return { success: true };
      }),
  }),

  // ==================== AGENTS ====================
  agents: router({
    list: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().default(true).optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar agentes.' });
        }
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return [];
        return await db.getAgentsByDatabase(activeDb.id, input?.includeInactive ?? true);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const agent = await db.getAgentById(input.id);
        if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agente não encontrado.' });
        return agent;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(255),
        defaultCommissionPercentage: z.coerce.number().min(0).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canInsert) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para inserir agentes.' });
        }
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const result = await db.createAgent({
          databaseId: activeDb.id,
          name: input.name.trim(),
          defaultCommissionPercentage: input.defaultCommissionPercentage.toFixed(2),
          status: 'ACTIVE',
          createdBy: ctx.user.id,
        });
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_agent',
          entity: 'agents',
          databaseId: activeDb.id,
          details: `Agente criado: ${input.name}`,
          status: 'success',
        });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        defaultCommissionPercentage: z.coerce.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar agentes.' });
        }
        const activeDb = await db.getActiveDatabase();
        const targetAgent = activeDb ? await db.getAgentById(input.id) : undefined;
        if (!activeDb || !targetAgent || targetAgent.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Agente não encontrado no banco ativo.' });
        }
        const { id, defaultCommissionPercentage, ...rest } = input;
        await db.updateAgent(id, {
          ...rest,
          ...(defaultCommissionPercentage === undefined ? {} : { defaultCommissionPercentage: defaultCommissionPercentage.toFixed(2) }),
        }, activeDb.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_agent',
          entity: 'agents',
          entityId: id,
          details: JSON.stringify(input),
          status: 'success',
        });
        return { success: true };
      }),

    deactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para desativar agentes.' });
        }
        const activeDb = await db.getActiveDatabase();
        const targetAgent = activeDb ? await db.getAgentById(input.id) : undefined;
        if (!activeDb || !targetAgent || targetAgent.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Agente não encontrado no banco ativo.' });
        }
        await db.deactivateAgent(input.id, activeDb.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'deactivate_agent',
          entity: 'agents',
          entityId: input.id,
          details: 'Agente desativado; histórico preservado.',
          status: 'success',
        });
        return { success: true };
      }),

    history: protectedProcedure
      .input(z.object({
        agentId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar o histórico.' });
        }
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return { payments: [], totals: { totalPayments: 0, totalPaymentAmount: 0, totalCommission: 0, averageCommission: 0 } };
        return await db.getAgentPaymentHistory(
          input.agentId,
          activeDb.id,
          input.startDate ? new Date(input.startDate) : undefined,
          input.endDate ? new Date(input.endDate) : undefined,
        );
      }),
  }),

  // ==================== CLIENTS ====================
  clients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar clientes.' });
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return (await db.getClientsByDatabase(activeDb.id)).map(stripLegacyCpf);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return undefined;
        const client = await db.getClientById(input.id);
        if (!client || client.databaseId !== activeDb.id) return undefined;
        return stripLegacyCpf(client);
      }),

    profile: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar clientes.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return undefined;
        const profile = await db.getClientProfile(input.id, activeDb.id);
        if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado no banco ativo.' });
        return { ...profile, client: stripLegacyCpf(profile.client) };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1),
        birthDate: z.string().optional(),
        email: optionalEmail,
        phone: optionalText,
        whatsapp: optionalText,
        profession: optionalText,
        indicatorAgentId: z.number().int().positive().optional(),
        address: optionalText,
        residentialAddress: optionalAddress,
        commercialAddress: optionalAddress,
        city: optionalText,
        state: optionalText,
        zipCode: optionalText,
        notes: optionalText,
      }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nenhum banco de dados ativo'
          });
        }

        if (!ctx.user.canInsert) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para inserir dados'
          });
        }

        const result = await db.createClient({
          name: input.name,
          birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
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

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_client',
          entity: 'clients',
          databaseId: activeDb.id,
          details: `Cliente criado: ${input.name}`,
          status: 'success'
        });

        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).optional(),
        birthDate: z.string().optional(),
        email: optionalEmail,
        phone: optionalText,
        whatsapp: optionalText,
        profession: optionalText,
        indicatorAgentId: z.number().int().positive().optional(),
        address: optionalText,
        residentialAddress: optionalAddress,
        commercialAddress: optionalAddress,
        city: optionalText,
        state: optionalText,
        zipCode: optionalText,
        notes: optionalText,
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo' });
        const currentClient = await db.getClientById(input.id);
        if (!currentClient || currentClient.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado no banco ativo.' });

        const { id, birthDate, ...data } = input;
        await db.updateClientInDatabase(id, { ...data, ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}) }, activeDb.id);

        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_client',
          entity: 'clients',
          entityId: id,
          databaseId: activeDb?.id,
          details: JSON.stringify(data),
          status: 'success'
        });

        return { success: true };
      }),

    delete: superAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo' });
        const currentClient = await db.getClientById(input.id);
        if (!currentClient || currentClient.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado no banco ativo.' });

        await db.deleteClientInDatabase(input.id, activeDb.id);

        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'delete_client',
          entity: 'clients',
          entityId: input.id,
          databaseId: activeDb?.id,
          details: 'Cliente deletado',
          status: 'success'
        });

        return { success: true };
      }),
  }),

  // ==================== LOANS ====================
  loans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar empréstimos.' });
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getLoansByDatabase(activeDb.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar empréstimos.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return null;
        const loan = await db.getLoanById(input.id);
        return loan?.databaseId === activeDb.id ? loan : null;
      }),

    details: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar detalhes.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return null;
        const loan = await db.getLoanById(input.id);
        if (!loan || loan.databaseId !== activeDb.id) return null;
        const [client, payments, interestHistory, cashFlow] = await Promise.all([
          db.getClientById(loan.clientId),
          db.getPaymentsByLoan(loan.id, activeDb.id),
          db.getLoanInterestHistory(loan.id, activeDb.id),
          db.getCashFlowByLoan(loan.id, activeDb.id),
        ]);
        return { loan, client: client && client.databaseId === activeDb.id ? client : null, payments, interestHistory, cashFlow };
      }),

    getByClient: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar empréstimos.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return [];
        const client = await db.getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id) return [];
        return await db.getLoansByClient(input.clientId, activeDb.id);
      }),

    history: protectedProcedure
      .input(z.object({ loanId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar o histórico.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return [];
        const loan = await db.getLoanById(input.loanId);
        if (!loan || loan.databaseId !== activeDb.id) return [];
        return db.getLoanInterestHistory(input.loanId, activeDb.id);
      }),

    generateInterest: protectedProcedure
      .input(z.object({ loanId: z.number().int().positive(), periodReference: z.string().trim().min(1).max(20) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para lançar juros.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const loan = await db.getLoanById(input.loanId);
        if (!loan || loan.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado no banco ativo.' });
        if (loan.status === 'pago' || loan.status === 'cancelado') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível lançar juros em um empréstimo encerrado.' });
        if (await db.getLoanInterestPeriod(input.loanId, activeDb.id, input.periodReference)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Os juros deste período já foram lançados.' });
        }
        const principalBalance = Number(loan.principalBalance || loan.amount);
        const interest = calculateInterestOnBalance(principalBalance, Number(loan.interestRate));
        const accruedInterest = roundMoney(Number(loan.accruedInterest || 0) + interest);
        await db.createLoanInterestHistory({
          databaseId: activeDb.id,
          loanId: loan.id,
          periodReference: input.periodReference,
          previousPrincipalBalance: principalBalance.toFixed(2),
          interestGenerated: interest.toFixed(2),
          paymentAmount: '0.00',
          interestPaid: '0.00',
          principalAmortized: '0.00',
          updatedPrincipalBalance: principalBalance.toFixed(2),
        });
        await db.updateLoanBalance(loan.id, activeDb.id, {
          principalBalance: principalBalance.toFixed(2),
          accruedInterest: accruedInterest.toFixed(2),
          remainingBalance: roundMoney(principalBalance + accruedInterest).toFixed(2),
          lastInterestPeriod: input.periodReference,
        });
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'generate_loan_interest', entity: 'loans', entityId: loan.id, databaseId: activeDb.id, details: `Juros de ${input.periodReference}: R$ ${interest.toFixed(2)}`, status: 'success' });
        return { interest, accruedInterest, principalBalance };
      }),

    create: protectedProcedure
      .input(z.object({
        clientId: z.number().int().positive(),
        amount: positiveDecimal('Valor principal'),
        interestType: z.enum(['simple', 'compound']).default('simple').optional(),
        interestRate: nonNegativeDecimal('Taxa de juros'),
        ratePeriod: z.enum(['day', 'week', 'month', 'year']).default('month').optional(),
        installments: z.coerce.number().int().positive().optional(),
        installmentAmount: z.string().optional(),
        totalAmount: z.string().optional(),
        startDate: validDate('Data inicial'),
        endDate: validDate('Data final').optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nenhum banco de dados ativo'
          });
        }

        if (!ctx.user.canInsert) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para inserir dados'
          });
        }
        const client = await db.getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
        const principal = Number(input.amount);
        const ratePercent = Number(input.interestRate);
        if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor principal ou taxa de juros inválidos.' });
        }
        const interestType = input.interestType ?? 'simple';
        const ratePeriod = input.ratePeriod ?? 'month';
        const periods = input.installments ?? 1;
        const plan = calculateLoanPlan({ principal, ratePercent, periods, interestType, ratePeriod });
        const startDate = new Date(input.startDate);
        if (Number.isNaN(startDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data inicial inválida.' });
        const endDate = input.endDate ? new Date(input.endDate) : addPeriods(startDate, plan.periods, ratePeriod);
        if (Number.isNaN(endDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data final inválida.' });
        if (endDate < startDate) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A data final deve ser igual ou posterior à data inicial.' });

        const result = await db.createLoanBundle({
          clientId: input.clientId,
          amount: plan.principal.toFixed(2),
          interestType,
          interestRate: ratePercent.toFixed(4),
          ratePeriod,
          installments: plan.periods,
          installmentAmount: plan.installmentAmount.toFixed(2),
          totalAmount: plan.totalAmount.toFixed(2),
          remainingBalance: plan.totalAmount.toFixed(2),
          principalBalance: plan.principal.toFixed(2),
          accruedInterest: plan.interestAmount.toFixed(2),
          totalPaid: '0.00',
          lastInterestPeriod: null,
          startDate,
          endDate,
          status: 'ativo',
          description: input.description,
          databaseId: activeDb.id,
          createdBy: ctx.user.id,
        }, {
          databaseId: activeDb.id,
          type: 'SAIDA',
          category: 'LIBERACAO_EMPRESTIMO',
          description: 'Liberação de empréstimo',
          amount: plan.principal.toFixed(2),
          movementDate: startDate,
          clientId: input.clientId,
          responsible: ctx.user.name || ctx.user.email || 'Usuário',
          notes: input.description,
          createdBy: ctx.user.id,
        });

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_loan',
          entity: 'loans',
          databaseId: activeDb.id,
          details: `Empréstimo criado: R$ ${input.amount}`,
          status: 'success'
        });

        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        clientId: z.number().int().positive().optional(),
        amount: z.string().optional(),
        interestType: z.enum(['simple', 'compound']).optional(),
        interestRate: z.string().optional(),
        ratePeriod: z.enum(['day', 'week', 'month', 'year']).optional(),
        installments: z.coerce.number().int().positive().optional(),
        installmentAmount: z.string().optional(),
        totalAmount: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.enum(['ativo', 'pago', 'atrasado', 'cancelado']).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar dados' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const currentLoan = await db.getLoanById(input.id);
        if (!currentLoan || currentLoan.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado no banco ativo.' });
        if (input.clientId !== undefined) {
          const client = await db.getClientById(input.clientId);
          if (!client || client.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
        }
        const startDate = input.startDate ? new Date(input.startDate) : currentLoan.startDate;
        const endDate = input.endDate ? new Date(input.endDate) : currentLoan.endDate;
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Datas do empréstimo inválidas.' });
        const principal = input.amount !== undefined ? Number(input.amount) : Number(currentLoan.amount);
        const ratePercent = input.interestRate !== undefined ? Number(input.interestRate) : Number(currentLoan.interestRate);
        if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(ratePercent) || ratePercent < 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor principal ou taxa de juros inválidos.' });
        const interestType = input.interestType ?? currentLoan.interestType;
        const ratePeriod = input.ratePeriod ?? currentLoan.ratePeriod;
        const periods = input.installments ?? currentLoan.installments ?? 1;
        const { id, status, description, clientId } = input;
        const plan = calculateLoanPlan({ principal, ratePercent, periods, interestType, ratePeriod });
        const financialTermsChanged = input.amount !== undefined
          || input.interestType !== undefined
          || input.interestRate !== undefined
          || input.ratePeriod !== undefined
          || input.installments !== undefined
          || input.installmentAmount !== undefined
          || input.totalAmount !== undefined;
        const hasInitialInterest = Boolean(await db.getLoanInterestPeriod(
          id,
          activeDb.id,
          db.INITIAL_LOAN_INTEREST_PERIOD,
        ));
        await db.updateLoanInDatabase(id, activeDb.id, {
          clientId,
          amount: plan.principal.toFixed(2),
          interestType,
          interestRate: ratePercent.toFixed(4),
          ratePeriod,
          installments: plan.periods,
          installmentAmount: plan.installmentAmount.toFixed(2),
          totalAmount: plan.totalAmount.toFixed(2),
          startDate,
          endDate,
          ...(status !== undefined ? { status } : {}),
          ...(description !== undefined ? { description } : {}),
        }, financialTermsChanged || hasInitialInterest ? plan.interestAmount : undefined);
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'update_loan', entity: 'loans', entityId: id, databaseId: activeDb.id, details: JSON.stringify(input), status: 'success' });
        return { success: true, message: 'Empréstimo atualizado com sucesso.' };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canDelete) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para deletar dados'
          });
        }

        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const currentLoan = await db.getLoanById(input.id);
        if (!currentLoan || currentLoan.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empréstimo não encontrado no banco ativo.' });
        const result = await db.deleteLoanSafely(input.id, activeDb.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: result.cancelled ? 'cancel_loan' : 'delete_loan',
          entity: 'loans',
          entityId: input.id,
          databaseId: activeDb.id,
          details: JSON.stringify(result),
          status: result.cancelled ? 'warning' : 'success'
        });
        return {
          success: true,
          cancelled: result.cancelled,
          message: result.cancelled ? 'Empréstimo cancelado para preservar o histórico financeiro.' : 'Empréstimo excluído com sucesso.',
          relations: result.relations,
        };
      }),
  }),

  // ==================== PAYMENTS ====================
  payments: router({
    list: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getPaymentsByDatabase(activeDb.id);
    }),

    getByLoan: protectedProcedure
      .input(z.object({ loanId: z.number() }))
      .query(async ({ input }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return [];
        return await db.getPaymentsByLoan(input.loanId, activeDb.id);
      }),

    create: protectedProcedure
      .input(z.object({
        loanId: z.number().int().positive().optional(),
        vehicleFinancingId: z.number().int().positive().optional(),
        installmentNumber: z.coerce.number().int().positive(),
        amount: z.string(),
        paymentDate: z.string(),
        dueDate: z.string(),
        status: z.enum(['pago', 'pendente', 'atrasado']),
        lateFee: z.string().optional(),
        interest: z.string().optional(),
        notes: z.string().optional(),
        agentId: z.number().int().positive().optional(),
        commissionPercentage: z.coerce.number().min(0).max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo' });
        if (!ctx.user.canInsert) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para inserir dados' });
        if ((input.loanId === undefined) === (input.vehicleFinancingId === undefined)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe exatamente um empréstimo ou um financiamento.' });
        }

        const loan = input.loanId === undefined ? undefined : await db.getLoanById(input.loanId);
        const vehicleFinancing = input.vehicleFinancingId === undefined ? undefined : await db.getVehicleFinancingById(input.vehicleFinancingId);
        if (input.loanId !== undefined && (!loan || loan.databaseId !== activeDb.id || ['pago', 'cancelado'].includes(loan.status))) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Empréstimo inválido, encerrado ou fora do banco ativo.' });
        }
        if (input.vehicleFinancingId !== undefined && (!vehicleFinancing || vehicleFinancing.databaseId !== activeDb.id || ['pago', 'cancelado'].includes(vehicleFinancing.status))) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Financiamento inválido, encerrado ou fora do banco ativo.' });
        }

        const paymentAmount = Number(input.amount);
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'O valor do pagamento deve ser maior que zero.' });
        const paymentDate = new Date(input.paymentDate);
        const dueDate = new Date(input.dueDate);
        if (Number.isNaN(paymentDate.getTime()) || Number.isNaN(dueDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'As datas do pagamento são inválidas.' });

        let commissionPercentage = 0;
        let agentId: number | undefined;
        if (input.agentId !== undefined) {
          const agent = await db.getAgentById(input.agentId);
          if (!agent || agent.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agente inválido para o banco ativo.' });
          if (agent.status !== 'ACTIVE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agentes inativos não podem ser selecionados em novos pagamentos.' });
          agentId = agent.id;
          commissionPercentage = input.commissionPercentage ?? Number(agent.defaultCommissionPercentage || 0);
        } else if (input.commissionPercentage !== undefined && input.commissionPercentage !== 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A comissão só pode ser informada quando um agente é selecionado.' });
        }

        const priorPayments = loan
          ? await db.getPaymentsByLoan(loan.id, activeDb.id)
          : await db.getPaymentsByFinancing(vehicleFinancing!.id, activeDb.id);
        const contractPrincipal = loan ? Number(loan.principalBalance || loan.amount) : Number(vehicleFinancing?.financedAmount || 0);
        const accruedInterest = loan ? Number(loan.accruedInterest || 0) : Math.max(0, Number(vehicleFinancing?.totalAmount || vehicleFinancing?.financedAmount || 0) - contractPrincipal);
        const priorPaid = priorPayments.filter((payment) => payment.status === 'pago').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const balanceBefore = loan ? roundMoney(contractPrincipal + accruedInterest) : Math.max(0, Number(vehicleFinancing?.totalAmount || vehicleFinancing?.financedAmount || 0) - priorPaid);
        if (input.status === 'pago' && paymentAmount > balanceBefore + 0.01) throw new TRPCError({ code: 'BAD_REQUEST', message: 'O pagamento não pode exceder o saldo do contrato.' });
        const allocation = input.status === 'pago'
          ? loan
            ? allocateBalancePayment(paymentAmount, accruedInterest, contractPrincipal)
            : allocatePayment(paymentAmount, Number(vehicleFinancing?.totalAmount || vehicleFinancing?.financedAmount || 0), accruedInterest, priorPayments.reduce((sum, payment) => sum + Number(payment.interestAmount || 0), 0), balanceBefore)
          : { principalAmount: 0, interestAmount: 0, remainingBalance: balanceBefore };

        const commissionAmount = Math.round(paymentAmount * commissionPercentage) / 100;
        const netAmount = Math.round((paymentAmount - commissionAmount) * 100) / 100;
        const duplicate = await db.paymentAlreadyRegistered({ databaseId: activeDb.id, loanId: input.loanId, vehicleFinancingId: input.vehicleFinancingId, installmentNumber: input.installmentNumber, amount: input.amount, paymentDate, agentId });
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Este pagamento e sua comissão já foram registrados.' });

        const paymentData = {
          loanId: input.loanId,
          vehicleFinancingId: input.vehicleFinancingId,
          installmentNumber: input.installmentNumber,
          amount: paymentAmount.toFixed(2),
          paymentDate,
          dueDate,
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
          createdBy: ctx.user.id,
        };
        const nextPrincipal = roundMoney(Math.max(0, Number(loan?.principalBalance || loan?.amount || 0) - allocation.principalAmount));
        const nextInterest = roundMoney(Math.max(0, Number(loan?.accruedInterest || 0) - allocation.interestAmount));
        const nextTotalPaid = roundMoney(Number(loan?.totalPaid || 0) + paymentAmount);
        const result = await db.createPaymentBundle(paymentData, {
          databaseId: activeDb.id,
          type: 'ENTRADA',
          category: loan
            ? allocation.interestAmount > 0 && allocation.principalAmount === 0 ? 'JUROS_EMPRESTIMO' : allocation.remainingBalance <= 0 ? 'QUITACAO_EMPRESTIMO' : 'PAGAMENTO_EMPRESTIMO'
            : 'PAGAMENTO_FINANCIAMENTO',
          description: loan ? `Recebimento do empréstimo #${loan.id}` : `Recebimento do financiamento #${vehicleFinancing!.id}`,
          amount: paymentAmount.toFixed(2),
          movementDate: paymentDate,
          clientId: loan?.clientId ?? vehicleFinancing?.clientId,
          loanId: loan?.id,
          responsible: ctx.user.name || ctx.user.email || 'Usuário',
          notes: input.notes,
          createdBy: ctx.user.id,
        }, loan && input.status === 'pago' ? {
          id: loan.id,
          databaseId: activeDb.id,
          values: {
            principalBalance: nextPrincipal.toFixed(2),
            accruedInterest: nextInterest.toFixed(2),
            totalPaid: nextTotalPaid.toFixed(2),
            remainingBalance: allocation.remainingBalance.toFixed(2),
            status: allocation.remainingBalance <= 0 ? 'pago' : (new Date(loan.endDate) < new Date() ? 'atrasado' : 'ativo'),
          },
        } : undefined);
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'create_payment', entity: 'payments', databaseId: activeDb.id, details: `Pagamento registrado: R$ ${paymentAmount.toFixed(2)}; comissão: R$ ${commissionAmount.toFixed(2)}`, status: 'success' });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        amount: z.string().optional(),
        status: z.enum(['pago', 'pendente', 'atrasado']).optional(),
        paymentDate: z.string().optional(),
        dueDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para editar dados' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const current = await db.getPaymentById(input.id);
        if (!current || current.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pagamento não encontrado no banco ativo.' });
        const amount = input.amount !== undefined ? Number(input.amount) : Number(current.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'O valor do pagamento deve ser maior que zero.' });
        const paymentDate = input.paymentDate ? new Date(input.paymentDate) : current.paymentDate;
        const dueDate = input.dueDate ? new Date(input.dueDate) : current.dueDate;
        if (Number.isNaN(paymentDate.getTime()) || Number.isNaN(dueDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'As datas do pagamento são inválidas.' });
        const result = await db.updatePaymentBundle(input.id, activeDb.id, {
          amount: amount.toFixed(2),
          status: input.status ?? current.status,
          paymentDate,
          dueDate,
          notes: input.notes !== undefined ? input.notes : current.notes,
        });
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'update_payment', entity: 'payments', entityId: input.id, databaseId: activeDb.id, details: JSON.stringify(input), status: 'success' });
        return { success: true, message: 'Pagamento atualizado e caixa reconciliado.', result };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canDelete) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para excluir pagamentos.' });
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const current = await db.getPaymentById(input.id);
        if (!current || current.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pagamento não encontrado no banco ativo.' });
        const result = await db.deletePaymentBundle(input.id, activeDb.id);
        await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'delete_payment', entity: 'payments', entityId: input.id, databaseId: activeDb.id, details: 'Pagamento removido; caixa e saldo recalculados.', status: 'warning' });
        return { success: true, message: 'Pagamento excluído e caixa reconciliado.', result };
      }),
  }),

  // ==================== CASH FLOW ====================
  cashFlow: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar o fluxo de caixa.' });
      const activeDb = await db.getActiveDatabase();
      return activeDb ? db.getCashFlowByDatabase(activeDb.id) : [];
    }),
    create: protectedProcedure.input(z.object({
      type: z.enum(['ENTRADA', 'SAIDA']),
      category: z.string().trim().min(1),
      description: z.string().trim().min(1),
      amount: z.coerce.number().positive(),
      movementDate: z.string(),
      responsible: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para registrar movimentações.' });
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
      const movementDate = new Date(input.movementDate);
      if (Number.isNaN(movementDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data da movimentação inválida.' });
      await db.createCashFlowEntry({ ...input, amount: input.amount.toFixed(2), movementDate, databaseId: activeDb.id, createdBy: ctx.user.id });
      return { success: true };
    }),
    delete: superAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
        const result = await db.deleteManualCashFlowEntry(input.id, activeDb.id);
        if (!result.deleted) {
          if (result.reason === 'not_found') throw new TRPCError({ code: 'NOT_FOUND', message: 'Lançamento não encontrado no banco ativo.' });
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lançamentos automáticos devem ser corrigidos na operação de origem e não podem ser excluídos diretamente do caixa.' });
        }
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Super Admin',
          action: 'delete_manual_cash_flow',
          entity: 'cash_flow',
          entityId: result.entry.id,
          databaseId: activeDb.id,
          details: JSON.stringify({ type: result.entry.type, category: result.entry.category, description: result.entry.description, amount: result.entry.amount }),
          status: 'warning',
        });
        return { success: true, message: 'Lançamento manual excluído do caixa.' };
      }),
  }),

  // ==================== VEHICLES ====================
  vehicles: router({
    list: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getVehiclesByDatabase(activeDb.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const activeDb = await db.getActiveDatabase();
        const vehicle = await db.getVehicleById(input.id);
        return activeDb && vehicle?.databaseId === activeDb.id ? vehicle : null;
      }),

    create: protectedProcedure
      .input(z.object({
        clientId: z.number().int().positive().optional(),
        vehicleType: z.enum(['CARRO', 'MOTO', 'OUTRO']).optional(),
        brand: z.string().trim().optional(),
        model: z.string().trim().min(1, 'Informe o modelo do veículo.'),
        year: z.coerce.number().int().min(1900).max(2200).optional(),
        color: z.string().optional(),
        plate: z.string().optional(),
        renavam: z.string().optional(),
        chassi: z.string().optional(),
        mileage: z.coerce.number().int().nonnegative().optional(),
        purchasePrice: z.coerce.number().nonnegative().default(0),
        expenses: z.coerce.number().nonnegative().default(0),
        salePrice: z.coerce.number().nonnegative().optional(),
        purchaseDate: z.string().optional(),
        price: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nenhum banco de dados ativo'
          });
        }

        if (!ctx.user.canInsert) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para inserir dados'
          });
        }
        if (input.clientId !== undefined) {
          const client = await db.getClientById(input.clientId);
          if (!client || client.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
        }
        const purchasePrice = input.purchasePrice.toFixed(2);
        const vehicleData = {
          ...input,
          clientId: input.clientId ?? null,
          vehicleType: input.vehicleType ?? 'OUTRO',
          brand: input.brand || null,
          year: input.year ?? null,
          purchasePrice,
          expenses: input.expenses.toFixed(2),
          salePrice: input.salePrice?.toFixed(2),
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
          price: input.price ?? input.salePrice?.toFixed(2) ?? '0.00',
          databaseId: activeDb.id,
          createdBy: ctx.user.id
        } satisfies import('../drizzle/schema').InsertVehicle;
        const { result } = await db.createVehicleBundle(vehicleData, input.purchasePrice > 0 ? {
          databaseId: activeDb.id,
          type: 'SAIDA',
          category: 'COMPRA_VEICULO',
          description: `Compra de veículo: ${input.model}`,
          amount: purchasePrice,
          movementDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
          createdBy: ctx.user.id,
        } : undefined);

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_vehicle',
          entity: 'vehicles',
          databaseId: activeDb.id,
          details: `Veículo criado: ${input.brand} ${input.model}`,
          status: 'success'
        });

        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        clientId: z.number().int().positive().optional().nullable(),
        vehicleType: z.enum(['CARRO', 'MOTO', 'OUTRO']).optional(),
        brand: z.string().trim().optional().nullable(),
        model: z.string().trim().min(1).optional(),
        year: z.coerce.number().int().min(1900).max(2200).optional().nullable(),
        color: z.string().optional().nullable(),
        plate: z.string().optional().nullable(),
        renavam: z.string().optional().nullable(),
        chassi: z.string().optional().nullable(),
        mileage: z.coerce.number().int().nonnegative().optional().nullable(),
        purchasePrice: z.coerce.number().nonnegative().optional(),
        expenses: z.coerce.number().nonnegative().optional(),
        salePrice: z.coerce.number().nonnegative().optional().nullable(),
        status: z.enum(['disponivel', 'vendido', 'reservado', 'indisponivel']).optional(),
        price: z.string().optional(),
        description: z.string().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo' });
        const currentVehicle = await db.getVehicleById(input.id);
        if (!currentVehicle || currentVehicle.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Veículo não encontrado no banco ativo.' });
        if (input.clientId !== undefined && input.clientId !== null) {
          const client = await db.getClientById(input.clientId);
          if (!client || client.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
        }
        const { id, ...data } = input;
        const normalizedData = {
          ...data,
          purchasePrice: data.purchasePrice === undefined ? undefined : data.purchasePrice.toFixed(2),
          expenses: data.expenses === undefined ? undefined : data.expenses.toFixed(2),
          salePrice: data.salePrice === undefined ? undefined : data.salePrice === null ? null : data.salePrice.toFixed(2),
        };
        await db.updateVehicleInDatabase(id, normalizedData, activeDb.id);

        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_vehicle',
          entity: 'vehicles',
          entityId: id,
          databaseId: activeDb?.id,
          details: JSON.stringify(data),
          status: 'success'
        });

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canDelete) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para deletar dados'
          });
        }

        const activeDb = await db.getActiveDatabase();
        if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo' });
        const currentVehicle = await db.getVehicleById(input.id);
        if (!currentVehicle || currentVehicle.databaseId !== activeDb.id) throw new TRPCError({ code: 'NOT_FOUND', message: 'Veículo não encontrado no banco ativo.' });
        await db.deleteVehicleInDatabase(input.id, activeDb.id);

        
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'delete_vehicle',
          entity: 'vehicles',
          entityId: input.id,
          databaseId: activeDb?.id,
          details: 'Veículo deletado',
          status: 'success'
        });

        return { success: true };
      }),
  }),

  // ==================== VEHICLE SALES ====================
  vehicleSales: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.canView) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar vendas.' });
      const activeDb = await db.getActiveDatabase();
      return activeDb ? db.getVehicleSalesByDatabase(activeDb.id) : [];
    }),
    create: protectedProcedure.input(z.object({
      vehicleId: z.number().int().positive(),
      clientId: z.number().int().positive().optional(),
      saleAmount: z.coerce.number().positive(),
      receivedAmount: z.coerce.number().min(0).default(0),
      paymentMethod: z.enum(['DINHEIRO', 'PIX', 'TRANSFERENCIA', 'CARTAO', 'FINANCIAMENTO', 'OUTRO']).optional(),
      saleDate: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para registrar vendas.' });
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
      const saleDate = new Date(input.saleDate);
      if (Number.isNaN(saleDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data da venda inválida.' });
      if (input.clientId !== undefined) {
        const client = await db.getClientById(input.clientId);
        if (!client || client.databaseId !== activeDb.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
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
        createdBy: ctx.user.id,
      } satisfies import('../drizzle/schema').InsertVehicleSale;
      const result = await db.createVehicleSaleBundle(data, input.vehicleId, activeDb.id, {
        databaseId: activeDb.id,
        type: 'ENTRADA',
        category: 'VENDA_VEICULO',
        description: `Venda de veículo #${input.vehicleId}`,
        amount: receivedAmount.toFixed(2),
        movementDate: saleDate,
        clientId: input.clientId ?? null,
        createdBy: ctx.user.id,
      });
      await db.createAuditLog({ userId: ctx.user.id, username: ctx.user.name || ctx.user.email || 'Usuário', action: 'create_vehicle_sale', entity: 'vehicle_sales', entityId: result.saleId, databaseId: activeDb.id, details: JSON.stringify(input), status: 'success' });
      return result;
    }),
    receive: protectedProcedure.input(z.object({ saleId: z.number().int().positive(), amount: z.coerce.number().positive(), movementDate: z.string() })).mutation(async ({ input, ctx }) => {
      if (!ctx.user.canInsert) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para registrar recebimentos.' });
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum banco de dados ativo.' });
      const movementDate = new Date(input.movementDate);
      if (Number.isNaN(movementDate.getTime())) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Data do recebimento inválida.' });
      const result = await db.receiveVehicleSaleBundle(input.saleId, activeDb.id, input.amount.toFixed(2), movementDate, ctx.user.id);
      return { success: true, ...result };
    }),
  }),

  // ==================== VEHICLE FINANCINGS ====================
  vehicleFinancings: router({
    list: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getVehicleFinancingsByDatabase(activeDb.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const activeDb = await db.getActiveDatabase();
        const financing = await db.getVehicleFinancingById(input.id);
        if (!activeDb || !financing || financing.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Financiamento não encontrado no banco ativo.' });
        }
        return financing;
      }),

    create: protectedProcedure
      .input(z.object({
        vehicleId: z.number().int().positive(),
        clientId: z.number().int().positive(),
        vehiclePrice: positiveDecimal('Preço do veículo'),
        downPayment: nonNegativeDecimal('Entrada'),
        interestRate: nonNegativeDecimal('Taxa de juros'),
        installments: z.number().int().positive(),
        startDate: validDate('Data inicial'),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nenhum banco de dados ativo'
          });
        }

        if (!ctx.user.canInsert) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para inserir dados'
          });
        }

        const [client, vehicle] = await Promise.all([
          db.getClientById(input.clientId),
          db.getVehicleById(input.vehicleId),
        ]);
        if (!client || client.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inválido para o banco ativo.' });
        }
        if (!vehicle || vehicle.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Veículo inválido para o banco ativo.' });
        }
        const startDate = new Date(input.startDate);
        const vehiclePrice = Number(input.vehiclePrice);
        const downPayment = Number(input.downPayment);
        if (downPayment >= vehiclePrice) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'A entrada não pode ser maior que o preço do veículo.' });
        }
        const financedAmount = roundMoney(vehiclePrice - downPayment);
        const plan = calculateLoanPlan({
          principal: financedAmount,
          ratePercent: Number(input.interestRate),
          periods: input.installments,
          interestType: 'simple',
          ratePeriod: 'month',
        });
        const endDate = addPeriods(startDate, input.installments, 'month');

        const result = await db.createVehicleFinancing({
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

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_vehicle_financing',
          entity: 'vehicleFinancings',
          databaseId: activeDb.id,
          details: `Financiamento criado: principal R$ ${financedAmount.toFixed(2)}, total R$ ${plan.totalAmount.toFixed(2)}`,
          status: 'success'
        });

        return { ...result, financedAmount, totalAmount: plan.totalAmount, installmentAmount: plan.installmentAmount, endDate };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['ativo', 'pago', 'atrasado', 'cancelado']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const activeDb = await db.getActiveDatabase();
        const financing = await db.getVehicleFinancingById(input.id);
        if (!activeDb || !financing || financing.databaseId !== activeDb.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Financiamento não encontrado no banco ativo.' });
        }
        const { id, ...data } = input;
        await db.updateVehicleFinancing(id, data);

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_vehicle_financing',
          entity: 'vehicleFinancings',
          entityId: id,
          databaseId: activeDb?.id,
          details: JSON.stringify(data),
          status: 'success'
        });

        return { success: true };
      }),
  }),

  // ==================== AUDIT LOGS ====================
  auditLogs: router({
    list: adminProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getAuditLogs(input.limit);
      }),

    byUser: adminProcedure
      .input(z.object({ userId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getAuditLogsByUser(input.userId, input.limit);
      }),

    byDatabase: adminProcedure
      .input(z.object({ databaseId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getAuditLogsByDatabase(input.databaseId, input.limit);
      }),
  }),

  // ==================== DASHBOARD ====================
  dashboard: router({
    stats: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
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
            totalVehicleSales: 0,
          },
        };
      }
      return await db.getDashboardStats(activeDb.id);
    }),

    agentPerformance: protectedProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.user.canView) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para visualizar performance.' });
        }
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) {
          return { kpis: { totalAgents: 0, activeAgents: 0, totalPayments: 0, totalPaymentVolume: 0, totalCommissions: 0, bestAgent: null }, ranking: [], evolution: [] };
        }
        return await db.getAgentPerformance(
          activeDb.id,
          input?.startDate ? new Date(input.startDate) : undefined,
          input?.endDate ? new Date(input.endDate) : undefined,
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;
