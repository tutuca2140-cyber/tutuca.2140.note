import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      const cause = error.cause;
      console.error("[tRPC] Request failed", {
        path,
        type,
        code: error.code,
        message: error.message,
        cause: cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : cause,
        stack: error.stack,
      });
    },
  })
);

export default app;
