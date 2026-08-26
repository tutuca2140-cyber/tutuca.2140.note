import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Wallet,
  Car,
  FileText,
  Settings,
  LogOut,
  Database,
  Shield,
  Menu,
  X,
  ClipboardList,
  CalendarDays,
  Package,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, logout } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });

  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: availableDatabases = [] } = trpc.databases.list.useQuery(
    undefined,
    { enabled: Boolean(user) }
  );
  const { data: activeDatabase } = trpc.databases.getActive.useQuery(
    undefined,
    { enabled: Boolean(user) }
  );
  const setActiveDatabase = trpc.databases.setActive.useMutation();

  useEffect(() => {
    if (user?.dashboardOnly && location !== "/dashboard") {
      navigate("/dashboard", { replace: true });
    }
  }, [location, navigate, user?.dashboardOnly]);

  const handleDatabaseChange = async (value: string) => {
    try {
      await setActiveDatabase.mutateAsync({ id: Number(value) });
      await Promise.all([
        utils.databases.getActive.invalidate(),
        utils.invalidate(),
      ]);
      toast.success("Banco de dados alterado.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o banco."
      );
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/login";
    } catch {
      toast.error("Erro ao fazer logout");
    }
  };

  const isActive = (path: string) => {
    return location === path || location.startsWith(path + "/");
  };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const regularAccess = !user?.dashboardOnly;

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      show: true,
    },
    {
      name: "Clientes",
      href: "/clientes",
      icon: Users,
      show: user?.canView && regularAccess,
    },
    {
      name: "Empréstimos",
      href: "/emprestimos",
      icon: CreditCard,
      show: user?.canView && regularAccess,
    },
    {
      name: "Pagamentos",
      href: "/pagamentos",
      icon: Wallet,
      show: user?.canView && regularAccess,
    },
    {
      name: "Caixa",
      href: "/caixa",
      icon: Wallet,
      show: user?.canView && regularAccess,
    },
    {
      name: "Agentes",
      href: "/agentes",
      icon: Users,
      show: user?.canView && regularAccess,
    },
    {
      name: "Veículos",
      href: "/veiculos",
      icon: Car,
      show: user?.canView && regularAccess,
    },
    {
      name: "Produtos",
      href: "/produtos",
      icon: Package,
      show: user?.canView && regularAccess,
    },
    {
      name: "Financiamentos",
      href: "/financiamentos",
      icon: ClipboardList,
      show: user?.canView && regularAccess,
    },
    {
      name: "Contas a receber",
      href: "/contas-a-receber",
      icon: CalendarDays,
      show: user?.canView && regularAccess,
    },
    {
      name: "Relatórios",
      href: "/relatorios",
      icon: FileText,
      show: user?.canGenerateReports && regularAccess,
    },
  ];

  const adminNavigation = [
    {
      name: "Usuários",
      href: "/admin/usuarios",
      icon: Shield,
      show: isSuperAdmin,
    },
    {
      name: "Bancos de Dados",
      href: "/admin/bancos",
      icon: Database,
      show: isAdmin,
    },
    {
      name: "Auditoria",
      href: "/admin/auditoria",
      icon: FileText,
      show: isAdmin,
    },
    {
      name: "Configurações",
      href: "/admin/configuracoes",
      icon: Settings,
      show: user?.canAccessSettings,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
          <img
            src="/brand/note-note-logo-official.png"
            alt="Note Note"
            className="h-10 w-32 object-contain object-left"
          />
        </div>
      </div>

      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen w-64 bg-background border-r border-border
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          <div className="px-4 py-4 border-b border-border">
            <img
              src="/brand/note-note-logo-official.png"
              alt="Note Note"
              className="h-auto w-full object-contain"
            />
            <p className="text-xs text-muted-foreground mt-1 tracking-wide">
              Sistema de Gestão
            </p>
          </div>

          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold">
                  {user.name?.[0]?.toUpperCase() ||
                    user.username?.[0]?.toUpperCase() ||
                    user.email?.[0]?.toUpperCase() ||
                    "U"}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.name || user.username || user.email}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role === "super_admin"
                    ? "Super Administrador"
                    : user.role}
                </p>
              </div>
            </div>
            <ThemeToggle />
            {availableDatabases.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Banco em operação
                </p>
                <Select
                  value={activeDatabase ? String(activeDatabase.id) : undefined}
                  onValueChange={handleDatabaseChange}
                  disabled={setActiveDatabase.isPending}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecionar banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDatabases.map(database => (
                      <SelectItem key={database.id} value={String(database.id)}>
                        {database.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {navigation
              .filter(item => item.show)
              .map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link key={item.name} href={item.href}>
                    <a
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                        transition-colors
                        ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }
                      `}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </a>
                  </Link>
                );
              })}

            {(isAdmin || user?.canAccessSettings) && (
              <>
                <div className="pt-4 pb-2">
                  <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Administração
                  </p>
                </div>

                {adminNavigation
                  .filter(item => item.show)
                  .map(item => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link key={item.name} href={item.href}>
                        <a
                          className={`
                            flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                            transition-colors
                            ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }
                          `}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <Icon className="h-5 w-5" />
                          {item.name}
                        </a>
                      </Link>
                    );
                  })}
              </>
            )}
          </nav>

          <div className="p-4 border-t border-border">
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 mr-3" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <main className="pt-20 px-4 pb-8 sm:px-6 lg:pt-0 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
