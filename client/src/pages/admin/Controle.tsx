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
  Download,
  Eye,
  HardDrive,
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
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

type ControlData = {
  generatedAt: string;
  summary: {
    users: Record<string, any>;
    subscriptions: Record<string, any>;
    accesses: Record<string, any>;
    sessions: Record<string, any>;
    operations: Record<string, any>;
    databases: Record<string, any>;
    storage: Record<string, any>;
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

function formatBytes(value: unknown) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && size >= 1024; i += 1) {
    size /= 1024;
    unit = units[i];
  }
  return `${size.toLocaleString("pt-BR", { minimumFractionDigits: size < 100 ? 1 : 0, maximumFractionDigits: 1 })} ${unit}`;
}

function safeDate(value: unknown, withTime = true) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? dateTime.format(date) : dateOnly.format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function billingLabel(account: any) {
  return account.billingMethod === "pix_annual" ? "Pix anual" : account.billingMethod === "card_monthly" ? "Cartão mensal" : "—";
}

function paymentLabel(account: any) {
  if (account.paymentState === "trial") return "Teste grátis";
  if (account.paymentState === "paid") return "Ativo / pago";
  if (account.paymentState === "unpaid") return "Não pago / em atraso";
  if (account.paymentState === "canceled") return "Cancelado";
  return "Pendente / não fechou o plano";
}

function lifecycleLabel(account: any) {
  const now = Date.now();
  const paidUntil = account.paidUntil ? new Date(account.paidUntil).getTime() : 0;
  const trialEndsAt = account.trialEndsAt ? new Date(account.trialEndsAt).getTime() : 0;
  if (account.status === "canceled" || account.paymentState === "canceled") return "Contrato cancelado";
  if (account.billingMethod === "pix_annual" && paidUntil && paidUntil < now) return "Contrato concluído / vencido";
  if (!account.isActive && account.status !== "pending_payment") return "Cliente inativo";
  if (account.status === "past_due") return "Inadimplente / pagamento pendente";
  if (account.status === "pending_payment") return "Pré-cadastro / não concluiu contratação";
  if (trialEndsAt > now && account.paymentState === "trial") return "Período de teste";
  if (account.status === "active" || account.status === "paid") return "Contrato ativo";
  return account.status || "Sem classificação";
}

function formatUsage(value: unknown) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}min` : ""}` : `${rest} min`;
}

function exportCommercialExcel(accounts: any[]) {
  if (!accounts.length) return toast.error("Não há clientes comerciais para exportar.");
  const headers = [
    "ID interno", "ID de usuário (9 dígitos)", "Nome completo", "Usuário", "E-mail", "WhatsApp", "Situação comercial",
    "Status de pagamento", "Status interno", "Conta ativa", "Plano", "Forma de cobrança",
    "Valor contratado", "Provedor", "Status no provedor", "Último status de pagamento",
    "ID do último pagamento", "Fim do teste grátis", "Validade / pago até", "Expiração do Pix",
    "Cadastro", "Última atualização da assinatura", "Último login", "Último acesso", "Tempo de uso",
    "Bancos utilizados", "Limite de bancos", "Nomes dos bancos", "Provisionado", "Último webhook",
    "ID assinatura provedor", "ID checkout provedor", "ID cliente provedor", "Link da cobrança"
  ];
  const rows = accounts.map(account => [
    account.id,
    account.supportId || "",
    account.name || account.username,
    account.username || "",
    account.email || "",
    account.whatsapp || "",
    lifecycleLabel(account),
    paymentLabel(account),
    account.status || "",
    account.isActive ? "Sim" : "Não",
    account.plan === "plus" ? "Plus" : "Basic",
    billingLabel(account),
    money.format(Number(account.priceCents || 0) / 100),
    account.provider || "",
    account.providerStatus || "",
    account.lastPaymentStatus || "",
    account.lastPaymentId || "",
    safeDate(account.trialEndsAt, false),
    account.billingMethod === "pix_annual" ? safeDate(account.paidUntil, false) : "Renovação mensal",
    safeDate(account.pixExpiresAt, false),
    safeDate(account.createdAt),
    safeDate(account.subscriptionUpdatedAt),
    safeDate(account.lastSignedIn),
    safeDate(account.lastAccessAt),
    formatUsage(account.usageMinutes),
    Number(account.databaseCount || 0),
    Number(account.databaseLimit || 0),
    account.databaseNames || "",
    account.provisionedAt ? `Sim — ${safeDate(account.provisionedAt)}` : "Não",
    safeDate(account.lastWebhookAt),
    account.providerSubscriptionId || "",
    account.providerCheckoutId || "",
    account.providerCustomerId || "",
    account.checkoutUrl || "",
  ]);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}th{background:#eaf2ff;font-weight:bold}th,td{border:1px solid #b8c2d1;padding:6px;white-space:nowrap}h2,p{font-family:Arial,sans-serif}</style></head><body><h2>Relatório detalhado de clientes e assinaturas — Note Note</h2><p>Gerado em ${escapeHtml(dateTime.format(new Date()))} · ${accounts.length} cliente(s)</p><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-detalhado-clientes-notenote-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success("Relatório detalhado em Excel gerado.");
}

function StatCard({ title, value, note, icon: Icon }: { title: string; value: string | number; note?: string; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
          {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
        </div>
        <div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}

export default function AdminControle() {
  const { user, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, navigate] = useLocation();
  const [data, setData] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "commercial" | "internal">("all");

  useEffect(() => {
    if (!authLoading && user && !(user.role === "super_admin" || (user.role === "admin" && user.canAdminControl))) navigate("/dashboard", { replace: true });
  }, [authLoading, navigate, user]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/control-panel", { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível carregar o painel.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.role === "super_admin" || (user?.role === "admin" && user?.canAdminControl)) void load(); }, [user?.role, user?.canAdminControl]);

  const downloadDetailedReport = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/admin/commercial-accounts", { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível gerar o relatório.");
      exportCommercialExcel(result.accounts ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o relatório.");
    } finally {
      setExporting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.users ?? []).filter(item => {
      const commercial = item.loginMethod === "commercial_signup";
      if (filter === "active" && !item.isActive) return false;
      if (filter === "commercial" && !commercial) return false;
      if (filter === "internal" && commercial) return false;
      if (!normalized) return true;
      return [item.name, item.username, item.email, item.supportId, item.databaseNames, item.plan]
        .some(value => String(value ?? "").toLowerCase().includes(normalized));
    });
  }, [data?.users, filter, query]);

  if (authLoading || !user || !(user.role === "super_admin" || (user.role === "admin" && user.canAdminControl))) return null;

  const s = data?.summary;
  const storage = s?.storage ?? {};
  const storagePercent = Math.min(100, Math.max(0, Number(storage.usedPercent || 0)));
  const storageWarning = storagePercent >= 80;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Painel administrativo autorizado</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Painel de Controle</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">Visão central dos acessos ao Note Note, usuários, assinaturas, valores, bancos e movimentação operacional.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadDetailedReport} disabled={exporting || !(user.role === "super_admin" || user.canAdminSubscriptions)}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Baixar relatório detalhado
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar painel
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <strong>Excel comercial completo:</strong> o mesmo relatório detalhado da área de Assinaturas pode ser baixado daqui, incluindo status, pagamento, cancelamento, inatividade, contatos, WhatsApp, e-mail, plano, Asaas, acessos e bancos.
        </div>

        {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}

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

        <Card className={storageWarning ? "border-amber-300" : undefined}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" />Memória do banco de dados — Neon</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Uso do armazenamento PostgreSQL comparado ao limite atual do plano Neon.</p>
              </div>
              <Badge variant={storageWarning ? "destructive" : "secondary"}>Plano {storage.plan || "Free"} · {formatBytes(storage.limitBytes)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div><p className="text-sm text-muted-foreground">Memória utilizada</p><p className="text-3xl font-black tracking-tight">{formatBytes(storage.usedBytes)}</p></div>
                <p className={`text-lg font-bold ${storageWarning ? "text-amber-600" : "text-primary"}`}>{storagePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted"><div className={storageWarning ? "h-full rounded-full bg-amber-500 transition-all" : "h-full rounded-full bg-primary transition-all"} style={{ width: `${storagePercent}%` }} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Utilizado</p><p className="mt-1 text-xl font-bold">{formatBytes(storage.usedBytes)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Restante</p><p className="mt-1 text-xl font-bold">{formatBytes(storage.remainingBytes)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limite do plano</p><p className="mt-1 text-xl font-bold">{formatBytes(storage.limitBytes)}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Resumo operacional agregado</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Clientes nos bancos</p><p className="mt-1 text-xl font-bold">{Number(s?.operations?.clients || 0)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Empréstimos ativos/atrasados</p><p className="mt-1 text-xl font-bold">{Number(s?.operations?.active_loans || 0)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Entradas lançadas</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.entries)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saídas lançadas</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.exits)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saldo agregado</p><p className="mt-1 text-xl font-bold">{amount(s?.operations?.balance)}</p></div>
            </div>
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
              <div><CardTitle>Usuários e clientes</CardTitle><p className="mt-1 text-sm text-muted-foreground">Lista consolidada para facilitar a administração dos acessos.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-[260px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar nome, ID, usuário, e-mail ou banco" className="pl-9" /></div>
                <div className="flex flex-wrap gap-2">
                  {([ ["all", "Todos"], ["active", "Ativos"], ["commercial", "Comerciais"], ["internal", "Grátis/Teste"] ] as const).map(([value, label]) => (
                    <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{label}</Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Bancos</th><th className="px-4 py-3">Último login</th><th className="px-4 py-3">Sessão</th></tr></thead>
                <tbody className="divide-y">
                  {filteredUsers.map(item => {
                    const commercial = item.loginMethod === "commercial_signup";
                    return (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3"><p className="font-semibold">{item.name || item.username || "Sem nome"}</p><p className="text-xs text-muted-foreground">{item.username || "—"} · {item.email || "sem e-mail"}</p>{commercial ? <p className="mt-1 font-mono text-xs font-semibold text-primary">ID {item.supportId || "—"}</p> : null}</td>
                        <td className="px-4 py-3"><Badge variant={commercial ? "default" : "secondary"}>{commercial ? "Comercial" : "Grátis/Teste"}</Badge></td>
                        <td className="px-4 py-3">{item.plan ? <><span className="font-semibold capitalize">{item.plan}</span><div className="text-xs text-muted-foreground">{cents(item.priceCents)}</div></> : "—"}</td>
                        <td className="px-4 py-3"><Badge variant={item.isActive ? "default" : "outline"}>{item.isActive ? "Ativo" : commercial && item.subscriptionStatus === "pending_payment" ? "Aguardando pagamento" : "Inativo"}</Badge></td>
                        <td className="px-4 py-3"><p>{Number(item.databaseCount || 0)}</p><p className="max-w-[250px] truncate text-xs text-muted-foreground">{item.databaseNames || "Nenhum banco"}</p></td>
                        <td className="px-4 py-3">{safeDate(item.lastSignedIn)}</td>
                        <td className="px-4 py-3"><Badge variant={item.hasActiveSession ? "default" : "secondary"}>{item.hasActiveSession ? "Online/ativa" : "Sem sessão"}</Badge></td>
                      </tr>
                    );
                  })}
                  {!filteredUsers.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end"><Link href="/admin/usuarios"><a className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Abrir gerenciamento completo <ArrowRight className="h-4 w-4" /></a></Link></div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <Card>
            <CardHeader><CardTitle>Acessos recentes ao site</CardTitle><p className="text-sm text-muted-foreground">Últimos 100 acessos registrados.</p></CardHeader>
            <CardContent>
              <div className="max-h-[560px] overflow-auto rounded-xl border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Página</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">IP</th></tr></thead>
                  <tbody className="divide-y">
                    {(data?.recentAccess ?? []).map(item => <tr key={item.id}><td className="whitespace-nowrap px-4 py-3">{safeDate(item.createdAt)}</td><td className="px-4 py-3 font-medium">{item.path}</td><td className="px-4 py-3">{item.name || item.username || item.email || <span className="text-muted-foreground">Visitante</span>}</td><td className="px-4 py-3 text-xs text-muted-foreground">{item.ipAddress || "—"}</td></tr>)}
                    {!data?.recentAccess?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Os primeiros acessos aparecerão aqui.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Atividade administrativa recente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data?.recentAudits ?? []).slice(0, 12).map(item => (
                <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{item.action}</p><p className="mt-1 text-xs text-muted-foreground">{item.username || "Sistema"} · {item.entity || "—"}</p></div><Badge variant={item.status === "success" ? "default" : "outline"}>{item.status || "—"}</Badge></div>
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
