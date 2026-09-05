import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { neon } from "@neondatabase/serverless";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

type PaymentState = {
  commercial: boolean;
  active: boolean;
  status: string | null;
  plan?: string | null;
};

const paymentStateCache = new Map<
  number,
  { expiresAt: number; value: PaymentState }
>();

async function getPaymentState(userId: number): Promise<PaymentState> {
  const cached = paymentStateCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { commercial: false, active: true, status: null };
  }

  const sql = neon(databaseUrl);
  const rows = await sql`
    SELECT
      u."loginMethod",
      COALESCE(owner_sub.plan, parent_sub.plan) AS plan,
      COALESCE(owner_sub.status, parent_sub.status) AS status
    FROM users u
    LEFT JOIN commercial_subscriptions owner_sub
      ON owner_sub."userId" = u.id
    LEFT JOIN commercial_subscriptions parent_sub
      ON parent_sub."userId" = u."accountOwnerId"
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const row = rows[0] as any;
  const loginMethod = String(row?.loginMethod || "");
  const commercial =
    loginMethod === "commercial_signup" || loginMethod === "commercial_subuser";
  const status = row?.status == null ? null : String(row.status);
  const active = !commercial || status === "active" || status === "paid";
  const value = { commercial, active, status, plan: row?.plan };
  paymentStateCache.set(userId, { expiresAt: Date.now() + 5_000, value });
  return value;
}

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const dashboardAllowed =
    path.startsWith("dashboard.") ||
    ["databases.list", "databases.getActive", "databases.setActive"].includes(
      path
    );

  if (ctx.user.role !== "super_admin") {
    const payment = await getPaymentState(ctx.user.id);
    if (payment.plan === "barber" && !path.startsWith("auth."))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seu plano dá acesso à área de Barbearia.",
      });
    if (payment.commercial && !payment.active && !dashboardAllowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Sistema aguardando pagamento. Regularize sua assinatura para voltar a utilizar esta área.",
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
