import { useAuth } from "@/_core/hooks/useAuth";
import FinancialSummaryDonut from "@/components/FinancialSummaryDonut";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommercialContext } from "@/hooks/useCommercialContext";
import { trpc } from "@/lib/trpc";
import {
  Activity, Building2, CalendarDays, Car, ChevronRight, ClipboardList, CreditCard, Database,
  FileText, KeyRound, LayoutDashboard, LogOut, Mail, Menu, MessageCircle, MoreHorizontal, Package, Settings, Shield,
  UserRound, UserRoundCog, Users, Wallet, X,
} from "lucide-react";
import { Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

interface DashboardLayoutProps { children: ReactNode }
type NavItem = { name: string; href: string; icon: typeof LayoutDashboard; show?: boolean };

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const { data: commercialContext } = useCommercialContext();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: availableDatabases = [] } = trpc.databases.list.useQuery(undefined, { enabled: Boolean(user) });
  const { data: activeDatabase } = trpc.databases.getActive.useQuery(undefined, { enabled: Boolean(user) });
  const setActiveDatabase = trpc.databases.setActive.useMutation();

  useEffect(() => { if (user?.dashboardOnly && location !== "/dashboard") navigate("/dashboard", { replace: true }); }, [location, navigate, user?.dashboardOnly]);
  useEffect(() => { setSidebarOpen(false); }, [location]);
  const isActive = (path: string) => location === path || location.startsWith(path + "/");

  const handleDatabaseChange = async (value: string) => {
    try { await setActiveDatabase.mutateAsync({ id: Number(value) }); await Promise.all([utils.databases.getActive.invalidate(), utils.invalidate()]); toast.success("Banco de dados alterado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar o banco."); }
  };
  const handleLogout = async () => { try { await logout(); window.location.href = "/login"; } catch { toast.error("Erro ao fazer logout"); } };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const regularAccess = !user?.dashboardOnly;
  const commercialAccount = Boolean(commercialContext?.commercial);
  const canManageOwnDatabases = Boolean(commercialAccount && commercialContext?.permissions.canManageDatabases);
  const canManageTeam = Boolean(commercialAccount && commercialContext?.permissions.canManageUsers);

  const navigation: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Clientes", href: "/clientes", icon: Users, show: Boolean(user?.canView && regularAccess) },
    { name: "Empréstimos", href: "/emprestimos", icon: CreditCard, show: Boolean(user?.canView && regularAccess) },
    { name: "Veículos", href: "/veiculos", icon: Car, show: Boolean(user?.canView && regularAccess) },
    { name: "Produtos", href: "/produtos", icon: Package, show: Boolean(user?.canView && regularAccess) },
    { name: "Imóveis", href: "/imoveis", icon: Building2, show: Boolean(user?.canView && regularAccess) },
    { name: "Aluguéis", href: "/alugueis", icon: KeyRound, show: Boolean(user?.canView && regularAccess) },
    { name: "Pagamentos", href: "/pagamentos", icon: Wallet, show: Boolean(user?.canView && regularAccess) },
    { name: "Financiamentos", href: "/financiamentos", icon: ClipboardList, show: Boolean(user?.canView && regularAccess) },
    { name: "Contas a receber", href: "/contas-a-receber", icon: CalendarDays, show: Boolean(user?.canView && regularAccess) },
    { name: "Caixa", href: "/caixa", icon: Wallet, show: Boolean(user?.canView && regularAccess) },
    { name: "Relatórios", href: "/relatorios", icon: FileText, show: Boolean(user?.canGenerateReports && regularAccess) },
    { name: "Agentes", href: "/agentes", icon: Users, show: Boolean(user?.canView && regularAccess) },
    { name: "Meu Banco", href: "/meu-banco", icon: Database, show: Boolean(canManageOwnDatabases && regularAccess) },
    { name: "Equipe", href: "/equipe", icon: UserRoundCog, show: Boolean(canManageTeam && regularAccess) },
  ];
  const adminNavigation: NavItem[] = [
    { name: "Painel de Controle", href: "/admin/controle", icon: Activity, show: isSuperAdmin },
    { name: "Assinaturas", href: "/admin/assinaturas", icon: CreditCard, show: isSuperAdmin },
    { name: "Marketing", href: "/admin/marketing", icon: Mail, show: isSuperAdmin },
    { name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: isSuperAdmin },
    { name: "Usuários", href: "/admin/usuarios", icon: Shield, show: isSuperAdmin },
    { name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: Boolean(isAdmin) },
    { name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: Boolean(isAdmin) },
    { name: "Configurações", href: "/admin/configuracoes", icon: Settings, show: Boolean(user?.canAccessSettings) },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" /><p className="mt-4 text-muted-foreground">Carregando...</p></div></div>;
  if (!user) return null;

  let renderedChildren = children;
  if (location === "/dashboard" && isValidElement(children)) {
    const root = children as ReactElement<{ children?: ReactNode }>;
    const sections = Children.toArray(root.props.children);
    renderedChildren = cloneElement(root, undefined, sections.length ? [sections[0], <FinancialSummaryDonut key="financial-summary-donut" />, ...sections.slice(1)] : [<FinancialSummaryDonut key="financial-summary-donut" />]);
  }

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon; const active = isActive(item.href);
    return <Link key={item.name} href={item.href}><a className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setSidebarOpen(false)}><Icon className="h-5 w-5 shrink-0" />{item.name}</a></Link>;
  };

  const accountLabel = user.role === "super_admin" ? "Super Administrador" : commercialContext?.commercial ? commercialContext.isOwner ? `Contratante ${commercialContext.plan === "plus" ? "Plus" : "Basic"}` : "Usuário da conta" : user.role;
  const visibleNavigation = navigation.filter(item => item.show);
  const mobileQuickHrefs = ["/dashboard", "/clientes", "/pagamentos", "/caixa"];
  const mobileQuickNavigation = mobileQuickHrefs.map(href => visibleNavigation.find(item => item.href === href)).filter((item): item is NavItem => Boolean(item));

  return <div className="app-shell min-h-screen bg-muted/30">
    <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border/70 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75"><div className="flex h-full items-center justify-between px-3"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Abrir menu">{sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button><img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-8 w-24 object-contain object-left" />{activeDatabase && <span className="hidden min-[390px]:block max-w-28 truncate rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{activeDatabase.name}</span>}</div><Link href="/perfil"><a className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/10" aria-label="Meu perfil">{user.name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || <UserRound className="h-4 w-4" />}</a></Link></div></header>

    <aside className={`fixed top-0 left-0 z-[60] h-[100dvh] w-[min(86vw,320px)] bg-background border-r border-border shadow-2xl transition-transform duration-200 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:z-40 lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none`}><div className="flex h-full flex-col">
      <div className="hidden px-4 py-4 border-b border-border lg:block"><img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-auto w-full object-contain" /><p className="text-xs text-muted-foreground mt-1 tracking-wide">Sistema de Gestão</p></div>
      <div className="border-b border-border bg-muted/20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:p-4"><div className="mb-2 flex items-center justify-between lg:hidden"><img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-8 w-24 object-contain object-left" /><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></Button></div><Link href="/perfil"><a className={`group flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${isActive("/perfil") ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-background"}`} onClick={() => setSidebarOpen(false)}><div className="w-9 h-9 lg:w-10 lg:h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center"><span className="text-primary font-semibold">{user.name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}</span></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{user.name || user.username || user.email}</p><p className="text-[11px] text-muted-foreground capitalize truncate">{accountLabel}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></a></Link><div className="mt-2 lg:mt-3"><ThemeToggle /></div>{availableDatabases.length > 0 && <div className="mt-2 lg:mt-3"><p className="mb-1 text-[11px] font-medium text-muted-foreground">Banco em operação</p>{isSuperAdmin ? <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">Bancos de clientes ficam protegidos em Super Admin → Bancos de Dados.</p> : null}<Select value={activeDatabase ? String(activeDatabase.id) : undefined} onValueChange={handleDatabaseChange} disabled={setActiveDatabase.isPending}><SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Selecionar banco" /></SelectTrigger><SelectContent>{availableDatabases.map(database => <SelectItem key={database.id} value={String(database.id)}>{database.name}</SelectItem>)}</SelectContent></Select></div>}</div>
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-0.5 lg:py-4 lg:space-y-1">{visibleNavigation.map(renderNavItem)}{(isAdmin || user?.canAccessSettings) && <><div className="pt-4 pb-2"><p className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Administração</p></div>{adminNavigation.filter(item => item.show).map(renderNavItem)}</>}</nav>
      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-4"><Button variant="ghost" className="h-10 w-full justify-start rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}><LogOut className="h-5 w-5 mr-3" />Sair</Button></div>
    </div></aside>

    <div className="lg:pl-64"><main className="app-mobile-content px-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-[4.25rem] sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto w-full max-w-[1600px]">{renderedChildren}</div></main></div>
    <nav className="mobile-app-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/92 px-2 pt-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80"><div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]">{mobileQuickNavigation.map(item => { const Icon = item.icon; const active = isActive(item.href); return <Link key={item.href} href={item.href}><a className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-all active:scale-95 ${active ? "text-primary" : "text-muted-foreground"}`}><span className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${active ? "bg-primary/12" : ""}`}><Icon className="h-[19px] w-[19px]" /></span><span className="max-w-full truncate">{item.name}</span></a></Link>; })}{Array.from({ length: Math.max(0, 4 - mobileQuickNavigation.length) }).map((_, index) => <span key={`empty-${index}`} />)}<button type="button" onClick={() => setSidebarOpen(true)} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-all active:scale-95 ${sidebarOpen ? "text-primary" : "text-muted-foreground"}`}><span className={`flex h-7 w-10 items-center justify-center rounded-full ${sidebarOpen ? "bg-primary/12" : ""}`}><MoreHorizontal className="h-5 w-5" /></span><span>Mais</span></button></div></nav>
    {sidebarOpen && <div className="fixed inset-0 z-[55] bg-black/45 backdrop-blur-[2px] lg:hidden" onClick={() => setSidebarOpen(false)} />}
  </div>;
}
