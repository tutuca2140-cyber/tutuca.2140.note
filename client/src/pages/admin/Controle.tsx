import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Activity,
  ArrowRight,
  Banknote,
  Building2,
  CreditCard,
  Database,
  Eye,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

type ControlData = {
  generatedAt: string;
  summary: {
    users: Record<string, any>;
    subscriptions: Record<string, any>;
    accesses: Record<string, any>;
    sessions: Record<string, any>;
    operations: Record<string, any>;
    databases: Record<string, any>;
  };
  recentAccess: Array<Record<string, any>>;
  users: Array<Record<string, any>>;
  recentAudits: Array<Record<string, any>>;
};

function cents(value: unknown) {
  return money.format(Number(value || 0) / 100);
}

function amount(value: unknown) {
  return money.format(Number(value || 0));
}

function safeDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

function StatCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  note?: string;
  icon: any;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
          {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        <div className="rounded-xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminControle() {
  const { user, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });
  const [, navigate] = useLocation();
  const [data, setData] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "commercial" | "internal">("all");

  useEffect(() => {
    if (!authLoading && user && user.role !== "super_admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/control-panel", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível carregar o painel.");
      }
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "super_admin") void load();
  }, [user?.role]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.users ?? []).filter(item => {
      const commercial = item.loginMethod === "commercial_signup";
      if (filter === "active" && !item.isActive) return false;
      if (filter === "commercial" && !commercial) return false;
      if (filter === "internal" && commercial) return false;
      if (!normalized) return true;
      return [item.name, item.username, item.email, item.databaseNames, item.plan]
        .some(value => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [data?.users, filter, query]);

  if (authLoading || !user || user.role !== "super_admin") {
    return null;
  }

  const s = data?.summary;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              Exclusivo do Super Administrador
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Painel de Controle</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Visão central dos acessos ao Note Note, usuários, assinaturas, valores, bancos e movimentação operacional.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar painel
          </Button>
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Usuários ativos" value={Number(s?.users?.active || 0)} note={`${Number(s?.users?.total || 0)} usuários cadastrados`} icon={UserCheck} />
          <StatCard title="Clientes comerciais" value={Number(s?.users?.commercial || 0)} note={`${Number(s?.subscriptions?.pending || 0)} aguardando pagamento`} icon={Users} />
          <StatCard title="Acessos hoje" value={Number(s?.accesses?.today || 0)} note={`${Number(s?.accesses?.seven_days || 0)} nos últimos 7 dias`} icon={Activity} />
          <StatCard title="Sessões ativas" value={Number(s?.sessions?.active || 0)} note="Logins ainda válidos neste momento" icon={Eye} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Planos selecionados" value={cents(s?.subscriptions?.selectedValueCents)} note={`${Number(s?.subscriptions?.basic || 0)} Basic · ${Number(s?.subscriptions?.plus || 0)} Plus`} icon={CreditCard} />
          <StatCard title="Valor pendente" value={cents(s?.subscriptions?.pendingValueCents)} note="Cadastros comerciais ainda sem confirmação de pagamento" icon={Banknote} />
          <StatCard title="Receita mensal ativa" value={cents(s?.subscriptions?.activeMonthlyValueCents)} note="Somente assinaturas marcadas como ativas/pagas" icon={Wallet} />
          <StatCard title="Bancos cadastrados" value={Number(s?.databases?.total || 0)} note={`${Number(s?.databases?.active || 0)} marcados como ativos`} icon={Database} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo operacional agregado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Clientes nos bancos</p><p className="mt-1 text-xl font-bold">{Number(s?.operations?.clients || 0)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Empréstimos ativos/atrasados</p><p className="mt-1 text-xl font-bold">{Number(s?.operations?.active_loans || 0)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Entradas lançadas</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.entries)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saídas lançadas</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.exits)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saldo agregado</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.balance)}</p></div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Estes valores representam os lançamentos operacionais dos bancos cadastrados no Note Note e não a receita de assinatura da plataforma.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-4">
          {[
            ["Gerenciar usuários", "Criar, editar, ativar, desativar, redefinir senha e permissões.", "/admin/usuarios", Users],
            ["Gerenciar bancos", "Criar, editar, duplicar e administrar os bancos de dados.", "/admin/bancos", Database],
            ["Auditoria", "Consultar alterações e ações administrativas registradas.", "/admin/auditoria", History],
            ["Configurações", "Ajustar configurações administrativas da plataforma.", "/admin/configuracoes", Building2],
          ].map(([title, description, href, Icon]: any) => (
            <Link href={href} key={href}>
              <a className="group rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Abrir <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </a>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle>Usuários e clientes</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Lista consolidada para facilitar a administração dos acessos.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-[260px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nome, usuário, e-mail ou banco" className="pl-9" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", "Todos"],
                    ["active", "Ativos"],
                    ["commercial", "Comerciais"],
                    ["internal", "Grátis/Teste"],
                  ] as const).map(([value, label]) => (
                    <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{label}</Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Plano</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Bancos</th>
                    <th className="px-4 py-3">Último login</th>
                    <th className="px-4 py-3">Sessão</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredUsers.map(item => {
                    const commercial = item.loginMethod === "commercial_signup";
                    return (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{item.name || item.username || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{item.username || "—"} · {item.email || "sem e-mail"}</p>
                        </td>
                        <td className="px-4 py-3"><Badge variant={commercial ? "default" : "secondary"}>{commercial ? "Comercial" : "Grátis/Teste"}</Badge></td>
                        <td className="px-4 py-3">{item.plan ? <><span className="font-semibold capitalize">{item.plan}</span><div className="text-xs text-muted-foreground">{cents(item.priceCents)}/mês</div></> : "—"}</td>
                        <td className="px-4 py-3"><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Ativo" : commercial && item.subscriptionStatus === "pending_payment" ? "Aguardando pagamento" : "Inativo"}</Badge></td>
                        <td className="px-4 py-3"><p>{Number(item.databaseCount || 0)}</p><p className="max-w-[250px] truncate text-xs text-muted-foreground">{item.databaseNames || "Nenhum banco"}</p></td>
                        <td className="px-4 py-3">{safeDate(item.lastSignedIn)}</td>
                        <td className="px-4 py-3"><Badge variant={item.hasActiveSession ? "default" : "secondary"}>{item.hasActiveSession ? "Online/ativa" : "Sem sessão"}</Badge></td>
                      </tr>
                    );
                  })}
                  {!filteredUsers.length && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <Link href="/admin/usuarios"><a className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Abrir gerenciamento completo <ArrowRight className="h-4 w-4" /></a></Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <Card>
            <CardHeader>
              <CardTitle>Acessos recentes ao site</CardTitle>
              <p className="text-sm text-muted-foreground">Últimos 100 acessos registrados. O rastreamento completo de páginas começa nesta atualização.</p>
            </CardHeader>
            <CardContent>
              <div className="max-h-[560px] overflow-auto rounded-xl border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Página</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">IP</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.recentAccess ?? []).map(item => (
                      <tr key={item.id}><td className="whitespace-nowrap px-4 py-3">{safeDate(item.createdAt)}</td><td className="px-4 py-3 font-medium">{item.path}</td><td className="px-4 py-3">{item.name || item.username || item.email || <span className="text-muted-foreground">Visitante</span>}</td><td className="px-4 py-3 text-xs text-muted-foreground">{item.ipAddress || "—"}</td></tr>
                    ))}
                    {!data?.recentAccess?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Os primeiros acessos aparecerão aqui.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atividade administrativa recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.recentAudits ?? []).slice(0, 12).map(item => (
                <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-sm font-semibold">{item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.username || "Sistema"} · {item.entity || "—"}</p></div>
                    <Badge variant={item.status === "success" ? "default" : "outline"}>{item.status || "—"}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{safeDate(item.createdAt)}</p>
                </div>
              ))}
              {!data?.recentAudits?.length && <p className="text-sm text-muted-foreground">Nenhuma atividade de auditoria disponível.</p>}
            </CardContent>
          </Card>
        </div>

        {data?.generatedAt ? <p className="text-right text-xs text-muted-foreground">Atualizado em {safeDate(data.generatedAt)}</p> : null}
      </div>
    </DashboardLayout>
  );
}
