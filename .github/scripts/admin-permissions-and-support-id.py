from pathlib import Path
import re

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f'pattern not found in {path}: {old[:120]}')
    p.write_text(s.replace(old,new,1))

def replace_all(path, old, new):
    p=Path(path); s=p.read_text(); p.write_text(s.replace(old,new))

# 1) DB/auth columns
p=Path('api/auth/_shared.ts'); s=p.read_text()
needle='    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "supportId" varchar(9)`;\n'
extra='''    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "supportId" varchar(9)`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanControlPanel" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanSubscriptions" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanMarketing" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanSupport" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanUsers" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanDatabases" boolean DEFAULT false NOT NULL`;\n    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "adminCanAudit" boolean DEFAULT false NOT NULL`;\n'''
if 'adminCanControlPanel' not in s:
    if needle not in s: raise SystemExit('auth columns insertion point not found')
    s=s.replace(needle,extra,1)
p.write_text(s)

# drizzle schema
p=Path('drizzle/schema.ts'); s=p.read_text()
needle='  dashboardOnly: boolean("dashboardOnly").default(false).notNull(),\n'
extra='''  dashboardOnly: boolean("dashboardOnly").default(false).notNull(),\n  adminCanControlPanel: boolean("adminCanControlPanel").default(false).notNull(),\n  adminCanSubscriptions: boolean("adminCanSubscriptions").default(false).notNull(),\n  adminCanMarketing: boolean("adminCanMarketing").default(false).notNull(),\n  adminCanSupport: boolean("adminCanSupport").default(false).notNull(),\n  adminCanUsers: boolean("adminCanUsers").default(false).notNull(),\n  adminCanDatabases: boolean("adminCanDatabases").default(false).notNull(),\n  adminCanAudit: boolean("adminCanAudit").default(false).notNull(),\n'''
if 'adminCanControlPanel' not in s:
    if needle not in s: raise SystemExit('schema insertion point not found')
    s=s.replace(needle,extra,1)
p.write_text(s)

# auth/me expose admin flags
p=Path('api/auth/me.ts'); s=p.read_text()
needle='''        u."dashboardOnly",\n        u."isActive"'''
extra='''        u."dashboardOnly",\n        u."adminCanControlPanel",\n        u."adminCanSubscriptions",\n        u."adminCanMarketing",\n        u."adminCanSupport",\n        u."adminCanUsers",\n        u."adminCanDatabases",\n        u."adminCanAudit",\n        u."isActive"'''
if 'u."adminCanControlPanel"' not in s:
    if needle not in s: raise SystemExit('auth me insertion point not found')
    s=s.replace(needle,extra,1)
p.write_text(s)

# client AuthUser type
p=Path('client/src/_core/hooks/useAuth.ts'); s=p.read_text()
needle='  dashboardOnly?: boolean;\n'
extra='''  dashboardOnly?: boolean;\n  adminCanControlPanel?: boolean;\n  adminCanSubscriptions?: boolean;\n  adminCanMarketing?: boolean;\n  adminCanSupport?: boolean;\n  adminCanUsers?: boolean;\n  adminCanDatabases?: boolean;\n  adminCanAudit?: boolean;\n'''
if 'adminCanControlPanel?:' not in s:
    if needle not in s: raise SystemExit('auth user type insertion point not found')
    s=s.replace(needle,extra,1)
p.write_text(s)

# users admin UI types + permission switches
p=Path('client/src/pages/admin/Usuarios.tsx'); s=p.read_text()
needle='''  dashboardOnly: boolean;\n};'''
extra='''  dashboardOnly: boolean;\n  adminCanControlPanel: boolean;\n  adminCanSubscriptions: boolean;\n  adminCanMarketing: boolean;\n  adminCanSupport: boolean;\n  adminCanUsers: boolean;\n  adminCanDatabases: boolean;\n  adminCanAudit: boolean;\n};'''
if 'adminCanControlPanel: boolean;' not in s:
    if needle not in s: raise SystemExit('usuarios Draft insertion not found')
    s=s.replace(needle,extra,1)
needle='''  dashboardOnly: false,\n  ...permissionsForRole("user"),'''
extra='''  dashboardOnly: false,\n  adminCanControlPanel: false,\n  adminCanSubscriptions: false,\n  adminCanMarketing: false,\n  adminCanSupport: false,\n  adminCanUsers: false,\n  adminCanDatabases: false,\n  adminCanAudit: false,\n  ...permissionsForRole("user"),'''
if 'adminCanControlPanel: false,' not in s:
    if needle not in s: raise SystemExit('empty draft insertion not found')
    s=s.replace(needle,extra,1)
needle='''      dashboardOnly: user.dashboardOnly,\n    });'''
extra='''      dashboardOnly: user.dashboardOnly,\n      adminCanControlPanel: Boolean((user as any).adminCanControlPanel),\n      adminCanSubscriptions: Boolean((user as any).adminCanSubscriptions),\n      adminCanMarketing: Boolean((user as any).adminCanMarketing),\n      adminCanSupport: Boolean((user as any).adminCanSupport),\n      adminCanUsers: Boolean((user as any).adminCanUsers),\n      adminCanDatabases: Boolean((user as any).adminCanDatabases),\n      adminCanAudit: Boolean((user as any).adminCanAudit),\n    });'''
if 'Boolean((user as any).adminCanControlPanel)' not in s:
    if needle not in s: raise SystemExit('edit draft insertion not found')
    s=s.replace(needle,extra,1)
# insert section before save buttons
needle='''                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">'''
admin_section='''                <section className="space-y-4 border-t pt-5">\n                  <div className="flex items-start gap-3">\n                    <div className="rounded-lg bg-primary/10 p-2 text-primary"><Shield className="h-5 w-5" /></div>\n                    <div><h3 className="font-semibold">Autorizações de Administração</h3><p className="text-sm text-muted-foreground">Permita que este usuário de equipe acesse somente as áreas administrativas selecionadas. O Super Admin continua com acesso total.</p></div>\n                  </div>\n                  <div className="grid gap-3 sm:grid-cols-2">\n                    {[\n                      ["adminCanControlPanel", "Painel de Controle"],\n                      ["adminCanSubscriptions", "Assinaturas"],\n                      ["adminCanMarketing", "Marketing"],\n                      ["adminCanSupport", "Suporte"],\n                      ["adminCanUsers", "Usuários"],\n                      ["adminCanDatabases", "Bancos de Dados"],\n                      ["adminCanAudit", "Auditoria"],\n                    ].map(([key,label]) => (\n                      <div key={key} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">\n                        <Label htmlFor={`admin-permission-${key}`} className="cursor-pointer font-medium">{label}</Label>\n                        <Switch id={`admin-permission-${key}`} checked={Boolean((draft as any)[key])} onCheckedChange={checked => setDraft(current => ({ ...current, [key]: checked }))} />\n                      </div>\n                    ))}\n                  </div>\n                  <p className="text-xs text-muted-foreground">Essas autorizações dão acesso apenas aos módulos administrativos marcados; não transformam o usuário em Super Admin.</p>\n                </section>\n\n'''+needle
if 'Autorizações de Administração' not in s:
    if needle not in s: raise SystemExit('admin UI insertion point not found')
    s=s.replace(needle,admin_section,1)
p.write_text(s)

# routers create/update schemas: add admin fields after dashboardOnly in users section only
p=Path('server/routers.ts'); s=p.read_text()
start=s.find('// ==================== USERS ====================')
end=s.find('// ====================', start+10)
if end<0: end=len(s)
part=s[start:end]
needle='          dashboardOnly: z.boolean().default(false),\n'
extra='''          dashboardOnly: z.boolean().default(false),\n          adminCanControlPanel: z.boolean().default(false),\n          adminCanSubscriptions: z.boolean().default(false),\n          adminCanMarketing: z.boolean().default(false),\n          adminCanSupport: z.boolean().default(false),\n          adminCanUsers: z.boolean().default(false),\n          adminCanDatabases: z.boolean().default(false),\n          adminCanAudit: z.boolean().default(false),\n'''
if 'adminCanControlPanel: z.boolean().default(false)' not in part:
    if needle not in part: raise SystemExit('users create schema point not found')
    part=part.replace(needle,extra,1)
needle='          dashboardOnly: z.boolean(),\n'
extra='''          dashboardOnly: z.boolean(),\n          adminCanControlPanel: z.boolean(),\n          adminCanSubscriptions: z.boolean(),\n          adminCanMarketing: z.boolean(),\n          adminCanSupport: z.boolean(),\n          adminCanUsers: z.boolean(),\n          adminCanDatabases: z.boolean(),\n          adminCanAudit: z.boolean(),\n'''
if 'adminCanControlPanel: z.boolean(),' not in part:
    if needle not in part: raise SystemExit('users update schema point not found')
    part=part.replace(needle,extra,1)
s=s[:start]+part+s[end:]
p.write_text(s)

# dashboard navigation permissions
p=Path('client/src/components/DashboardLayout.tsx'); s=p.read_text()
repls={
'{ name: "Painel de Controle", href: "/admin/controle", icon: Activity, show: isSuperAdmin }':'{ name: "Painel de Controle", href: "/admin/controle", icon: Activity, show: Boolean(isSuperAdmin || user?.adminCanControlPanel) }',
'{ name: "Assinaturas", href: "/admin/assinaturas", icon: CreditCard, show: isSuperAdmin }':'{ name: "Assinaturas", href: "/admin/assinaturas", icon: CreditCard, show: Boolean(isSuperAdmin || user?.adminCanSubscriptions) }',
'{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: isSuperAdmin }':'{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: Boolean(isSuperAdmin || user?.adminCanMarketing) }',
'{ name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: isSuperAdmin }':'{ name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: Boolean(isSuperAdmin || user?.adminCanSupport) }',
'{ name: "Usuários", href: "/admin/usuarios", icon: Shield, show: isSuperAdmin }':'{ name: "Usuários", href: "/admin/usuarios", icon: Shield, show: Boolean(isSuperAdmin || user?.adminCanUsers) }',
'{ name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: Boolean(isAdmin) }':'{ name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: Boolean(isSuperAdmin || user?.adminCanDatabases) }',
'{ name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: Boolean(isAdmin) }':'{ name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: Boolean(isSuperAdmin || user?.adminCanAudit) }',
}
for old,new in repls.items(): s=s.replace(old,new)
old='{(isAdmin || user?.canAccessSettings) && <>'
new='{(isSuperAdmin || user?.adminCanControlPanel || user?.adminCanSubscriptions || user?.adminCanMarketing || user?.adminCanSupport || user?.adminCanUsers || user?.adminCanDatabases || user?.adminCanAudit || user?.canAccessSettings) && <>'
s=s.replace(old,new)
p.write_text(s)

# Support ID in commercial accounts backend
p=Path('api/admin/commercial-accounts.ts'); s=p.read_text()
if 'u."supportId"' not in s:
    s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",','u.id, u."supportId", u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",',1)
    s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan','u.id, u."supportId", u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan',1)
    s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan, cs."priceCents"','u.id, u."supportId", u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan, cs."priceCents"',1)
    s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan, cs."priceCents", cs.status','u.id, u."supportId", u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan, cs."priceCents", cs.status',1)
    # group by exact
    s=s.replace('u.id, u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan,','u.id, u."supportId", u.username, u.name, u.email, u.whatsapp, u."isActive", u."createdAt", u."lastSignedIn",\n      cs.plan,')
p.write_text(s)

# Control panel backend includes supportId
p=Path('api/admin/control-panel.ts'); s=p.read_text()
needle='''          u.id,\n          u.username,'''
extra='''          u.id,\n          u."supportId",\n          u.username,'''
if 'u."supportId"' not in s:
    if needle not in s: raise SystemExit('control panel support id point not found')
    s=s.replace(needle,extra,1)
p.write_text(s)

# Marketing backend includes supportId
p=Path('server/marketing.ts'); s=p.read_text()
s=s.replace('SELECT u.id,u.name,u.username,u.email,u.whatsapp,u."isActive",cs.plan','SELECT u.id,u."supportId",u.name,u.username,u.email,u.whatsapp,u."isActive",cs.plan')
p.write_text(s)

# Assinaturas UI support ID in type, export and visible card/table
p=Path('client/src/pages/admin/Assinaturas.tsx'); s=p.read_text()
if 'supportId?: string' not in s:
    s=s.replace('  id: number;\n  username:', '  id: number;\n  supportId?: string | null;\n  username:',1)
s=s.replace('    "ID",\n    "Nome completo",','    "ID interno",\n    "ID de usuário",\n    "Nome completo",')
s=s.replace('    account.id,\n    account.name || account.username,','    account.id,\n    account.supportId || "",\n    account.name || account.username,')
# visible ID: add beside username occurrences in account cards
if 'ID de usuário: {account.supportId' not in s:
    s=s.replace('<p className="font-semibold">{account.name || account.username}</p>', '<p className="font-semibold">{account.name || account.username}</p><p className="text-xs font-mono text-primary">ID de usuário: {account.supportId || "—"}</p>')
p.write_text(s)

# Controle UI export, search, visible table
p=Path('client/src/pages/admin/Controle.tsx'); s=p.read_text()
s=s.replace('"ID", "Nome completo",', '"ID interno", "ID de usuário", "Nome completo",')
s=s.replace('    account.id,\n    account.name || account.username,','    account.id,\n    account.supportId || "",\n    account.name || account.username,')
s=s.replace('return [item.name, item.username, item.email, item.databaseNames, item.plan]', 'return [item.name, item.username, item.email, item.supportId, item.databaseNames, item.plan]')
s=s.replace('placeholder="Buscar nome, usuário, e-mail ou banco"','placeholder="Buscar nome, ID, usuário, e-mail ou banco"')
# Add support ID under user cell wherever name/username is rendered in table
if 'ID: {item.supportId' not in s:
    s=s.replace('<p className="font-semibold">{item.name || item.username || "Sem nome"}</p>', '<p className="font-semibold">{item.name || item.username || "Sem nome"}</p><p className="font-mono text-xs text-primary">ID: {item.supportId || "—"}</p>')
p.write_text(s)

# Marketing UI recipient type/card supportId
p=Path('client/src/pages/admin/Marketing.tsx'); s=p.read_text()
if 'supportId' not in s:
    # generic type insertion
    s=s.replace('id: number;', 'id: number; supportId?: string | null;',1)
# add display after recipient name patterns
for old in ['{recipient.name || recipient.username}', '{r.name || r.username}']:
    if old in s and 'ID de usuário' not in s:
        s=s.replace(old, old+'<span className="ml-2 font-mono text-xs text-primary">ID de usuário: {recipient.supportId || "—"}</span>' if 'recipient.' in old else old+'<span className="ml-2 font-mono text-xs text-primary">ID de usuário: {r.supportId || "—"}</span>',1)
p.write_text(s)

# Generic helper auth for admin REST endpoints
Path('server/admin-access.ts').write_text('''import { ensureAuthUserColumns, getSql, readCookie, SESSION_COOKIE_NAME } from "../api/auth/_shared.js";\n\nexport type AdminArea = "control"|"subscriptions"|"marketing"|"support"|"users"|"databases"|"audit";\nconst column: Record<AdminArea,string> = { control:"adminCanControlPanel", subscriptions:"adminCanSubscriptions", marketing:"adminCanMarketing", support:"adminCanSupport", users:"adminCanUsers", databases:"adminCanDatabases", audit:"adminCanAudit" };\nexport async function getAuthorizedAdmin(req:any, area:AdminArea){\n  await ensureAuthUserColumns();\n  const token=readCookie(req,SESSION_COOKIE_NAME); if(!token)return null;\n  const sql=getSql(); const rows=await sql`SELECT u.* FROM local_sessions s JOIN users u ON u.id=s."userId" WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;\n  const user=rows[0] as any; if(!user?.isActive)return null;\n  return user.role==="super_admin" || Boolean(user[column[area]]) ? user : null;\n}\n''')

# REST endpoints permission replacement
p=Path('api/admin/control-panel.ts'); s=p.read_text()
if 'getAuthorizedAdmin' not in s:
    s='import { getAuthorizedAdmin } from "../../server/admin-access.js";\n'+s
    # Replace current session auth block conservatively
    pattern=r'''    const token = readCookie\(req, SESSION_COOKIE_NAME\);.*?    await ensureTables\(\);'''
    repl='''    const currentUser = await getAuthorizedAdmin(req, "control");\n    if (!currentUser) return sendJson(res, 403, { success: false, message: "Sem autorização para o Painel de Controle." });\n    const sql = getSql();\n\n    await ensureTables();'''
    s,n=re.subn(pattern,repl,s,count=1,flags=re.S)
    if n!=1: raise SystemExit('control auth replacement failed')
p.write_text(s)

p=Path('api/admin/commercial-accounts.ts'); s=p.read_text()
if 'getAuthorizedAdmin' not in s:
    s='import { getAuthorizedAdmin } from "../../server/admin-access.js";\n'+s
    # replace getSuperAdmin function body usage only by making function delegate
    s=re.sub(r'async function getSuperAdmin\(req: any\) \{.*?\n\}', 'async function getSuperAdmin(req: any) { return getAuthorizedAdmin(req, "subscriptions");\n}', s, count=1, flags=re.S)
p.write_text(s)

p=Path('server/marketing.ts'); s=p.read_text()
if 'getAuthorizedAdmin' not in s:
    s='import { getAuthorizedAdmin } from "./admin-access.js";\n'+s
    s=re.sub(r'async function admin\(req:any\)\{.*?\}\n', 'async function admin(req:any){ return getAuthorizedAdmin(req,"marketing"); }\n', s, count=1, flags=re.S)
    s=s.replace('Acesso exclusivo do Super Administrador.','Sem autorização para Marketing.')
p.write_text(s)

# support admin: allow delegated support and keep subscriber path distinct
p=Path('server/support-chat.ts'); s=p.read_text()
if 'adminCanSupport' not in s.split('let tablesPromise')[0]:
    s=s.replace('  supportId?: string | null;\n};','  supportId?: string | null;\n  adminCanSupport?: boolean;\n};')
s=s.replace('SELECT u.id,u.name,u.username,u.email,u.role,u."isActive",u."loginMethod",u."accountOwnerId",u."supportId"','SELECT u.id,u.name,u.username,u.email,u.role,u."isActive",u."loginMethod",u."accountOwnerId",u."supportId",u."adminCanSupport"')
s=s.replace('if (user.role === "super_admin") {','if (user.role === "super_admin" || user.adminCanSupport) {')
p.write_text(s)

# Page guards for delegated permissions
page_perms={
'client/src/pages/admin/Controle.tsx':'adminCanControlPanel',
'client/src/pages/admin/Assinaturas.tsx':'adminCanSubscriptions',
'client/src/pages/admin/Marketing.tsx':'adminCanMarketing',
'client/src/pages/admin/Suporte.tsx':'adminCanSupport',
}
for path,perm in page_perms.items():
    p=Path(path); s=p.read_text()
    s=s.replace('user.role !== "super_admin"', f'!(user.role === "super_admin" || user.{perm})')
    s=s.replace('user?.role === "super_admin"', f'(user?.role === "super_admin" || user?.{perm})')
    s=s.replace('!user || user.role !== "super_admin"', f'!user || !(user.role === "super_admin" || user.{perm})')
    p.write_text(s)

print('patched')
