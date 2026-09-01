import { ensureAuthUserColumns, getSql, readCookie, SESSION_COOKIE_NAME } from "../api/auth/_shared.js";

export type AdminArea = "control"|"subscriptions"|"marketing"|"support"|"users"|"databases"|"audit";
const column: Record<AdminArea,string> = { control:"adminCanControlPanel", subscriptions:"adminCanSubscriptions", marketing:"adminCanMarketing", support:"adminCanSupport", users:"adminCanUsers", databases:"adminCanDatabases", audit:"adminCanAudit" };
export async function getAuthorizedAdmin(req:any, area:AdminArea){
  await ensureAuthUserColumns();
  const token=readCookie(req,SESSION_COOKIE_NAME); if(!token)return null;
  const sql=getSql(); const rows=await sql`SELECT u.* FROM local_sessions s JOIN users u ON u.id=s."userId" WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;
  const user=rows[0] as any; if(!user?.isActive)return null;
  return user.role==="super_admin" || Boolean(user[column[area]]) ? user : null;
}
