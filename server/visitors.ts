import { getAuthorizedAdmin } from "./admin-access.js";
import { getSql, sendJson } from "../api/auth/_shared.js";

function maskIp(value: unknown) {
  const ip = String(value || "");
  if (!ip) return "—";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:••••`;
  const parts = ip.split(".");
  return parts.length === 4
    ? `${parts[0]}.${parts[1]}.•••.•••`
    : "IP protegido";
}
function device(agent: unknown) {
  const ua = String(agent || "");
  const type = /mobile|android|iphone/i.test(ua)
    ? "Celular"
    : /tablet|ipad/i.test(ua)
      ? "Tablet"
      : "Computador";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /firefox/i.test(ua)
      ? "Firefox"
      : /chrome|crios/i.test(ua)
        ? "Chrome"
        : /safari/i.test(ua)
          ? "Safari"
          : "Outro";
  return { type, browser };
}
function source(value: unknown) {
  const ref = String(value || "");
  if (!ref) return "Acesso direto";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host.includes("google")) return "Google";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("facebook")) return "Facebook";
    return host;
  } catch {
    return "Outro site";
  }
}
function funnelStage(path: unknown, converted: boolean) {
  if (converted) return { stage: "converted", label: "Cadastro concluído" };
  const value = String(path || "/").toLowerCase();
  if (value.startsWith("/cadastro"))
    return { stage: "signup", label: "Parou no cadastro" };
  if (value.startsWith("/planos"))
    return { stage: "plans", label: "Parou nos planos" };
  if (value.startsWith("/login"))
    return { stage: "login", label: "Parou no login" };
  if (value === "/" || value.startsWith("/#"))
    return { stage: "home", label: "Parou na página inicial" };
  return { stage: "other", label: `Última página: ${value}` };
}

export async function handleVisitors(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, {
      success: false,
      message: "Método não permitido.",
    });
  }
  try {
    const admin = await getAuthorizedAdmin(req, "control");
    if (!admin)
      return sendJson(res, 403, {
        success: false,
        message: "Acesso restrito ao Super Admin.",
      });
    const sql = getSql();
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS "visitorId" varchar(120)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS "sessionId" varchar(120)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS city varchar(160)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS region varchar(120)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS country varchar(10)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS language varchar(50)`;
    await sql`ALTER TABLE site_access_logs ADD COLUMN IF NOT EXISTS screen varchar(40)`;
    const rows = await sql`
      SELECT COALESCE(NULLIF(a."visitorId",''),'legacy-'||a.id::text) AS "visitorId",
        MIN(a."createdAt") AS "firstSeen",MAX(a."createdAt") AS "lastSeen",COUNT(*)::int AS "pageViews",
        COUNT(DISTINCT COALESCE(a."sessionId",a.id::text))::int AS sessions,
        array_agg(DISTINCT a.path ORDER BY a.path) AS pages,
        (array_agg(a.path ORDER BY a."createdAt" DESC))[1] AS "lastPath",
        (array_agg(a.referrer ORDER BY a."createdAt") FILTER (WHERE a.referrer IS NOT NULL))[1] AS referrer,
        (array_agg(a."ipAddress" ORDER BY a."createdAt" DESC))[1] AS "ipAddress",
        (array_agg(a."userAgent" ORDER BY a."createdAt" DESC))[1] AS "userAgent",
        (array_agg(a.city ORDER BY a."createdAt" DESC) FILTER (WHERE a.city IS NOT NULL))[1] AS city,
        (array_agg(a.region ORDER BY a."createdAt" DESC) FILTER (WHERE a.region IS NOT NULL))[1] AS region,
        (array_agg(a.country ORDER BY a."createdAt" DESC) FILTER (WHERE a.country IS NOT NULL))[1] AS country,
        (array_agg(a.language ORDER BY a."createdAt" DESC) FILTER (WHERE a.language IS NOT NULL))[1] AS language,
        (array_agg(a.screen ORDER BY a."createdAt" DESC) FILTER (WHERE a.screen IS NOT NULL))[1] AS screen,
        MAX(u.name) AS name,MAX(u.username) AS username,MAX(u.email) AS email
      FROM site_access_logs a LEFT JOIN users u ON u.id=a."userId"
      WHERE a."createdAt">=NOW()-interval '30 days'
      GROUP BY COALESCE(NULLIF(a."visitorId",''),'legacy-'||a.id::text)
      ORDER BY MAX(a."createdAt") DESC LIMIT 500`;
    const visitors = rows.map((row: any, index: number) => {
      const info = device(row.userAgent);
      const minutes = Math.max(
        0,
        Math.round(
          (new Date(row.lastSeen).getTime() -
            new Date(row.firstSeen).getTime()) /
            60000
        )
      );
      const converted = Boolean(row.name || row.username || row.email);
      const stop = funnelStage(row.lastPath, converted);
      return {
        ...row,
        ...stop,
        label:
          row.name ||
          row.username ||
          `Visitante #${String(row.visitorId).replace(/-/g, "").slice(-6).toUpperCase()}`,
        anonymous: !converted,
        converted,
        maskedIp: maskIp(row.ipAddress),
        device: info.type,
        browser: info.browser,
        source: source(row.referrer),
        durationMinutes: minutes,
        rank: index + 1,
        ipAddress: undefined,
        userAgent: undefined,
      };
    });
    const stages = visitors.reduce((result: any, visitor: any) => {
      result[visitor.stage] = (result[visitor.stage] || 0) + 1;
      return result;
    }, {});
    return sendJson(res, 200, {
      success: true,
      visitors,
      summary: {
        total: visitors.length,
        anonymous: visitors.filter((v: any) => v.anonymous).length,
        converted: visitors.filter((v: any) => v.converted).length,
        online: visitors.filter(
          (v: any) =>
            Date.now() - new Date(v.lastSeen).getTime() < 10 * 60 * 1000
        ).length,
        stages,
      },
    });
  } catch (error) {
    console.error("[visitors]", error);
    return sendJson(res, 500, {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os visitantes.",
    });
  }
}
