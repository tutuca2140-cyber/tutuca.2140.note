import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, CreditCard, Wallet, Car, FileText, Settings,
  LogOut, Database, Shield, Menu, X, ClipboardList
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

interface DashboardLayoutProps { children: React.ReactNode; }

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.replace("/login");
    } catch {
      toast.error("Erro ao fazer logout.");
    }
  };

  const isActive = (path: string) => location === path || location.startsWith(path + "/");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Clientes", href: "/clientes", icon: Users, show: user?.canView },
    { name: "Empréstimos", href: "/emprestimos", icon: CreditCard, show: user?.canView },
    { name: "Pagamentos", href: "/pagamentos", icon: Wallet, show: user?.canView },
    { name: "Caixa", href: "/caixa", icon: Wallet, show: user?.canView },
    { name: "Agentes", href: "/agentes", icon: Users, show: user?.canView },
    { name: "Veículos", href: "/veiculos", icon: Car, show: user?.canView },
    { name: "Vendas de Veículos", href: "/vendas-veiculos", icon: Wallet, show: user?.canView },
    { name: "Financiamentos", href: "/financiamentos", icon: ClipboardList, show: user?.canView },
    { name: "Relatórios", href: "/relatorios", icon: FileText, show: user?.canGenerateReports },
  ];

  const adminNavigation = [
    { name: "Usuários", href: "/admin/usuarios", icon: Shield, show: user?.role === "super_admin" },
    { name: "Bancos de Dados", href: "/admin/bancos", icon: Database, show: isAdmin },
    { name: "Auditoria", href: "/admin/auditoria", icon: FileText, show: isAdmin },
    { name: "Configurações", href: "/admin/configuracoes", icon: Settings, show: user?.canAccessSettings },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    </div>;
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-border p-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <span className="font-bold text-primary tracking-wider">NOTE NOTE</span>
      </div>

      <aside className={`fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-border
        transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-border">
            <h1 className="text-2xl font-bold text-primary tracking-[0.1em]">NOTE NOTE</h1>
            <p className="text-xs text-muted-foreground mt-1">Sistema de Gestão</p>
          </div>
          <div className="p-4 border-b border-border bg-muted/30">
            <p className="text-sm font-medium truncate">{user.name || user.username || user.email}</p>
            <p className="text-xs text-muted-foreground">
              {user.role === "super_admin" ? "Super Administrador" : user.role}
            </p>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.filter(i => i.show).map(item => {
              const Icon = item.icon;
              return <Link key={item.name} href={item.href}>
                <a className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`} onClick={() => setSidebarOpen(false)}>
                  <Icon className="h-5 w-5" />{item.name}
                </a>
              </Link>;
            })}

            {(isAdmin || user?.canAccessSettings) && <>
              <div className="pt-4 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Administração</div>
              {adminNavigation.filter(i => i.show).map(item => {
                const Icon = item.icon;
                return <Link key={item.name} href={item.href}>
                  <a className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`} onClick={() => setSidebarOpen(false)}>
                    <Icon className="h-5 w-5" />{item.name}
                  </a>
                </Link>;
              })}
            </>}
          </nav>

          <div className="p-4 border-t">
            <Button variant="ghost" className="w-full justify-start text-destructive" onClick={handleLogout}>
              <LogOut className="h-5 w-5 mr-3" />Sair
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <main className="pt-20 lg:pt-0 p-6">{children}</main>
      </div>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}
