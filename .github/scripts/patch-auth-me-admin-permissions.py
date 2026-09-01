from pathlib import Path

p=Path('api/auth/me.ts')
s=p.read_text()
old='''        u."canGenerateReports",
        u."canAccessSettings",
        u."dashboardOnly",'''
new='''        u."canGenerateReports",
        u."canAccessSettings",
        u."canAdminControl",
        u."canAdminSubscriptions",
        u."canAdminMarketing",
        u."canAdminSupport",
        u."canAdminDatabases",
        u."canAdminAudit",
        u."dashboardOnly",'''
if new not in s:
    if old not in s: raise SystemExit('auth/me permission insertion point not found')
    s=s.replace(old,new,1)
p.write_text(s)

# Enforce delegated permissions on tRPC administrative database/audit procedures.
p=Path('server/routers.ts')
s=p.read_text()
old='''const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Acesso negado. Apenas administradores podem acessar este recurso.",
    });
  }
  return next({ ctx });
});'''
new='''const adminProcedure = protectedProcedure.use(({ ctx, next, path }) => {
  if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Acesso negado. Apenas administradores podem acessar este recurso.",
    });
  }
  if (ctx.user.role === "admin") {
    if (path.startsWith("databases.") && !ctx.user.canAdminDatabases) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui autorização administrativa para Bancos de Dados." });
    }
    if (path.startsWith("audit.") && !ctx.user.canAdminAudit) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não possui autorização administrativa para Auditoria." });
    }
  }
  return next({ ctx });
});'''
if new not in s:
    if old not in s: raise SystemExit('adminProcedure insertion point not found')
    s=s.replace(old,new,1)
p.write_text(s)
