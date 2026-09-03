from pathlib import Path

# Backend: expose immutable supportId in profile payload.
p = Path('server/profile-service.ts')
s = p.read_text()
old = '       u.id, u.username, u.name, u.email, u.whatsapp, u.role, u."loginMethod",\n       u."accountOwnerId", u."passwordHash", u."isActive", u."createdAt",'
new = '       u.id, u.username, u.name, u.email, u.whatsapp, u.role, u."loginMethod",\n       u."accountOwnerId", u."passwordHash", u."isActive", u."createdAt", u."supportId",'
if old not in s:
    raise SystemExit('backend select marker not found')
s = s.replace(old, new, 1)
old = '    id: Number(user.id),\n    name: String(user.name || ""),'
new = '    id: Number(user.id),\n    supportId: user.supportId ? String(user.supportId) : null,\n    name: String(user.name || ""),'
if old not in s:
    raise SystemExit('backend profile marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Frontend: show supportId as readonly / non-editable.
p = Path('client/src/pages/Perfil.tsx')
s = p.read_text()
old = 'type Profile = {\n  id: number;\n  name: string;'
new = 'type Profile = {\n  id: number;\n  supportId?: string | null;\n  name: string;'
if old not in s:
    raise SystemExit('frontend type marker not found')
s = s.replace(old, new, 1)
old = '''                  <div>\n                    <Label htmlFor="profile-whatsapp">WhatsApp</Label>\n                    <Input\n                      id="profile-whatsapp"\n                      className="mt-2"\n                      inputMode="tel"\n                      value={whatsapp}\n                      onChange={event => setWhatsapp(formatWhatsapp(event.target.value))}\n                      placeholder="(24) 99999-9999"\n                      disabled={!profile.editable || saving}\n                    />\n                  </div>'''
new = '''                  <div>\n                    <Label htmlFor="profile-whatsapp">WhatsApp</Label>\n                    <Input\n                      id="profile-whatsapp"\n                      className="mt-2"\n                      inputMode="tel"\n                      value={whatsapp}\n                      onChange={event => setWhatsapp(formatWhatsapp(event.target.value))}\n                      placeholder="(24) 99999-9999"\n                      disabled={!profile.editable || saving}\n                    />\n                  </div>\n                  <div>\n                    <Label htmlFor="profile-support-id">ID de usuário</Label>\n                    <Input\n                      id="profile-support-id"\n                      className="mt-2 font-mono tracking-[0.18em]"\n                      value={profile.supportId || "Não disponível"}\n                      readOnly\n                      disabled\n                    />\n                    <p className="mt-1 text-xs text-muted-foreground">Número gerado pelo sistema e não pode ser alterado.</p>\n                  </div>'''
if old not in s:
    raise SystemExit('frontend whatsapp marker not found')
s = s.replace(old, new, 1)
p.write_text(s)
