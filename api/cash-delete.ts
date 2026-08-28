import {
  ensureAuthUserColumns,
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

async function getUser(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT
      u.id, u.username, u.email, u.role, u."loginMethod", u."accountOwnerId",
      u."canDeleteCashFlow", u."isActive"
    FROM local_sessions s
    JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token}
      AND s."expiresAt" > NOW()
    LIMIT 1
  `;
  const user = rows[0] as any;
  return user?.isActive ? user : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { success: false, message: "Método não permitido." });
  }

  try {
    await ensureAuthUserColumns();
    const user = await getUser(req);
    if (!user) {
      return sendJson(res, 401, { success: false, message: "Sessão inválida ou expirada." });
    }

    const body = await readJsonBody(req);
    const id = Number(body?.id);
    const reason = String(body?.reason ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || reason.length < 3) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe um lançamento válido e uma observação com pelo menos 3 caracteres.",
      });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT cf.id, cf."databaseId", cf.description, d."createdBy"
      FROM cash_flow cf
      JOIN databases d ON d.id = cf."databaseId"
      WHERE cf.id = ${id}
      LIMIT 1
    `;
    const movement = rows[0] as any;
    if (!movement) {
      return sendJson(res, 404, { success: false, message: "Lançamento não encontrado." });
    }

    if (user.role !== "super_admin") {
      const access = await sql`
        SELECT id FROM user_database_access
        WHERE "userId" = ${user.id} AND "databaseId" = ${movement.databaseId}
        LIMIT 1
      `;
      if (!access[0]) {
        return sendJson(res, 403, { success: false, message: "Você não tem acesso a este banco." });
      }

      const isCommercialOwner =
        user.loginMethod === "commercial_signup" &&
        Number(movement.createdBy) === Number(user.id);
      const isAuthorizedSubuser =
        user.loginMethod === "commercial_subuser" &&
        Number(user.accountOwnerId) === Number(movement.createdBy) &&
        Boolean(user.canDeleteCashFlow);

      if (!isCommercialOwner && !isAuthorizedSubuser) {
        return sendJson(res, 403, {
          success: false,
          message: "O contratante não liberou permissão para apagar lançamentos do caixa.",
        });
      }
    }

    await sql`DELETE FROM cash_flow WHERE id = ${id}`;
    await sql`
      INSERT INTO "auditLogs"
        ("userId", username, action, entity, "entityId", "databaseId", details, status, "createdAt")
      VALUES (
        ${user.id},
        ${user.username || user.email || "Usuário"},
        'delete_cash_flow',
        'cash_flow',
        ${id},
        ${movement.databaseId},
        ${JSON.stringify({ reason, description: movement.description })},
        'success',
        NOW()
      )
    `;

    return sendJson(res, 200, {
      success: true,
      message: "Lançamento removido do caixa.",
    });
  } catch (error) {
    console.error("[cash-delete]", error);
    return sendJson(res, 500, {
      success: false,
      message: "Não foi possível excluir o lançamento do caixa.",
    });
  }
}
