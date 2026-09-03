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
import { handleVisitors } from "../server/visitors.js";

let accessTablePromise: Promise<void> | null = null;
function ensureAccessTable() { if (accessTablePromise) return accessTablePromise; const sql=getSql(); accessTablePromise=(async()=>{await sql`CREATE TABLE IF NOT EXISTS site_access_logs (id bigserial PRIMARY KEY,"userId" integer REFERENCES users(id) ON DELETE SET NULL,path varchar(500) NOT NULL,referrer varchar(1000),"ipAddress" varchar(120),"userAgent" text,"visitorId" varchar(120),"sessionId" varchar(120),city varchar(160),region varchar(120),country varchar(10),language varchar(50),screen varchar(40),"createdAt" timestamptz NOT NULL DEFAULT NOW())`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS "visitorId" varchar(120)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS "sessionId" varchar(120)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS city varchar(160)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS region varchar(120)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS country varchar(10)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS language varchar(50)`;await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS screen varchar(40)`;await sql`CREATE INDEX IF NOT EXISTS site_access_logs_created_idx ON site_access_logs ("createdAt" DESC)`;await sql`CREATE INDEX IF NOT EXISTS site_access_logs_user_idx ON site_access_logs ("userId", "createdAt" DESC)`;await sql`CREATE INDEX IF NOT EXISTS site_access_logs_visitor_idx ON site_access_logs ("visitorId", "createdAt" DESC)`;})().catch(error=>{accessTablePromise=null;throw error});return accessTablePromise;}
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
  if(scope==="visitors")return handleVisitors(req,res);
  if(req.method!=="POST"){res.setHeader("Allow","POST");return sendJson(res,405,{success:false,message:"Método não permitido."});}
  try{const body=await readJsonBody(req);const path=cleanPath(body?.path);const referrer=String(body?.referrer??"").trim().slice(0,1000)||null;const userAgent=String(req?.headers?.["user-agent"]??"").slice(0,2000)||null;const forwarded=String(req?.headers?.["x-forwarded-for"]??"");const ipAddress=(forwarded.split(",")[0]?.trim()||String(req?.socket?.remoteAddress??"")).slice(0,120)||null;const visitorId=String(body?.visitorId??"").trim().slice(0,120)||null;const sessionId=String(body?.sessionId??"").trim().slice(0,120)||null;const language=String(body?.language??"").trim().slice(0,50)||null;const screen=String(body?.screen??"").trim().slice(0,40)||null;const city=decodeURIComponent(String(req?.headers?.["x-vercel-ip-city"]??"")).slice(0,160)||null;const region=String(req?.headers?.["x-vercel-ip-country-region"]??"").slice(0,120)||null;const country=String(req?.headers?.["x-vercel-ip-country"]??"").slice(0,10)||null;await ensureAccessTable();const sql=getSql();let userId:number|null=null;const token=readCookie(req,SESSION_COOKIE_NAME);if(token){const session=await sql`SELECT u.id FROM local_sessions s JOIN users u ON u.id=s."userId" WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;if(session[0]?.id)userId=Number(session[0].id);}await sql`INSERT INTO site_access_logs ("userId",path,referrer,"ipAddress","userAgent","visitorId","sessionId",city,region,country,language,screen,"createdAt") VALUES (${userId},${path},${referrer},${ipAddress},${userAgent},${visitorId},${sessionId},${city},${region},${country},${language},${screen},NOW())`;return sendJson(res,201,{success:true});}catch(error){console.error("[site-access]",error);return sendJson(res,200,{success:false});}
}
