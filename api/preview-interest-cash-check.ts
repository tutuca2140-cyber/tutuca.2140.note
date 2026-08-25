import { getSql, sendJson } from "./auth/_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" || process.env.VERCEL_ENV !== "preview" || String(req.query?.key ?? "") !== process.env.VERCEL_GIT_COMMIT_SHA) {
    return sendJson(res, 404, { success: false, message: "Not found" });
  }

  const sql = getSql();
  const marker = `PREVIEW_INTEREST_CASH_${Date.now()}`;
  try {
    const [activeDatabase] = await sql`SELECT id FROM databases WHERE "isActive" = true LIMIT 1`;
    const [actor] = await sql`SELECT id FROM users WHERE "isActive" = true AND role = 'super_admin' LIMIT 1`;
    if (!activeDatabase || !actor) throw new Error("Banco ativo ou Super Admin não encontrado.");
    const [before] = await sql`SELECT coalesce(sum("remainingBalance"), 0) AS open, coalesce(sum("accruedInterest"), 0) AS interest FROM loans WHERE "databaseId" = ${activeDatabase.id} AND status NOT IN ('pago', 'cancelado')`;
    const [client] = await sql`INSERT INTO clients ("databaseId", name, "createdBy") VALUES (${activeDatabase.id}, ${marker}, ${actor.id}) RETURNING id`;
    const [loan] = await sql`INSERT INTO loans ("databaseId", "clientId", amount, "interestType", "interestRate", "ratePeriod", installments, "installmentAmount", "totalAmount", "remainingBalance", "principalBalance", "accruedInterest", "totalPaid", "startDate", "endDate", status, description, "createdBy") VALUES (${activeDatabase.id}, ${client.id}, 1000, 'simple', 30, 'month', 1, 1300, 1300, 1300, 1000, 300, 0, NOW(), NOW() + interval '1 month', 'ativo', ${marker}, ${actor.id}) RETURNING id`;
    await sql`INSERT INTO loan_interest_history ("databaseId", "loanId", "periodReference", "previousPrincipalBalance", "interestGenerated", "updatedPrincipalBalance") VALUES (${activeDatabase.id}, ${loan.id}, 'CONTRATO_INICIAL', 1000, 300, 1000)`;
    const [automatic] = await sql`INSERT INTO cash_flow ("databaseId", type, category, description, amount, "movementDate", "clientId", "loanId", "sourceKey", "createdBy") VALUES (${activeDatabase.id}, 'SAIDA', 'LIBERACAO_EMPRESTIMO', ${marker}, 1000, NOW(), ${client.id}, ${loan.id}, ${`LOAN_RELEASE:${loan.id}`}, ${actor.id}) RETURNING id, "loanId", "sourceKey"`;
    const [manual] = await sql`INSERT INTO cash_flow ("databaseId", type, category, description, amount, "movementDate", "createdBy") VALUES (${activeDatabase.id}, 'SAIDA', 'OUTROS', ${marker}, 25, NOW(), ${actor.id}) RETURNING id`;
    await sql`DELETE FROM cash_flow WHERE id = ${manual.id} AND "databaseId" = ${activeDatabase.id} AND "sourceKey" IS NULL AND "loanId" IS NULL AND "paymentId" IS NULL AND "vehicleId" IS NULL AND "vehicleSaleId" IS NULL`;
    const manualRows = await sql`SELECT id FROM cash_flow WHERE id = ${manual.id}`;
    const [after] = await sql`SELECT coalesce(sum("remainingBalance"), 0) AS open, coalesce(sum("accruedInterest"), 0) AS interest FROM loans WHERE "databaseId" = ${activeDatabase.id} AND status NOT IN ('pago', 'cancelado')`;
    const debtDelta = Number(after.open) - Number(before.open);
    const interestDelta = Number(after.interest) - Number(before.interest);
    if (debtDelta !== 1300 || interestDelta !== 300 || manualRows.length !== 0 || !automatic.sourceKey || !automatic.loanId) throw new Error("Persistência, proteção ou exclusão divergente.");
    return sendJson(res, 200, { ok: true, checked: { principal: 1000, interest: 300, debt: 1300, cashRelease: 1000, manualDeleted: true, automaticProtected: true } });
  } catch (error) {
    console.error("[preview-interest-cash-check]", error);
    return sendJson(res, 500, { success: false, message: error instanceof Error ? error.message : "Preview check failed" });
  } finally {
    await sql`DELETE FROM cash_flow WHERE description = ${marker}`;
    await sql`DELETE FROM loan_interest_history WHERE "loanId" IN (SELECT id FROM loans WHERE description = ${marker})`;
    await sql`DELETE FROM loans WHERE description = ${marker}`;
    await sql`DELETE FROM clients WHERE name = ${marker}`;
  }
}
