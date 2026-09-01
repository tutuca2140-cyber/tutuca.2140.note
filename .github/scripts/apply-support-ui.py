from pathlib import Path

def patch(path, old, new):
    p=Path(path)
    s=p.read_text()
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'pattern not found: {path}: {old[:80]}')
    p.write_text(s.replace(old,new,1))

patch(
    'client/src/pages/Tutorial.tsx',
    'import DashboardLayout from "@/components/DashboardLayout";',
    'import DashboardLayout from "@/components/DashboardLayout";\nimport SupportChat from "@/components/SupportChat";'
)
patch(
    'client/src/pages/Tutorial.tsx',
    '        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">',
    '        <SupportChat />\n\n        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">'
)
patch(
    'client/src/App.tsx',
    'const AdminMarketing = lazy(() => import("./pages/admin/Marketing"));',
    'const AdminMarketing = lazy(() => import("./pages/admin/Marketing"));\nconst AdminSuporte = lazy(() => import("./pages/admin/Suporte"));'
)
patch(
    'client/src/App.tsx',
    '<Route path={"/admin/marketing"} component={AdminMarketing} />',
    '<Route path={"/admin/marketing"} component={AdminMarketing} />\n      <Route path={"/admin/suporte"} component={AdminSuporte} />'
)
p=Path('client/src/components/DashboardLayout.tsx')
s=p.read_text()
if 'MessageCircle' not in s.split('} from "lucide-react";')[0]:
    old='FileText, KeyRound, LayoutDashboard, LogOut, Mail, Menu, MoreHorizontal, Package, Settings, Shield,'
    new='FileText, KeyRound, LayoutDashboard, LogOut, Mail, Menu, MessageCircle, MoreHorizontal, Package, Settings, Shield,'
    if old not in s: raise SystemExit('lucide import pattern not found')
    s=s.replace(old,new,1)
if 'href: "/admin/suporte"' not in s:
    old='{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: isSuperAdmin },'
    new='{ name: "Marketing", href: "/admin/marketing", icon: Mail, show: isSuperAdmin },\n    { name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: isSuperAdmin },'
    if old not in s: raise SystemExit('admin navigation pattern not found')
    s=s.replace(old,new,1)
p.write_text(s)
