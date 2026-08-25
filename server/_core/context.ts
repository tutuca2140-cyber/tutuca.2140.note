import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { diagnoseCriticalSchema } from "../db";
import { ensurePreviewBusinessSchema } from "../bootstrap-schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  await ensurePreviewBusinessSchema();
  await diagnoseCriticalSchema();
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    console.error("[tRPC] Authentication context failed", error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
