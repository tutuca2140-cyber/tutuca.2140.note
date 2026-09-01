from pathlib import Path


def patch(path, old, new, count=1):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f'pattern not found: {path}: {old[:120]}')
    p.write_text(s.replace(old,new,count))

# 1) Schema + runtime columns
patch('drizzle/schema.ts',
'  canAccessSettings: boolean("canAccessSettings").default(false).notNull(),\n  dashboardOnly: boolean("dashboardOnly").default(false).notNull(),',
'  canAccessSettings: boolean("canAccessSettings").default(false).notNull(),\n  // Autorizações administrativas delegadas pelo Super Admin\n  canAdminControl: boolean("canAdminControl").default(false).notNull(),\n  canAdminSubscriptions: boolean("canAdminSubscriptions").default(false).notNull(),\n  canAdminMarketing: boolean("canAdminMarketing").default(false).notNull(),\n  canAdminSupport: boolean("canAdminSupport").default(false).notNull(),\n  canAdminDatabases: boolean("canAdminDatabases").default(true).notNull(),\n  canAdminAudit: boolean("canAdminAudit").default(true).notNull(),\n  dashboardOnly: boolean("dashboardOnly").default(false).notNull(),')

patch('api/auth/_shared.ts',
'    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "supportId" varchar(9)`;',
'    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "supportId" varchar(9)`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminControl" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminSubscriptions" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminMarketing" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminSupport" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminDatabases" boolean DEFAULT true NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "canAdminAudit" boolean DEFAULT true NOT NULL`;')

# 2) Users router inputs + audit data
for marker in [
'          canAccessSettings: z.boolean().default(false),\n          dashboardOnly:',
'          canAccessSettings: z.boolean(),\n          dashboardOnly:'
]:
    if marker in Path('server/routers.ts').read_text():
        repl = marker.replace('          dashboardOnly:', '          canAdminControl: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          canAdminSubscriptions: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          canAdminMarketing: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          canAdminSupport: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          canAdminDatabases: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          canAdminAudit: z.boolean()' + ('.default(false),' if '.default(false)' in marker else ',') + '\n          dashboardOnly:')
        patch('server/routers.ts', marker, repl)

# add delegated fields in create audit permissions object
patch('server/routers.ts',
'              canAccessSettings: input.canAccessSettings,\n            },',
'              canAccessSettings: input.canAccessSettings,\n              canAdminControl: input.canAdminControl,\n              canAdminSubscriptions: input.canAdminSubscriptions,\n              canAdminMarketing: input.canAdminMarketing,\n              canAdminSupport: input.canAdminSupport,\n              canAdminDatabases: input.canAdminDatabases,\n              canAdminAudit: input.canAdminAudit,\n            },')

# 3) Admin user creation UI
p=Path('client/src/pages/admin/Usuarios.tsx'); s=p.read_text()
s=s.replace('type Permissions = Record<PermissionKey, boolean>;\ntype Draft = Permissions & {', 'type Permissions = Record<PermissionKey, boolean>;\ntype AdminPermissionKey = "canAdminControl" | "canAdminSubscriptions" | "canAdminMarketing" | "canAdminSupport" | "canAdminDatabases" | "canAdminAudit";\ntype Draft = Permissions & Record<AdminPermissionKey, boolean> & {')
s=s.replace('const permissionsForRole = (role: Draft["role"]): Permissions =>', 'const adminPermissionOptions: Array<{ key: AdminPermissionKey; label: string; description: string }> = [\n  { key: "canAdminControl", label: "Painel de Controle", description: "Visualizar indicadores gerais, acessos e usuários consolidados." },\n  { key: "canAdminSubscriptions", label: "Assinaturas", description: "Consultar assinaturas e executar ações operacionais permitidas. Cancelamentos e exclusões protegidas continuam exclusivos do Super Admin." },\n  { key: "canAdminMarketing", label: "Marketing", description: "Consultar destinatários autorizados e enviar campanhas de e-mail." },\n  { key: "canAdminSupport", label: "Suporte", description: "Receber, responder, encerrar e reabrir atendimentos dos assinantes." },\n  { key: "canAdminDatabases", label: "Bancos de Dados", description: "Acessar a administração de bancos permitida ao perfil administrador." },\n  { key: "canAdminAudit", label: "Auditoria", description: "Consultar registros de auditoria e histórico administrativo." },\n];\n\nconst permissionsForRole = (role: Draft["role"]): Permissions =>')
s=s.replace('  dashboardOnly: false,\n  ...permissionsForRole("user"),', '  dashboardOnly: false,\n  canAdminControl: false,\n  canAdminSubscriptions: false,\n  canAdminMarketing: false,\n  canAdminSupport: false,\n  canAdminDatabases: false,\n  canAdminAudit: false,\n  ...permissionsForRole("user"),')
s=s.replace('      canAccessSettings: user.canAccessSettings,\n      databaseIds:', '      canAccessSettings: user.canAccessSettings,\n      canAdminControl: Boolean(user.canAdminControl),\n      canAdminSubscriptions: Boolean(user.canAdminSubscriptions),\n      canAdminMarketing: Boolean(user.canAdminMarketing),\n      canAdminSupport: Boolean(user.canAdminSupport),\n      canAdminDatabases: Boolean(user.canAdminDatabases),\n      canAdminAudit: Boolean(user.canAdminAudit),\n      databaseIds:')
s=s.replace('onValueChange={(role: Draft["role"]) => setDraft({ ...draft, role, dashboardOnly: false, ...permissionsForRole(role) })}', 'onValueChange={(role: Draft["role"]) => setDraft({ ...draft, role, dashboardOnly: false, ...permissionsForRole(role), ...(role === "user" ? { canAdminControl:false, canAdminSubscriptions:false, canAdminMarketing:false, canAdminSupport:false, canAdminDatabases:false, canAdminAudit:false } : {}) })}')
insert='''\n                {draft.role === "admin" && !draft.dashboardOnly && (\n                  <section className="space-y-4 border-t pt-5">\n                    <div className="flex items-start gap-3">\n                      <div className="rounded-lg bg-primary/10 p-2 text-primary"><Shield className="h-5 w-5" /></div>\n                      <div><h3 className="font-semibold">Autorizações administrativas delegadas</h3><p className="text-sm text-muted-foreground">Escolha quais áreas da Administração este usuário da equipe poderá acessar. O gerenciamento de usuários e ações protegidas por senha do Super Admin não são delegáveis.</p></div>\n                    </div>\n                    <div className="grid gap-3 sm:grid-cols-2">\n                      {adminPermissionOptions.map(permission => (\n                        <div key={permission.key} className="flex min-w-0 items-start justify-between gap-4 rounded-xl border bg-card p-4">\n                          <Label htmlFor={`admin-permission-${permission.key}`} className="min-w-0 cursor-pointer leading-normal">\n                            <span className="block font-medium">{permission.label}</span>\n                            <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{permission.description}</span>\n                          </Label>\n                          <Switch id={`admin-permission-${permission.key}`} checked={draft[permission.key]} onCheckedChange={checked => setDraft(current => ({ ...current, [permission.key]: checked }))} aria-label={permission.label} />\n                        </div>\n                      ))}\n                    </div>\n                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Segurança:</strong> Usuários, exclusão de contas, cancelamentos protegidos e alterações de permissões continuam exclusivos do Super Admin.</div>\n                  </section>\n                )}\n'''
needle='''                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">'''
if 'Autorizações administrativas delegadas' not in s:
    if needle not in s: raise SystemExit('Usuarios admin permissions insertion point missing')
    s=s.replace(needle,insert+'\n'+needle,1)
p.write_text(s)

# 4) Sidebar delegated access
p=Path('client/src/components/DashboardLayout.tsx'); s=p.read_text()
s=s.replace('  const isSuperAdmin = user?.role === "super_admin";\n  const regularAccess', '  const isSuperAdmin = user?.role === "super_admin";\n  const delegatedAdmin = user?.role === "admin";\n  const hasAdminArea = Boolean(isSuperAdmin || (delegatedAdmin && (user?.canAdminControl || user?.canAdminSubscriptions || user?.canAdminMarketing || user?.canAdminSupport || user?.canAdminDatabases || user?.canAdminAudit || user?.canAccessSettings)));\n  const regularAccess')
s=s.replace('{ name: "Painel de Controle", href: "/admin/controle", icon: Activity, show: isSuperAdmin },', '{ name: "Painel de Controle", href: "/admin/controle", icon: Activity, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminControl)) },')
s=s.replace('{ name: "Assinaturas", href: "/admin/assinaturas", icon: CreditCard, show: isSuperAdmin },', '{ name: "Assinaturas", href: "/admin/assinaturas", icon: CreditCard, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminSubscriptions)) },')
s=s.replace('{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: isSuperAdmin },', '{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminMarketing)) },')
s=s.replace('{ name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: isSuperAdmin },', '{ name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminSupport)) },')
s=s.replace('{ name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: Boolean(isAdmin) },', '{ name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminDatabases)) },')
s=s.replace('{ name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: Boolean(isAdmin) },', '{ name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: Boolean(isSuperAdmin || (delegatedAdmin && user?.canAdminAudit)) },')
s=s.replace('{(isAdmin || user?.canAccessSettings) && <>', '{hasAdminArea && <>')
p.write_text(s)

# 5) Commercial accounts: support ID + delegated subscriptions access
p=Path('api/admin/commercial-accounts.ts'); s=p.read_text()
s=s.replace('  getSql,\n  readCookie,', '  ensureAuthUserColumns,\n  getSql,\n  readCookie,')
s=s.replace('async function ensureTables() {\n  const sql = getSql();', 'async function ensureTables() {\n  await ensureAuthUserColumns();\n  const sql = getSql();')
s=s.replace('SELECT u.id, u.username, u.email, u.name, u.role, u."isActive", u."passwordHash"', 'SELECT u.id, u.username, u.email, u.name, u.role, u."isActive", u."passwordHash", u."canAdminSubscriptions"')
s=s.replace('if (!user?.isActive || user.role !== "super_admin") return null;', 'if (!user?.isActive || !(user.role === "super_admin" || (user.role === "admin" && user.canAdminSubscriptions))) return null;')
s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",', 'u.id, u.username, u.name, u.email, u.whatsapp, u."supportId", u."isActive", u."createdAt", u."lastSignedIn",')
s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan', 'u.id, u.username, u.name, u.email, u.whatsapp, u."supportId", u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan')
# secure actions stay super-admin only
s=s.replace('async function verifyAdminPassword(admin: any, password: string) {\n  if (!password || !admin.passwordHash) {', 'async function verifyAdminPassword(admin: any, password: string) {\n  if (admin.role !== "super_admin") {\n    throw Object.assign(new Error("Esta ação protegida é exclusiva do Super Administrador."), { statusCode: 403 });\n  }\n  if (!password || !admin.passwordHash) {')
p.write_text(s)

# Assinaturas frontend support ID + delegated guard + protected buttons only super admin
p=Path('client/src/pages/admin/Assinaturas.tsx'); s=p.read_text()
s=s.replace('  id: number;\n  username:', '  id: number;\n  supportId?: string | null;\n  username:')
s=s.replace('    "ID",\n    "Nome completo",', '    "ID interno",\n    "ID de usuário (9 dígitos)",\n    "Nome completo",')
s=s.replace('    account.id,\n    account.name || account.username,', '    account.id,\n    account.supportId || "",\n    account.name || account.username,')
s=s.replace('if (!authLoading && user && user.role !== "super_admin") navigate("/dashboard", { replace: true });', 'if (!authLoading && user && !(user.role === "super_admin" || (user.role === "admin" && user.canAdminSubscriptions))) navigate("/dashboard", { replace: true });')
s=s.replace('useEffect(() => { if (user?.role === "super_admin") void load(); }, [user?.role]);', 'useEffect(() => { if (user?.role === "super_admin" || (user?.role === "admin" && user?.canAdminSubscriptions)) void load(); }, [user?.role, user?.canAdminSubscriptions]);')
s=s.replace('if (authLoading || !user || user.role !== "super_admin") return null;', 'if (authLoading || !user || !(user.role === "super_admin" || (user.role === "admin" && user.canAdminSubscriptions))) return null;')
s=s.replace('<div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Exclusivo do Super Administrador</div>', '<div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Administração de assinaturas</div>')
s=s.replace('<p className="mt-1 text-xs text-muted-foreground">@{account.username} · {lifecycleLabel(account)}</p>', '<p className="mt-1 text-xs text-muted-foreground">@{account.username} · ID <span className="font-mono font-semibold">{account.supportId || "—"}</span> · {lifecycleLabel(account)}</p>')
s=s.replace('{account.status !== "canceled" && <Button size="sm" variant="outline" onClick={() => openSecureAction(account, "cancel_subscription")} disabled={actionId === account.id}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button>}', '{user.role === "super_admin" && account.status !== "canceled" && <Button size="sm" variant="outline" onClick={() => openSecureAction(account, "cancel_subscription")} disabled={actionId === account.id}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button>}')
s=s.replace('{canDelete && <Button size="sm" variant="destructive" onClick={() => openSecureAction(account, "delete_unpaid")} disabled={actionId === account.id}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}', '{user.role === "super_admin" && canDelete && <Button size="sm" variant="destructive" onClick={() => openSecureAction(account, "delete_unpaid")} disabled={actionId === account.id}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}')
p.write_text(s)

# 6) Control panel: support ID + delegated read access; delete internal stays super admin
p=Path('api/admin/control-panel.ts'); s=p.read_text()
s=s.replace('  getSql,\n  readCookie,', '  ensureAuthUserColumns,\n  getSql,\n  readCookie,')
s=s.replace('    const sql = getSql();\n    const session = await sql`', '    await ensureAuthUserColumns();\n    const sql = getSql();\n    const session = await sql`',1)
s=s.replace('SELECT u.id, u.username, u.role, u."isActive"', 'SELECT u.id, u.username, u.role, u."isActive", u."canAdminControl"')
s=s.replace('if (!currentUser?.isActive || currentUser.role !== "super_admin") {', 'if (!currentUser?.isActive || !(currentUser.role === "super_admin" || (currentUser.role === "admin" && currentUser.canAdminControl))) {')
s=s.replace('message: "Painel disponível somente para o Super Administrador.",', 'message: "Você não possui autorização para acessar o Painel de Controle.",')
s=s.replace('    if (req.method === "POST") {\n      const body = await readJsonBody(req);', '    if (req.method === "POST") {\n      if (currentUser.role !== "super_admin") return sendJson(res, 403, { success: false, message: "A exclusão de usuários é exclusiva do Super Administrador." });\n      const body = await readJsonBody(req);')
s=s.replace('          u.name,\n          u.role,', '          u.name,\n          u."supportId",\n          u.role,')
p.write_text(s)

p=Path('client/src/pages/admin/Controle.tsx'); s=p.read_text()
s=s.replace('if (!authLoading && user && user.role !== "super_admin") navigate("/dashboard", { replace: true });', 'if (!authLoading && user && !(user.role === "super_admin" || (user.role === "admin" && user.canAdminControl))) navigate("/dashboard", { replace: true });')
s=s.replace('useEffect(() => { if (user?.role === "super_admin") void load(); }, [user?.role]);', 'useEffect(() => { if (user?.role === "super_admin" || (user?.role === "admin" && user?.canAdminControl)) void load(); }, [user?.role, user?.canAdminControl]);')
s=s.replace('if (authLoading || !user || user.role !== "super_admin") return null;', 'if (authLoading || !user || !(user.role === "super_admin" || (user.role === "admin" && user.canAdminControl))) return null;')
s=s.replace('<div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Exclusivo do Super Administrador</div>', '<div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Painel administrativo autorizado</div>')
s=s.replace('return [item.name, item.username, item.email, item.databaseNames, item.plan]', 'return [item.name, item.username, item.email, item.supportId, item.databaseNames, item.plan]')
s=s.replace('placeholder="Buscar nome, usuário, e-mail ou banco"', 'placeholder="Buscar nome, ID, usuário, e-mail ou banco"')
s=s.replace('<p className="text-xs text-muted-foreground">{item.username || "—"} · {item.email || "sem e-mail"}</p>', '<p className="text-xs text-muted-foreground">{item.username || "—"} · {item.email || "sem e-mail"}</p>{commercial ? <p className="mt-1 font-mono text-xs font-semibold text-primary">ID {item.supportId || "—"}</p> : null}')
# export ID
s=s.replace('    "ID", "Nome completo",', '    "ID interno", "ID de usuário (9 dígitos)", "Nome completo",')
s=s.replace('    account.id,\n    account.name || account.username,', '    account.id,\n    account.supportId || "",\n    account.name || account.username,')
# hide links the delegated admin lacks, and export if no subscriptions permission
s=s.replace('<Button variant="outline" onClick={downloadDetailedReport} disabled={exporting}>', '<Button variant="outline" onClick={downloadDetailedReport} disabled={exporting || !(user.role === "super_admin" || user.canAdminSubscriptions)}>')
p.write_text(s)

# 7) Marketing support ID + delegated access
p=Path('server/marketing.ts'); s=p.read_text()
s=s.replace('import { getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME }', 'import { ensureAuthUserColumns, getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME }')
s=s.replace('u.name,u.role,u."isActive" FROM', 'u.name,u.role,u."isActive",u."canAdminMarketing" FROM')
s=s.replace('return u?.isActive&&u.role==="super_admin"?u:null;', 'return u?.isActive&&(u.role==="super_admin"||(u.role==="admin"&&u.canAdminMarketing))?u:null;')
s=s.replace('async function ensure(){const s=getSql();await ensureLegalConsentTable();', 'async function ensure(){const s=getSql();await ensureAuthUserColumns();await ensureLegalConsentTable();')
s=s.replace('SELECT u.id,u.name,u.username,u.email,u.whatsapp,u."isActive",cs.plan', 'SELECT u.id,u.name,u.username,u.email,u.whatsapp,u."supportId",u."isActive",cs.plan')
s=s.replace('message:"Acesso exclusivo do Super Administrador."', 'message:"Você não possui autorização para acessar o Marketing."')
p.write_text(s)

p=Path('client/src/pages/admin/Marketing.tsx'); s=p.read_text()
s=s.replace('import DashboardLayout from', 'import { useAuth } from "@/_core/hooks/useAuth";\nimport DashboardLayout from')
s=s.replace('import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";\nimport { useLocation } from "wouter";')
s=s.replace('type Recipient = { id:number;', 'type Recipient = { id:number; supportId?:string;')
s=s.replace('export default function Marketing() {\n  const [recipients', 'export default function Marketing() {\n  const { user, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });\n  const [, navigate] = useLocation();\n  const [recipients')
s=s.replace('  useEffect(()=>{void load();},[]);', '  useEffect(()=>{if(!authLoading&&user&&!(user.role==="super_admin"||(user.role==="admin"&&user.canAdminMarketing)))navigate("/dashboard",{replace:true});},[authLoading,user,navigate]);\n  useEffect(()=>{if(user?.role==="super_admin"||(user?.role==="admin"&&user?.canAdminMarketing))void load();},[user?.role,user?.canAdminMarketing]);')
s=s.replace('<p className="truncate text-xs text-muted-foreground">{r.email}{r.whatsapp?` • ${r.whatsapp}`:""}</p>', '<p className="truncate text-xs text-muted-foreground">{r.email}{r.whatsapp?` • ${r.whatsapp}`:""}</p><p className="mt-1 font-mono text-[11px] font-semibold text-primary">ID {r.supportId||"—"}</p>')
s=s.replace('  return <DashboardLayout>', '  if(authLoading||!user||!(user.role==="super_admin"||(user.role==="admin"&&user.canAdminMarketing)))return null;\n\n  return <DashboardLayout>')
s=s.replace('Campanhas exclusivas do Super Administrador para clientes cadastrados.', 'Campanhas para clientes cadastrados, conforme autorização administrativa concedida pelo Super Admin.')
p.write_text(s)

# 8) Support delegated access
p=Path('server/support-chat.ts'); s=p.read_text()
s=s.replace('  supportId?: string | null;\n};', '  supportId?: string | null;\n  canAdminSupport?: boolean;\n};')
s=s.replace('u."accountOwnerId",u."supportId"', 'u."accountOwnerId",u."supportId",u."canAdminSupport"')
s=s.replace('    if (user.role === "super_admin") {', '    if (user.role === "super_admin" || (user.role === "admin" && user.canAdminSupport)) {')
p.write_text(s)

p=Path('client/src/pages/admin/Suporte.tsx'); s=p.read_text()
s=s.replace('import DashboardLayout from', 'import { useAuth } from "@/_core/hooks/useAuth";\nimport DashboardLayout from')
s=s.replace('import { toast } from "sonner";', 'import { toast } from "sonner";\nimport { useLocation } from "wouter";')
s=s.replace('export default function AdminSuporte(){\n  const [threads', 'export default function AdminSuporte(){\n  const { user, loading: authLoading }=useAuth({redirectOnUnauthenticated:true,redirectPath:"/login"});\n  const [,navigate]=useLocation();\n  const [threads')
s=s.replace('  useEffect(()=>{loadList();const timer=window.setInterval(()=>loadList(true),10000);return()=>window.clearInterval(timer);},[loadList]);', '  useEffect(()=>{if(!authLoading&&user&&!(user.role==="super_admin"||(user.role==="admin"&&user.canAdminSupport)))navigate("/dashboard",{replace:true});},[authLoading,user,navigate]);\n  useEffect(()=>{if(!(user?.role==="super_admin"||(user?.role==="admin"&&user?.canAdminSupport)))return;loadList();const timer=window.setInterval(()=>loadList(true),10000);return()=>window.clearInterval(timer);},[loadList,user?.role,user?.canAdminSupport]);')
s=s.replace('  return <DashboardLayout>', '  if(authLoading||!user||!(user.role==="super_admin"||(user.role==="admin"&&user.canAdminSupport)))return null;\n\n  return <DashboardLayout>')
s=s.replace('<p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Super Admin</p>', '<p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Administração autorizada</p>')
p.write_text(s)

print('admin delegated permissions patch applied')
