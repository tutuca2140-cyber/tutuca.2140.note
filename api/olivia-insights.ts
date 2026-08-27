import { getSql, readCookie, sendJson, SESSION_COOKIE_NAME } from "./auth/_shared";

async function getContext(req: any) {
  const sql = getSql();
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.name,u.username,u.role,u."isActive",u."oliviaEnabled",u."canView",u."dashboardOnly"
    FROM local_sessions s JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">now() LIMIT 1
  `;
  const user = rows[0] as any;
  if (!user?.isActive) return null;
  if (user.role !== "super_admin" && user.oliviaEnabled !== true) return null;
  let database: any;
  if (user.role === "super_admin") {
    const dbs = await sql`SELECT id,name FROM databases WHERE "isActive"=true LIMIT 1`;
    database = dbs[0];
  } else {
    const dbs = await sql`
      SELECT d.id,d.name FROM user_database_access uda JOIN databases d ON d.id=uda."databaseId"
      WHERE uda."userId"=${user.id} AND uda."isActive"=true LIMIT 1
    `;
    database = dbs[0];
  }
  return database ? { user, database } : null;
}

function riskLabel(score: number) {
  return score >= 70 ? "alto" : score >= 40 ? "moderado" : "baixo";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método não permitido." });
  }
  try {
    const context = await getContext(req);
    if (!context) return sendJson(res, 403, { error: "Acesso à Olivia não autorizado." });
    if (!context.user.canView && context.user.role !== "super_admin") {
      return sendJson(res, 403, { error: "Sua conta não possui permissão para consultar análises operacionais." });
    }
    const sql = getSql();
    const dbId = context.database.id;

    const [forecast, portfolio, clientRisk] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(CAST(amount AS numeric)) FILTER (WHERE status IN ('pendente','atrasado') AND "dueDate">=CURRENT_DATE AND "dueDate"<CURRENT_DATE+INTERVAL '30 days'),0) AS next30,
          COALESCE(SUM(CAST(amount AS numeric)) FILTER (WHERE status='atrasado'),0) AS overdue,
          COUNT(*) FILTER (WHERE status='atrasado')::int AS overdue_count
        FROM payments WHERE "databaseId"=${dbId}
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status='ativo')::int AS active_loans,
          COALESCE(SUM(CAST("remainingBalance" AS numeric)) FILTER (WHERE status IN ('ativo','atrasado')),0) AS loan_balance
        FROM loans WHERE "databaseId"=${dbId}
      `,
      sql`
        SELECT c.id,c.name,
          COUNT(p.id)::int AS payments,
          COUNT(p.id) FILTER (WHERE p.status='atrasado')::int AS overdue_payments,
          COALESCE(SUM(CAST(p.amount AS numeric)) FILTER (WHERE p.status='atrasado'),0) AS overdue_amount,
          COALESCE(AVG(GREATEST(EXTRACT(EPOCH FROM (p."paymentDate"-p."dueDate"))/86400,0)) FILTER (WHERE p.status='pago'),0) AS avg_delay_days
        FROM clients c
        LEFT JOIN loans l ON l."clientId"=c.id AND l."databaseId"=${dbId}
        LEFT JOIN payments p ON p."loanId"=l.id AND p."databaseId"=${dbId}
        WHERE c."databaseId"=${dbId}
        GROUP BY c.id,c.name
        HAVING COUNT(p.id)>0
        ORDER BY overdue_payments DESC, overdue_amount DESC
        LIMIT 40
      `,
    ]);

    const risks = (clientRisk as any[]).map(row => {
      const payments = Number(row.payments || 0);
      const overdue = Number(row.overdue_payments || 0);
      const overdueRate = payments ? overdue / payments : 0;
      const avgDelay = Number(row.avg_delay_days || 0);
      const score = Math.max(0, Math.min(100, Math.round(overdueRate * 65 + Math.min(avgDelay, 30) / 30 * 35)));
      const reasons: string[] = [];
      if (overdue) reasons.push(`${overdue} pagamento(s) em atraso`);
      if (overdueRate >= 0.3) reasons.push(`${Math.round(overdueRate * 100)}% dos pagamentos registrados estão atrasados`);
      if (avgDelay >= 3) reasons.push(`atraso médio histórico de ${avgDelay.toFixed(1)} dias`);
      return {
        clientId: row.id,
        clientName: row.name,
        score,
        level: riskLabel(score),
        overdueAmount: Number(row.overdue_amount || 0),
        reasons,
      };
    });

    return sendJson(res, 200, {
      databaseName: context.database.name,
      forecast: forecast[0],
      portfolio: portfolio[0],
      clientRisk: context.user.dashboardOnly ? [] : risks,
      methodology: "Indicador informativo baseado em frequência de atrasos e atraso médio. Não é decisão de crédito e não executa nenhuma ação automaticamente.",
    });
  } catch (error) {
    console.error("[Olivia Insights]", error);
    return sendJson(res, 500, { error: "Não foi possível gerar os indicadores agora." });
  }
}
