import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";
import { handleAsaasWebhook } from "../server/asaas-webhook.js";
import { handleMarketing } from "../server/marketing.js";
import { handlePropertiesV2 } from "../server/properties-v2.js";
import { handleLegalConsents } from "../server/legal-consents.js";
import { handleSupportChat } from "../server/support-chat.js";
import { handleReviews } from "../server/reviews.js";
import { handleMonthlyClosings } from "../server/monthly-closings.js";

let accessTablePromise: Promise<void> | null = null;
function ensureAccessTable() { if (accessTablePromise) return accessTablePromise; const sql=getSql(); accessTablePromise=(async()=>{await sql`CREATE TABLE IF NOT EXISTS site_access_logs (id bigserial PRIMARY KEY,"userId" integer REFERENCES users(id) ON DELETE SET NULL,path varchar(500) NOT NULL,referrer varchar(1000),"ipAddress" varchar(120),"userAgent" text,"createdAt" timestamptz NOT NULL DEFAULT NOW())`;await sql`CREATE INDEX IF NOT EXISTS site_access_logs_created_idx ON site_access_logs ("createdAt" DESC)`;await sql`CREATE INDEX IF NOT EXISTS site_access_logs_user_idx ON site_access_logs ("userId", "createdAt" DESC)`;})().catch(error=>{accessTablePromise=null;throw error});return accessTablePromise;}
function cleanPath(value:unknown){const path=String(value??"/").trim();if(!path.startsWith("/"))return "/";return path.slice(0,500)||"/";}
export default async function handler(req:any,res:any){
  const scope=String(Array.isArray(req?.query?.scope)?req.query.scope[0]:req?.query?.scope??"").trim().toLowerCase();
  if(scope==="asaas-webhook")return handleAsaasWebhook(req,res);
  if(scope==="marketing")return handleMarketing(req,res);
  if(scope==="properties")return handlePropertiesV2(req,res);
  if(scope==="legal-consents")return handleLegalConsents(req,res);
  if(scope==="support")return handleSupportChat(req,res);
  if(scope==="reviews")return handleReviews(req,res);
  if(scope==="monthly-closings")return handleMonthlyClosings(req,res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return sendJson(res,405,{success:false,message:"Método não permitido."});}
  try{const body=await readJsonBody(req);const path=cleanPath(body?.path);const referrer=String(body?.referrer??"").trim().slice(0,1000)||null;const userAgent=String(req?.headers?.["user-agent"]??"").slice(0,2000)||null;const forwarded=String(req?.headers?.["x-forwarded-for"]??"");const ipAddress=(forwarded.split(",")[0]?.trim()||String(req?.socket?.remoteAddress??"")).slice(0,120)||null;await ensureAccessTable();const sql=getSql();let userId:number|null=null;const token=readCookie(req,SESSION_COOKIE_NAME);if(token){const session=await sql`SELECT u.id FROM local_sessions s JOIN users u ON u.id=s."userId" WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;if(session[0]?.id)userId=Number(session[0].id);}await sql`INSERT INTO site_access_logs ("userId",path,referrer,"ipAddress","userAgent","createdAt") VALUES (${userId},${path},${referrer},${ipAddress},${userAgent},NOW())`;return sendJson(res,201,{success:true});}catch(error){console.error("[site-access]",error);return sendJson(res,200,{success:false});}
}
