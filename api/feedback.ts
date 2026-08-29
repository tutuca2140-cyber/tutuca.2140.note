import {
  ensureAuthUserColumns,
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "./auth/_shared.js";

async function getAuthenticatedUser(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;

  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.name, u.email, u.role, u."isActive"
    FROM local_sessions s
    INNER JOIN users u ON u.id = s."userId"
    WHERE s.token = ${token}
      AND s."expiresAt" > NOW()
    LIMIT 1
  `;

  const user = rows[0] as any;
  return user?.isActive ? user : null;
}

export default async function handler(req: any, res: any) {
  try {
    await ensureAuthUserColumns();
    const sql = getSql();
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return sendJson(res, 401, { success: false, message: "Não autenticado." });
    }

    if (req.method === "GET") {
      if (String(req.query?.admin ?? "") === "true") {
        if (user.role !== "super_admin") {
          return sendJson(res, 403, { success: false, message: "Acesso restrito ao Super Administrador." });
        }

        const feedback = await sql`
          SELECT
            f.id,
            f.rating,
            f.comment,
            f."createdAt",
            u.id AS "userId",
            u.name AS "userName",
            u.username,
            u.email
          FROM user_feedback f
          INNER JOIN users u ON u.id = f."userId"
          ORDER BY f.rating DESC, COALESCE(u.name, u.username, u.email) ASC, f."createdAt" DESC
        `;

        return sendJson(res, 200, { success: true, feedback });
      }

      const rows = await sql`
        SELECT
          u."loginCount",
          u."feedbackSubmitted",
          f.rating,
          f.comment
        FROM users u
        LEFT JOIN user_feedback f ON f."userId" = u.id
        WHERE u.id = ${user.id}
        LIMIT 1
      `;

      const state = rows[0] as any;
      return sendJson(res, 200, {
        success: true,
        shouldShowFeedback:
          user.role !== "super_admin" &&
          Number(state?.loginCount || 0) >= 3 &&
          !state?.feedbackSubmitted,
        feedbackSubmitted: Boolean(state?.feedbackSubmitted),
      });
    }

    if (req.method === "POST") {
      if (user.role === "super_admin") {
        return sendJson(res, 400, { success: false, message: "O Super Administrador não participa desta avaliação." });
      }

      const body = await readJsonBody(req);
      const rating = Number(body?.rating);
      const comment = String(body?.comment ?? "").trim();

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return sendJson(res, 400, { success: false, message: "Selecione uma avaliação de 1 a 5 estrelas." });
      }

      if (comment.length > 200) {
        return sendJson(res, 400, { success: false, message: "O comentário deve ter no máximo 200 caracteres." });
      }

      const eligibility = await sql`
        SELECT "loginCount", "feedbackSubmitted"
        FROM users
        WHERE id = ${user.id}
        LIMIT 1
      `;
      const state = eligibility[0] as any;

      if (Number(state?.loginCount || 0) < 3) {
        return sendJson(res, 403, { success: false, message: "A avaliação será liberada no terceiro login." });
      }

      if (state?.feedbackSubmitted) {
        return sendJson(res, 409, { success: false, message: "Sua avaliação já foi enviada." });
      }

      await sql`
        INSERT INTO user_feedback ("userId", rating, comment)
        VALUES (${user.id}, ${rating}, ${comment || null})
        ON CONFLICT ("userId") DO UPDATE
        SET rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            "updatedAt" = NOW()
      `;

      await sql`
        UPDATE users
        SET "feedbackSubmitted" = true, "updatedAt" = NOW()
        WHERE id = ${user.id}
      `;

      return sendJson(res, 200, { success: true, message: "Obrigado pela sua avaliação!" });
    }

    return sendJson(res, 405, { success: false, message: "Método não permitido" });
  } catch (error) {
    console.error("[feedback]", error);
    return sendJson(res, 500, { success: false, message: "Não foi possível processar a avaliação." });
  }
}
