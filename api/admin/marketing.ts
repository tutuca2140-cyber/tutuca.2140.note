import { getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME } from "../auth/_shared.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API = "https://api.resend.com/emails";

async function getSuperAdmin(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.email, u.name, u.role, u."isActive"
      FROM local_sessions s JOIN users u ON u.id = s."userId"
     WHERE s.token = ${token} AND s."expiresAt" > NOW() LIMIT 1
  `;
  const user = rows[0] as any;
  return user?.isActive && user.role === "super_admin" ? user : null;
}

async function ensureTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_email_logs (
      id bigserial PRIMARY KEY,
      "adminUserId" integer REFERENCES users(id) ON DELETE SET NULL,
      subject varchar(200) NOT NULL,
      segment varchar(30) NOT NULL,
      "recipientCount" integer NOT NULL DEFAULT 0,
      "sentCount" integer NOT NULL DEFAULT 0,
      "failedCount" integer NOT NULL DEFAULT 0,
      "imageUrl" text,
      "createdAt" timestamptz NOT NULL DEFAULT NOW()
    )
  `;
}

function stateFor(row: any) {
  const status = String(row.status || "").toLowerCase();
  if (status === "past_due") return "overdue";
  if (["active", "paid"].includes(status)) return "current";
  return "other";
}

async function listRecipients() {
  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.name, u.username, u.email, u.whatsapp, u."isActive",
           cs.plan, cs.status, cs."billingMethod", cs."trialEndsAt", cs."paidUntil", cs."lastPaymentStatus"
      FROM users u
      JOIN commercial_subscriptions cs ON cs."userId" = u.id
     WHERE u."loginMethod" = 'commercial_signup'
       AND u.email IS NOT NULL AND TRIM(u.email) <> ''
     ORDER BY u.name NULLS LAST, u.email
  `;
  return rows.map((row: any) => ({ ...row, marketingState: stateFor(row) }));
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch] || ch));
}

function emailHtml(name: string, subject: string, message: string, imageUrl?: string) {
  const paragraphs = escapeHtml(message).replace(/\n/g, "<br />");
  const image = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Imagem da campanha" style="display:block;width:100%;max-width:640px;height:auto;margin:0 auto 24px;border-radius:16px" />` : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:680px;background:#fff;border-radius:22px;overflow:hidden"><tr><td style="padding:28px 34px;background:#0f4c81"><img src="https://notenote.com.br/brand/note-note-logo-official.png" alt="Note Note" style="max-width:180px;height:auto" /></td></tr><tr><td style="padding:34px">${image}<div style="font-size:14px;color:#64748b;margin-bottom:10px">Olá, ${escapeHtml(name || "cliente")}.</div><h1 style="font-size:26px;line-height:1.2;margin:0 0 20px">${escapeHtml(subject)}</h1><div style="font-size:16px;line-height:1.7">${paragraphs}</div><div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b">Mensagem enviada pelo Note Note. Este é um e-mail automático; não responda a esta mensagem.</div></td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, name: string, subject: string, message: string, imageUrl?: string) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
  const from = String(process.env.MARKETING_FROM_EMAIL || process.env.PASSWORD_RESET_FROM_EMAIL || "Note Note <no-reply@notenote.com.br>").trim();
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html: emailHtml(name, subject, message, imageUrl) }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}`);
}

export default async function handler(req: any, res: any) {
  try {
    const admin = await getSuperAdmin(req);
    if (!admin) return sendJson(res, 403, { success: false, message: "Acesso exclusivo do Super Administrador." });
    await ensureTables();
    if (req.method === "GET") {
      const recipients = await listRecipients();
      return sendJson(res, 200, { success: true, recipients, summary: { total: recipients.length, current: recipients.filter((r: any) => r.marketingState === "current").length, overdue: recipients.filter((r: any) => r.marketingState === "overdue").length } });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return sendJson(res, 405, { success: false, message: "Método não permitido." }); }
    const body = await readJsonBody(req);
    const subject = String(body?.subject || "").trim().slice(0, 200);
    const message = String(body?.message || "").trim().slice(0, 10000);
    const segment = ["all", "current", "overdue", "selected"].includes(String(body?.segment)) ? String(body.segment) : "selected";
    const selectedIds = Array.isArray(body?.selectedIds) ? body.selectedIds.map(Number).filter(Number.isFinite) : [];
    const imageUrl = String(body?.imageUrl || "").trim().slice(0, 2000);
    if (!subject || !message) return sendJson(res, 400, { success: false, message: "Preencha assunto e mensagem." });
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) return sendJson(res, 400, { success: false, message: "A imagem precisa usar uma URL HTTPS pública." });
    const all = await listRecipients();
    let recipients = segment === "all" ? all : segment === "current" ? all.filter((r: any) => r.marketingState === "current") : segment === "overdue" ? all.filter((r: any) => r.marketingState === "overdue") : all.filter((r: any) => selectedIds.includes(Number(r.id)));
    recipients = recipients.filter((r: any) => EMAIL_RE.test(String(r.email || "")));
    if (!recipients.length) return sendJson(res, 400, { success: false, message: "Nenhum destinatário válido selecionado." });
    if (recipients.length > 500) return sendJson(res, 400, { success: false, message: "Por segurança, envie no máximo 500 e-mails por campanha." });
    let sent = 0; let failed = 0;
    for (const recipient of recipients) {
      try { await sendEmail(String(recipient.email), String(recipient.name || recipient.username || "cliente"), subject, message, imageUrl || undefined); sent++; }
      catch (error) { failed++; console.error("[marketing/send]", { userId: recipient.id, error: error instanceof Error ? error.message : error }); }
    }
    const sql = getSql();
    await sql`INSERT INTO marketing_email_logs ("adminUserId", subject, segment, "recipientCount", "sentCount", "failedCount", "imageUrl") VALUES (${admin.id}, ${subject}, ${segment}, ${recipients.length}, ${sent}, ${failed}, ${imageUrl || null})`;
    return sendJson(res, 200, { success: true, recipientCount: recipients.length, sent, failed });
  } catch (error) {
    console.error("[admin/marketing]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível processar a campanha." });
  }
}
