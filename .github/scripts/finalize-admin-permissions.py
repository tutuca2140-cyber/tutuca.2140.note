from pathlib import Path
import re

# Marketing: add supportId type + visible ID
p=Path('client/src/pages/admin/Marketing.tsx'); s=p.read_text()
s=s.replace('type Recipient = { id:number; name?:string;', 'type Recipient = { id:number; supportId?:string|null; name?:string;')
old='<p className="truncate text-sm font-semibold">{r.name||r.username||"Cliente"}</p><p className="truncate text-xs text-muted-foreground">{r.email}'
new='<p className="truncate text-sm font-semibold">{r.name||r.username||"Cliente"}</p><p className="font-mono text-[11px] font-semibold text-primary">ID de usuário: {r.supportId||"—"}</p><p className="truncate text-xs text-muted-foreground">{r.email}'
if old in s: s=s.replace(old,new,1)
p.write_text(s)

# Assinaturas: make delegated page copy neutral and guarantee visible support ID in account rendering
p=Path('client/src/pages/admin/Assinaturas.tsx'); s=p.read_text()
s=s.replace('Exclusivo do Super Administrador','Administração de Assinaturas')
s=s.replace('user && !(user.role === "super_admin" || user.adminCanSubscriptions)', 'user && !(user.role === "super_admin" || user.adminCanSubscriptions)')
# Add ID near common account identity if not already present
if 'ID de usuário: {account.supportId' not in s:
    patterns=[
      ('<div className="font-semibold">{account.name || account.username}</div>', '<div className="font-semibold">{account.name || account.username}</div><div className="font-mono text-xs text-primary">ID de usuário: {account.supportId || "—"}</div>'),
      ('<p className="font-semibold">{account.name || account.username}</p>', '<p className="font-semibold">{account.name || account.username}</p><p className="font-mono text-xs text-primary">ID de usuário: {account.supportId || "—"}</p>')
    ]
    for a,b in patterns:
        if a in s: s=s.replace(a,b,1); break
p.write_text(s)

# Controle: neutral copy + visible ID if absent
p=Path('client/src/pages/admin/Controle.tsx'); s=p.read_text()
s=s.replace('Exclusivo do Super Administrador','Administração do sistema')
if 'ID: {item.supportId' not in s:
    candidates=[
      ('<div className="font-semibold">{item.name || item.username || "Sem nome"}</div>', '<div className="font-semibold">{item.name || item.username || "Sem nome"}</div><div className="font-mono text-xs text-primary">ID: {item.supportId || "—"}</div>'),
      ('<p className="font-semibold">{item.name || item.username || "Sem nome"}</p>', '<p className="font-semibold">{item.name || item.username || "Sem nome"}</p><p className="font-mono text-xs text-primary">ID: {item.supportId || "—"}</p>')
    ]
    for a,b in candidates:
        if a in s: s=s.replace(a,b,1); break
p.write_text(s)

# Users page: only Super Admin should create/edit delegation; delegated users can view if authorized but not mutate.
p=Path('client/src/pages/admin/Usuarios.tsx'); s=p.read_text()
# Add auth so UI can hide mutation controls for non-super admin
if 'useAuth' not in s.split('\n',10)[0:10]:
    s='import { useAuth } from "@/_core/hooks/useAuth";\n'+s
# Add user hook in component
needle='export default function AdminUsuarios() {\n  const utils = trpc.useUtils();'
if needle in s and 'const { user: currentUser } = useAuth' not in s:
    s=s.replace(needle,'export default function AdminUsuarios() {\n  const { user: currentUser } = useAuth();\n  const utils = trpc.useUtils();',1)
# Create button only SuperAdmin
s=s.replace('{activeTab === "super_admin" && (','{activeTab === "super_admin" && currentUser?.role === "super_admin" && (')
# Edit action guard common occurrence
s=s.replace('onClick={() => edit(user)}', 'onClick={() => currentUser?.role === "super_admin" && edit(user)}')
p.write_text(s)

# Users TRPC list: allow delegated adminCanUsers, but mutations remain superAdmin only
p=Path('server/routers.ts'); s=p.read_text()
if 'const usersAdminProcedure' not in s:
    marker='const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {'
    idx=s.find(marker)
    if idx<0: raise SystemExit('superAdminProcedure marker missing')
    # insert before superAdminProcedure
    helper='''const usersAdminProcedure = protectedProcedure.use(({ ctx, next }) => {\n  if (ctx.user.role !== "super_admin" && !ctx.user.adminCanUsers) {\n    throw new TRPCError({ code: "FORBIDDEN", message: "Sem autorização para administrar usuários." });\n  }\n  return next({ ctx });\n});\n\n'''
    s=s[:idx]+helper+s[idx:]
# in users router only, switch list/getById to delegated procedure
start=s.find('// ==================== USERS ===================='); end=s.find('// ====================',start+10)
if end<0:end=len(s)
part=s[start:end]
part=part.replace('list: adminProcedure.query', 'list: usersAdminProcedure.query',1)
part=part.replace('getById: adminProcedure', 'getById: usersAdminProcedure',1)
s=s[:start]+part+s[end:]
p.write_text(s)

# Make auth ctx aware of admin flags if shared user schema/type strips them: db schema already carries fields.

# Control-panel destructive POST stays Super Admin only even for delegated viewers
p=Path('api/admin/control-panel.ts'); s=p.read_text()
needle='''    if (req.method === "POST") {\n      const body = await readJsonBody(req);'''
if needle in s and 'Somente o Super Admin pode excluir usuários internos' not in s:
    repl='''    if (req.method === "POST") {\n      if (currentUser.role !== "super_admin") return sendJson(res, 403, { success: false, message: "Somente o Super Admin pode excluir usuários internos." });\n      const body = await readJsonBody(req);'''
    s=s.replace(needle,repl,1)
p.write_text(s)

# Subscription destructive/mutating actions: delegated access is read-only; Super Admin keeps writes.
p=Path('api/admin/commercial-accounts.ts'); s=p.read_text()
# locate main handler POST check and guard all writes
if 'Somente o Super Admin pode alterar assinaturas' not in s:
    # find first handler method POST branch near bottom
    s=s.replace('if (req.method !== "POST")', 'if (req.method !== "POST")',1)
    # generic injection after body parsing in handler
    marker='const body = await readJsonBody(req);'
    pos=s.rfind(marker)
    if pos>=0:
        insert_pos=pos+len(marker)
        s=s[:insert_pos]+'\n    if (admin.role !== "super_admin") return sendJson(res, 403, { success: false, message: "Somente o Super Admin pode alterar assinaturas." });'+s[insert_pos:]
p.write_text(s)

# Marketing delegated permission may send campaigns (explicit permission grants action), Support delegated may reply.

print('finalized')
