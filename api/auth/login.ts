import bcrypt from "bcrypt";
import {
  getSql,
  makeSessionToken,
  readJsonBody,
  sendJson,
  setSessionCookie,
} from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, message: "Método não permitido" });
  }

  try {
    const body = await readJsonBody(req);
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    const rememberMe = Boolean(body?.rememberMe);

    if (!username || !password) {
      return sendJson(res, 400, {
        success: false,
        message: "Informe usuário e senha.",
      });
    }

    const sql = getSql();

    const rows = await sql`
      SELECT
        id,
        username,
        "passwordHash",
        name,
        email,
        role,
        "canView",
        "canInsert",
        "canEdit",
        "canDelete",
        "canGenerateReports",
        "canAccessSettings",
        "isActive"
      FROM users
      WHERE lower(username) = lower(${username})
      LIMIT 1
    `;

    const user = rows[0] as any;

    if (!user?.passwordHash) {
      return sendJson(res, 401, {
        success: false,
        message: "Usuário ou senha inválidos.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return sendJson(res, 401, {
        success: false,
        message: "Usuário ou senha inválidos.",
      });
    }

    if (!user.isActive) {
      return sendJson(res, 403, {
        success: false,
        message: "Usuário desativado.",
      });
    }

    // Draco permanece protegido como super administrador.
    if (String(user.username).toLowerCase() === "draco") {
      await sql`
        UPDATE users
        SET
          role = 'super_admin',
          "canView" = true,
          "canInsert" = true,
          "canEdit" = true,
          "canDelete" = true,
          "canGenerateReports" = true,
          "canAccessSettings" = true,
          "isActive" = true,
          "updatedAt" = NOW(),
          "lastSignedIn" = NOW()
        WHERE id = ${user.id}
      `;
    } else {
      await sql`
        UPDATE users
        SET "lastSignedIn" = NOW(), "updatedAt" = NOW()
        WHERE id = ${user.id}
      `;
    }

    const token = makeSessionToken();
    const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await sql`DELETE FROM local_sessions WHERE "expiresAt" <= NOW()`;

    await sql`
      INSERT INTO local_sessions ("userId", token, "expiresAt")
      VALUES (${user.id}, ${token}, ${expiresAt})
    `;

    setSessionCookie(res, token, maxAgeSeconds);

    return sendJson(res, 200, {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role:
          String(user.username).toLowerCase() === "draco"
            ? "super_admin"
            : user.role,
      },
    });
  } catch (error) {
    console.error("[auth/login]", error);
    return sendJson(res, 500, {
      success: false,
      message: "Não foi possível realizar o login.",
    });
  }
}
