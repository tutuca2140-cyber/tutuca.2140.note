import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import * as bcrypt from "bcrypt";
import { nanoid } from "nanoid";

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
        password: z.string().min(1)
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
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
        await db.createLocalSession(user.id, token, expiresAt);

        // Atualizar lastSignedIn
        // await db.updateUserLastSignedIn(user.id);

        // Registrar no cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

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

        // Hash da senha
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Criar usuário
        await db.createLocalUser({
          username: input.username,
          email: input.email,
          name: input.name,
          passwordHash
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

    updatePermissions: adminProcedure
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

    updateRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin', 'super_admin'])
      }))
      .mutation(async ({ input, ctx }) => {
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

    toggleActive: adminProcedure
      .input(z.object({
        userId: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input, ctx }) => {
        await db.toggleUserActive(input.userId, input.isActive);
        
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
  }),

  // ==================== DATABASES ====================
  databases: router({
    list: adminProcedure.query(async () => {
      return await db.getAllDatabases();
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

    setActive: adminProcedure
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

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const dbInfo = await db.getDatabaseById(input.id);
        
        // Não permitir deletar banco ativo
        if (dbInfo?.isActive) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Não é possível deletar o banco de dados ativo'
          });
        }
        
        await db.deleteDatabase(input.id);
        
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

  // ==================== CLIENTS ====================
  clients: router({
    list: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getClientsByDatabase(activeDb.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getClientById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        cpf: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
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

        const result = await db.createClient({
          ...input,
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
        id: z.number(),
        name: z.string().optional(),
        cpf: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const { id, ...data } = input;
        await db.updateClient(id, data);

        const activeDb = await db.getActiveDatabase();
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

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canDelete) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para deletar dados'
          });
        }

        await db.deleteClient(input.id);

        const activeDb = await db.getActiveDatabase();
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
    list: protectedProcedure.query(async () => {
      const activeDb = await db.getActiveDatabase();
      if (!activeDb) return [];
      return await db.getLoansByDatabase(activeDb.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getLoanById(input.id);
      }),

    getByClient: protectedProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        const activeDb = await db.getActiveDatabase();
        if (!activeDb) return [];
        return await db.getLoansByClient(input.clientId, activeDb.id);
      }),

    create: protectedProcedure
      .input(z.object({
        clientId: z.number(),
        amount: z.string(),
        interestRate: z.string(),
        installments: z.number(),
        installmentAmount: z.string(),
        totalAmount: z.string(),
        startDate: z.string(),
        endDate: z.string(),
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

        const result = await db.createLoan({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          databaseId: activeDb.id,
          createdBy: ctx.user.id
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
        status: z.enum(['ativo', 'pago', 'atrasado', 'cancelado']).optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const { id, ...data } = input;
        await db.updateLoan(id, data);

        const activeDb = await db.getActiveDatabase();
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_loan',
          entity: 'loans',
          entityId: id,
          databaseId: activeDb?.id,
          details: JSON.stringify(data),
          status: 'success'
        });

        return { success: true };
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

        await db.deleteLoan(input.id);

        const activeDb = await db.getActiveDatabase();
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'delete_loan',
          entity: 'loans',
          entityId: input.id,
          databaseId: activeDb?.id,
          details: 'Empréstimo deletado',
          status: 'success'
        });

        return { success: true };
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
        loanId: z.number(),
        installmentNumber: z.number(),
        amount: z.string(),
        paymentDate: z.string(),
        dueDate: z.string(),
        status: z.enum(['pago', 'pendente', 'atrasado']),
        lateFee: z.string().optional(),
        interest: z.string().optional(),
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

        const result = await db.createPayment({
          ...input,
          paymentDate: new Date(input.paymentDate),
          dueDate: new Date(input.dueDate),
          databaseId: activeDb.id,
          createdBy: ctx.user.id
        });

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_payment',
          entity: 'payments',
          databaseId: activeDb.id,
          details: `Pagamento registrado: R$ ${input.amount}`,
          status: 'success'
        });

        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pago', 'pendente', 'atrasado']).optional(),
        paymentDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const { id, ...data } = input;
        const updateData: Partial<{
          status?: 'pago' | 'pendente' | 'atrasado';
          paymentDate?: Date;
          notes?: string;
        }> = {
          status: data.status,
          notes: data.notes,
          ...(data.paymentDate && { paymentDate: new Date(data.paymentDate) })
        };
        await db.updatePayment(id, updateData);

        const activeDb = await db.getActiveDatabase();
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'update_payment',
          entity: 'payments',
          entityId: id,
          databaseId: activeDb?.id,
          details: JSON.stringify(data),
          status: 'success'
        });

        return { success: true };
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
        return await db.getVehicleById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        brand: z.string(),
        model: z.string(),
        year: z.number(),
        color: z.string().optional(),
        plate: z.string().optional(),
        chassi: z.string().optional(),
        price: z.string(),
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

        const result = await db.createVehicle({
          ...input,
          databaseId: activeDb.id,
          createdBy: ctx.user.id
        });

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
        id: z.number(),
        status: z.enum(['disponivel', 'vendido', 'reservado']).optional(),
        price: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canEdit) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para editar dados'
          });
        }

        const { id, ...data } = input;
        await db.updateVehicle(id, data);

        const activeDb = await db.getActiveDatabase();
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
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.canDelete) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Você não tem permissão para deletar dados'
          });
        }

        await db.deleteVehicle(input.id);

        const activeDb = await db.getActiveDatabase();
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
        return await db.getVehicleFinancingById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        vehicleId: z.number(),
        clientId: z.number(),
        vehiclePrice: z.string(),
        downPayment: z.string(),
        financedAmount: z.string(),
        interestRate: z.string(),
        installments: z.number(),
        installmentAmount: z.string(),
        totalAmount: z.string(),
        startDate: z.string(),
        endDate: z.string(),
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

        const result = await db.createVehicleFinancing({
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          databaseId: activeDb.id,
          createdBy: ctx.user.id
        });

        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.name || ctx.user.email || 'Usuário',
          action: 'create_vehicle_financing',
          entity: 'vehicleFinancings',
          databaseId: activeDb.id,
          details: `Financiamento criado: R$ ${input.financedAmount}`,
          status: 'success'
        });

        return result;
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

        const { id, ...data } = input;
        await db.updateVehicleFinancing(id, data);

        const activeDb = await db.getActiveDatabase();
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
          totalClients: 0
        };
      }
      return await db.getDashboardStats(activeDb.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
