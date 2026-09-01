from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    if new in s:
        return
    if old not in s:
        raise SystemExit(f"pattern not found in {path}: {old[:120]}")
    p.write_text(s.replace(old, new, 1))

# Backend: lightweight unread notification endpoint that does NOT mark messages as read.
p = Path("server/support-chat.ts")
s = p.read_text()
needle = '''    const queryAction = cleanText(Array.isArray(req?.query?.action) ? req.query.action[0] : req?.query?.action, 50).toLowerCase();\n\n    if (user.role === "super_admin" || user.adminCanSupport) {'''
insert = '''    const queryAction = cleanText(Array.isArray(req?.query?.action) ? req.query.action[0] : req?.query?.action, 50).toLowerCase();\n\n    if (req.method === "GET" && queryAction === "notifications") {\n      if (user.role === "super_admin" || user.adminCanSupport) {\n        const counts = await sql`\n          SELECT COUNT(*)::int AS "unreadCount"\n          FROM support_messages\n          WHERE "senderRole"='user' AND "readAt" IS NULL\n        `;\n        const latestRows = await sql`\n          SELECT m.id,m.message,m."createdAt",t.id AS "threadId",u.name,u.username,u."supportId"\n          FROM support_messages m\n          JOIN support_threads t ON t.id=m."threadId"\n          JOIN users u ON u.id=t."subscriberUserId"\n          WHERE m."senderRole"='user' AND m."readAt" IS NULL\n          ORDER BY m."createdAt" DESC,m.id DESC\n          LIMIT 1\n        `;\n        return sendJson(res, 200, {\n          success: true,\n          unreadCount: Number((counts[0] as any)?.unreadCount || 0),\n          latest: latestRows[0] || null,\n          audience: "admin",\n        });\n      }\n\n      const subscriber = await getSubscriber(user);\n      if (!subscriber) return sendJson(res, 200, { success: true, unreadCount: 0, latest: null, audience: "none" });\n      const counts = await sql`\n        SELECT COUNT(*)::int AS "unreadCount"\n        FROM support_messages m\n        JOIN support_threads t ON t.id=m."threadId"\n        WHERE t."subscriberUserId"=${Number(subscriber.id)}\n          AND m."senderRole"='super_admin'\n          AND m."readAt" IS NULL\n      `;\n      const latestRows = await sql`\n        SELECT m.id,m.message,m."createdAt",m."threadId"\n        FROM support_messages m\n        JOIN support_threads t ON t.id=m."threadId"\n        WHERE t."subscriberUserId"=${Number(subscriber.id)}\n          AND m."senderRole"='super_admin'\n          AND m."readAt" IS NULL\n        ORDER BY m."createdAt" DESC,m.id DESC\n        LIMIT 1\n      `;\n      return sendJson(res, 200, {\n        success: true,\n        unreadCount: Number((counts[0] as any)?.unreadCount || 0),\n        latest: latestRows[0] || null,\n        audience: "subscriber",\n      });\n    }\n\n    if (user.role === "super_admin" || user.adminCanSupport) {'''
if 'queryAction === "notifications"' not in s:
    if needle not in s:
        raise SystemExit('support notification insertion point not found')
    s = s.replace(needle, insert, 1)
p.write_text(s)

# Global in-app/browser notifications + unread badge in admin Support navigation.
p = Path("client/src/components/DashboardLayout.tsx")
s = p.read_text()
s = s.replace(
    'import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";',
    'import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";'
)
needle = '''  const [sidebarOpen, setSidebarOpen] = useState(false);\n  const utils = trpc.useUtils();'''
insert = '''  const [sidebarOpen, setSidebarOpen] = useState(false);\n  const [supportUnreadCount, setSupportUnreadCount] = useState(0);\n  const originalTitleRef = useRef(typeof document !== "undefined" ? document.title : "Note Note");\n  const utils = trpc.useUtils();'''
if 'supportUnreadCount' not in s:
    if needle not in s: raise SystemExit('dashboard support state point not found')
    s = s.replace(needle, insert, 1)
needle = '''  const canManageTeam = Boolean(commercialAccount && commercialContext?.permissions.canManageUsers);\n\n  const navigation: NavItem[] = ['''
insert = '''  const canManageTeam = Boolean(commercialAccount && commercialContext?.permissions.canManageUsers);\n  const canWatchSupport = Boolean(isSuperAdmin || user?.adminCanSupport || commercialAccount);\n\n  useEffect(() => {\n    if (!user || !canWatchSupport) { setSupportUnreadCount(0); return; }\n    let cancelled = false;\n    const poll = async () => {\n      try {\n        const response = await fetch("/api/site-access?scope=support&action=notifications", { credentials: "include", cache: "no-store" });\n        if (!response.ok) return;\n        const data = await response.json();\n        if (cancelled) return;\n        const unread = Math.max(0, Number(data?.unreadCount || 0));\n        setSupportUnreadCount(unread);\n        const latestId = Number(data?.latest?.id || 0);\n        if (!latestId || unread <= 0) return;\n        const key = `note-note-support-last-notified-${user.id}`;\n        const already = Number(window.localStorage.getItem(key) || 0);\n        if (already === latestId) return;\n        window.localStorage.setItem(key, String(latestId));\n        const from = data?.audience === "admin" ? (data?.latest?.name || data?.latest?.username || "Cliente") : "Suporte Note Note";\n        const preview = String(data?.latest?.message || "Nova mensagem recebida.").slice(0, 110);\n        toast.info(`Nova mensagem de suporte — ${from}`, { description: preview, duration: 8000 });\n        if (typeof Notification !== "undefined" && Notification.permission === "granted") {\n          const notification = new Notification(`Note Note — ${from}`, { body: preview, icon: "/brand/note-note-icon.png", tag: `support-${latestId}` });\n          notification.onclick = () => { window.focus(); if (data?.audience === "admin") navigate("/admin/suporte"); notification.close(); };\n        }\n      } catch {\n        // Notificação é complementar; falhas silenciosas não interrompem o sistema.\n      }\n    };\n    void poll();\n    const timer = window.setInterval(poll, 10000);\n    return () => { cancelled = true; window.clearInterval(timer); };\n  }, [canWatchSupport, navigate, user?.id]);\n\n  useEffect(() => {\n    if (typeof document === "undefined") return;\n    document.title = supportUnreadCount > 0 ? `(${supportUnreadCount}) ${originalTitleRef.current}` : originalTitleRef.current;\n    return () => { document.title = originalTitleRef.current; };\n  }, [supportUnreadCount]);\n\n  const navigation: NavItem[] = ['''
if 'canWatchSupport' not in s:
    if needle not in s: raise SystemExit('dashboard polling insertion point not found')
    s = s.replace(needle, insert, 1)
old = '''    return <Link key={item.name} href={item.href}><a className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setSidebarOpen(false)}><Icon className="h-5 w-5 shrink-0" />{item.name}</a></Link>;'''
new = '''    return <Link key={item.name} href={item.href}><a className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setSidebarOpen(false)}><Icon className="h-5 w-5 shrink-0" /><span className="flex-1">{item.name}</span>{item.href === "/admin/suporte" && supportUnreadCount > 0 ? <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>{supportUnreadCount > 99 ? "99+" : supportUnreadCount}</span> : null}</a></Link>;'''
if 'item.href === "/admin/suporte" && supportUnreadCount' not in s:
    if old not in s: raise SystemExit('render nav point not found')
    s = s.replace(old, new, 1)
p.write_text(s)

# Admin support page: explicit browser notification permission control.
p = Path("client/src/pages/admin/Suporte.tsx")
s = p.read_text()
s = s.replace(
    'import { Circle, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";',
    'import { Bell, Circle, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";'
)
needle = '''  const send=async(event:FormEvent)=>{'''
insert = '''  const enableNotifications=async()=>{\n    if (!("Notification" in window)) return toast.error("Este navegador não oferece notificações do sistema.");\n    if (Notification.permission === "granted") return toast.success("Notificações do navegador já estão ativadas.");\n    const permission = await Notification.requestPermission();\n    if (permission === "granted") toast.success("Notificações de novas mensagens de suporte ativadas.");\n    else toast.error("Permissão de notificação não foi concedida.");\n  };\n\n  const send=async(event:FormEvent)=>{'''
if 'const enableNotifications=' not in s:
    if needle not in s: raise SystemExit('support enable notification function point not found')
    s = s.replace(needle, insert, 1)
old = '''        <Button variant="outline" onClick={()=>loadList()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>'''
new = '''        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={enableNotifications}><Bell className="mr-2 h-4 w-4"/>Ativar notificações</Button><Button variant="outline" onClick={()=>loadList()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button></div>'''
if 'Ativar notificações' not in s:
    if old not in s: raise SystemExit('support header button point not found')
    s = s.replace(old, new, 1)
p.write_text(s)

print('support notifications patched')
