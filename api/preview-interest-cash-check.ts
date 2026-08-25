import { runPreviewInterestCashDeleteCheck } from "../server/db.js";
import { sendJson } from "./auth/_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" || process.env.VERCEL_ENV !== "preview" || String(req.query?.key ?? "") !== process.env.VERCEL_GIT_COMMIT_SHA) {
    return sendJson(res, 404, { success: false, message: "Not found" });
  }
  try {
    return sendJson(res, 200, await runPreviewInterestCashDeleteCheck());
  } catch (error) {
    console.error("[preview-interest-cash-check]", error);
    return sendJson(res, 500, { success: false, message: error instanceof Error ? error.message : "Preview check failed" });
  }
}
