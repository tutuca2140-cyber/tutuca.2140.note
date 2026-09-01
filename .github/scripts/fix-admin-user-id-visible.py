from pathlib import Path

# Assinaturas: exibir ID do usuário no cartão, não só no Excel/backend.
p=Path('client/src/pages/admin/Assinaturas.tsx')
s=p.read_text()
old='<p className="mt-1 text-xs text-muted-foreground">@{account.username} · {lifecycleLabel(account)}</p>'
new='<p className="mt-1 text-xs text-muted-foreground">@{account.username} · <span className="font-mono font-semibold text-primary">ID {account.supportId || "—"}</span> · {lifecycleLabel(account)}</p>'
if new not in s:
    if old not in s: raise SystemExit('Assinaturas user info pattern not found')
    s=s.replace(old,new,1)
s=s.replace('Exclusivo do Super Administrador</div>','Administração de assinaturas</div>',1)
p.write_text(s)

# Marketing: tipar e exibir ID do usuário na lista de destinatários.
p=Path('client/src/pages/admin/Marketing.tsx')
s=p.read_text()
old='type Recipient = { id:number; name?:string; username?:string; email:string; whatsapp?:string; plan?:string; status?:string; marketingState:"current"|"overdue"|"other" };'
new='type Recipient = { id:number; supportId?:string|null; name?:string; username?:string; email:string; whatsapp?:string; plan?:string; status?:string; marketingState:"current"|"overdue"|"other" };'
if new not in s:
    if old not in s: raise SystemExit('Marketing Recipient type pattern not found')
    s=s.replace(old,new,1)
old='<p className="truncate text-xs text-muted-foreground">{r.email}{r.whatsapp?` • ${r.whatsapp}`:""}</p>'
new='<p className="truncate text-xs text-muted-foreground">{r.email}{r.whatsapp?` • ${r.whatsapp}`:""}</p><p className="mt-1 font-mono text-[11px] font-semibold text-primary">ID {r.supportId || "—"}</p>'
if new not in s:
    if old not in s: raise SystemExit('Marketing recipient display pattern not found')
    s=s.replace(old,new,1)
s=s.replace('Campanhas exclusivas do Super Administrador para clientes cadastrados.','Campanhas para clientes cadastrados, conforme as autorizações administrativas concedidas pelo Super Admin.',1)
p.write_text(s)

print('visible user IDs patched')
