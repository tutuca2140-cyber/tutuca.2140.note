import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type PaymentState = "paid" | "unpaid" | "pending" | "trial" | "canceled";
type CommercialAccount = {
  id: number;
  supportId?: string | null;
  username: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  isActive: boolean;
  createdAt: string;
  lastSignedIn?: string | null;
  lastAccessAt?: string | null;
  usageMinutes: number;
  paymentState: PaymentState;
  plan: "basic" | "plus";
  priceCents: number | string;
  status: string;
  provisionedAt?: string | null;
  subscriptionUpdatedAt?: string | null;
  databaseCount: number;
  databaseLimit: number;
  databaseNames?: string;
  provider?: string | null;
  providerStatus?: string | null;
  billingMethod?: "card_monthly" | "pix_annual" | string | null;
  lastPaymentStatus?: string | null;
  lastPaymentId?: string | null;
  lastWebhookAt?: string | null;
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  pixExpiresAt?: string | null;
  checkoutUrl?: string | null;
  providerSubscriptionId?: string | null;
  providerCheckoutId?: string | null;
  providerCustomerId?: string | null;
};

type CommercialResponse = {
  success: boolean;
  accounts: CommercialAccount[];
  summary: {
    total: number;
    trial: number;
    pending: number;
    overdue: number;
    active: number;
    canceled: number;
    monthlyActiveCents: number;
    annualPixActiveCents: number;
    totalUsageMinutes: number;
  };
  message?: string;
};

type SecureAction = "delete_unpaid" | "cancel_subscription";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function safeDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? dateTime.format(date) : dateOnly.format(date);
}

function formatUsage(value: number | string | null | undefined) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}min` : ""}` : `${rest} min`;
}

function paymentLabel(account: CommercialAccount) {
  if (account.paymentState === "trial") return "Teste grátis";
  if (account.paymentState === "paid") return "Ativo / pago";
  if (account.paymentState === "unpaid") return "Não pago / em atraso";
  if (account.paymentState === "canceled") return "Cancelado";
  return "Pendente / não fechou o plano";
}

function lifecycleLabel(account: CommercialAccount) {
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

function paymentBadge(account: CommercialAccount) {
  if (account.paymentState === "trial") return <Badge className="bg-blue-600">Teste grátis</Badge>;
  if (account.paymentState === "paid") return <Badge className="bg-emerald-600">Ativo / pago</Badge>;
  if (account.paymentState === "unpaid") return <Badge variant="destructive">Não pago</Badge>;
  if (account.paymentState === "canceled") return <Badge variant="secondary">Cancelado</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function billingLabel(account: CommercialAccount) {
  return account.billingMethod === "pix_annual"
    ? "Pix anual"
    : account.billingMethod === "card_monthly"
      ? "Cartão mensal"
      : "—";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadAccountsExcel(accounts: CommercialAccount[]) {
  if (!accounts.length) return toast.error("Não há assinaturas para exportar.");

  const headers = [
    "ID interno",
    "ID de usuário",
    "Nome completo",
    "Usuário",
    "E-mail",
    "WhatsApp",
    "Situação comercial",
    "Status de pagamento",
    "Status interno",
    "Conta ativa",
    "Plano",
    "Forma de cobrança",
    "Valor contratado",
    "Provedor",
    "Status no provedor",
    "Último status de pagamento",
    "ID do último pagamento",
    "Fim do teste grátis",
    "Validade / pago até",
    "Expiração do Pix",
    "Cadastro",
    "Última atualização da assinatura",
    "Último login",
    "Último acesso",
    "Tempo de uso",
    "Bancos utilizados",
    "Limite de bancos",
    "Nomes dos bancos",
    "Provisionado",
    "Último webhook",
    "ID assinatura provedor",
    "ID checkout provedor",
    "ID cliente provedor",
    "Link da cobrança",
  ];

  const rows = accounts.map(account => [
    account.id,
    account.supportId || "",
    account.name || account.username,
    account.username,
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
    safeDate(account.trialEndsAt),
    account.billingMethod === "pix_annual" ? safeDate(account.paidUntil) : "Renovação mensal",
    safeDate(account.pixExpiresAt),
    safeDate(account.createdAt, true),
    safeDate(account.subscriptionUpdatedAt, true),
    safeDate(account.lastSignedIn, true),
    safeDate(account.lastAccessAt, true),
    formatUsage(account.usageMinutes),
    Number(account.databaseCount || 0),
    Number(account.databaseLimit || 0),
    account.databaseNames || "",
    account.provisionedAt ? `Sim — ${safeDate(account.provisionedAt, true)}` : "Não",
    safeDate(account.lastWebhookAt, true),
    account.providerSubscriptionId || "",
    account.providerCheckoutId || "",
    account.providerCustomerId || "",
    account.checkoutUrl || "",
  ]);

  const title = "Relatório detalhado de clientes e assinaturas — Note Note";
  const generated = dateTime.format(new Date());
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px}th{background:#eaf2ff;font-weight:bold}th,td{border:1px solid #b8c2d1;padding:6px;white-space:nowrap}h2{font-family:Arial,sans-serif}p{font-family:Arial,sans-serif;font-size:12px}</style></head><body><h2>${escapeHtml(title)}</h2><p>Gerado em ${escapeHtml(generated)} · ${accounts.length} cliente(s)</p><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
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

export default function AdminAssinaturas() {
  const { user, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, navigate] = useLocation();
  const [data, setData] = useState<CommercialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [secureTarget, setSecureTarget] = useState<CommercialAccount | null>(null);
  const [secureAction, setSecureAction] = useState<SecureAction | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [secureLoading, setSecureLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user && !(user.role === "super_admin" || user.adminCanSubscriptions)) navigate("/dashboard", { replace: true });
  }, [authLoading, navigate, user]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/commercial-accounts", { credentials: "include", cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as CommercialResponse;
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível carregar as assinaturas.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as assinaturas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if ((user?.role === "super_admin" || user?.adminCanSubscriptions)) void load(); }, [user?.role]);

  const runAction = async (account: CommercialAccount, action: "approve" | "mark_unpaid" | "mark_paid") => {
    setActionId(account.id);
    try {
      const response = await fetch("/api/admin/commercial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, userId: account.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível atualizar a assinatura.");
      toast.success(result.message || "Assinatura atualizada.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a assinatura.");
    } finally {
      setActionId(null);
    }
  };

  const openSecureAction = (account: CommercialAccount, action: SecureAction) => {
    setSecureTarget(account);
    setSecureAction(action);
    setAdminPassword("");
  };

  const confirmSecureAction = async () => {
    if (!secureTarget || !secureAction) return;
    if (!adminPassword) return toast.error("Digite a senha do Super Administrador.");
    setSecureLoading(true);
    setActionId(secureTarget.id);
    try {
      const response = await fetch("/api/admin/commercial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: secureAction, userId: secureTarget.id, password: adminPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível concluir a operação.");
      toast.success(result.message || "Operação concluída.");
      setSecureTarget(null);
      setSecureAction(null);
      setAdminPassword("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir a operação.");
    } finally {
      setSecureLoading(false);
      setActionId(null);
    }
  };

  if (authLoading || !user || !(user.role === "super_admin" || user.adminCanSubscriptions)) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="h-4 w-4" />Administração de Assinaturas</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Assinaturas</h1>
            <p className="mt-2 text-muted-foreground">Visão comercial completa: plano, cobrança, pagamento, teste, validade, Asaas e acesso do cliente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadAccountsExcel(data?.accounts ?? [])} disabled={!data?.accounts?.length}>
              <Download className="mr-2 h-4 w-4" />Baixar relatório detalhado
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <strong>Relatório comercial:</strong> o Excel inclui contato, WhatsApp, e-mail, plano, pagamento, teste, cancelamento, inatividade, validade, dados do Asaas, acessos e bancos vinculados.
        </div>

        {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Clientes</p><p className="mt-1 text-2xl font-black">{data?.summary.total ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Em teste</p><p className="mt-1 text-2xl font-black text-blue-600">{data?.summary.trial ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Ativos</p><p className="mt-1 text-2xl font-black text-emerald-600">{data?.summary.active ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Em atraso</p><p className="mt-1 text-2xl font-black text-rose-600">{data?.summary.overdue ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Cancelados</p><p className="mt-1 text-2xl font-black">{data?.summary.canceled ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Cartão / mês</p><p className="mt-1 text-xl font-black">{money.format(Number(data?.summary.monthlyActiveCents || 0) / 100)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Pix anual ativo</p><p className="mt-1 text-xl font-black">{money.format(Number(data?.summary.annualPixActiveCents || 0) / 100)}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Clientes e assinaturas</CardTitle></CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando...</div>
            ) : (
              <div className="space-y-4">
                {(data?.accounts ?? []).map(account => {
                  const canDelete = account.status === "past_due" || account.status === "pending_payment";
                  const active = account.status === "active" || account.status === "paid";
                  return (
                    <div key={account.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">{account.name || account.username}</h3>
                            {paymentBadge(account)}
                            <Badge variant={account.plan === "plus" ? "default" : "secondary"}>{account.plan === "plus" ? "Plus" : "Basic"}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">@{account.username} · <span className="font-mono font-semibold text-primary">ID {account.supportId || "—"}</span> · {lifecycleLabel(account)}</p>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{account.email || "—"}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{account.whatsapp || "—"}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          {account.status === "pending_payment" && <Button size="sm" onClick={() => runAction(account, "approve")} disabled={actionId === account.id}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar</Button>}
                          {account.status === "past_due" && <Button size="sm" onClick={() => runAction(account, "mark_paid")} disabled={actionId === account.id}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar pagamento</Button>}
                          {active && <Button size="sm" variant="outline" onClick={() => runAction(account, "mark_unpaid")} disabled={actionId === account.id}><AlertTriangle className="mr-2 h-4 w-4" />Marcar atraso</Button>}
                          {active && account.billingMethod === "pix_annual" && <Button size="sm" variant="outline" disabled title="Fluxo de estorno será habilitado em uma próxima etapa"><RotateCcw className="mr-2 h-4 w-4" />Estornar Pix</Button>}
                          {account.status !== "canceled" && <Button size="sm" variant="outline" onClick={() => openSecureAction(account, "cancel_subscription")} disabled={actionId === account.id}><XCircle className="mr-2 h-4 w-4" />Cancelar</Button>}
                          {canDelete && <Button size="sm" variant="destructive" onClick={() => openSecureAction(account, "delete_unpaid")} disabled={actionId === account.id}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Cobrança</p><p className="mt-1 font-semibold">{billingLabel(account)}</p><p className="text-xs text-muted-foreground">{money.format(Number(account.priceCents || 0) / 100)}</p></div>
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Provedor</p><p className="mt-1 font-semibold capitalize">{account.provider || "—"}</p><p className="truncate text-xs text-muted-foreground">{account.providerStatus || account.lastPaymentStatus || "Sem retorno"}</p></div>
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Última cobrança</p><p className="mt-1 font-semibold">{account.lastPaymentStatus || "—"}</p><p className="truncate text-xs text-muted-foreground">{account.lastPaymentId || "Sem ID"}</p></div>
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Teste grátis</p><p className="mt-1 font-semibold">{safeDate(account.trialEndsAt)}</p><p className="text-xs text-muted-foreground">7 dias para novos clientes</p></div>
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Validade</p><p className="mt-1 font-semibold">{account.billingMethod === "pix_annual" ? safeDate(account.paidUntil) : "Renovação mensal"}</p><p className="text-xs text-muted-foreground">{account.billingMethod === "pix_annual" ? "Plano anual" : "Cartão recorrente"}</p></div>
                        <div className="rounded-xl bg-muted/40 p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">Último webhook</p><p className="mt-1 font-semibold">{safeDate(account.lastWebhookAt, true)}</p><p className="text-xs text-muted-foreground">Atualização do Asaas</p></div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4" /><span><strong>{account.databaseCount}/{account.databaseLimit}</strong> bancos — {account.databaseNames || "nenhum criado"}</span></div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="h-4 w-4" /><span>Uso: <strong>{formatUsage(account.usageMinutes)}</strong></span></div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" /><span>Último acesso: <strong>{safeDate(account.lastAccessAt, true)}</strong></span></div>
                      </div>
                    </div>
                  );
                })}
                {!data?.accounts?.length && <div className="py-12 text-center text-muted-foreground">Nenhuma assinatura comercial encontrada.</div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {secureTarget && secureAction ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 font-black"><LockKeyhole className="h-5 w-5 text-rose-600" />Confirmação do Super Admin</div>
                <p className="mt-2 text-sm text-muted-foreground">{secureAction === "delete_unpaid" ? `Excluir definitivamente a conta de ${secureTarget.name || secureTarget.username}?` : `Cancelar a assinatura de ${secureTarget.name || secureTarget.username}?`}</p>
              </div>
              <button onClick={() => !secureLoading && setSecureTarget(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{secureAction === "delete_unpaid" ? "A cobrança/assinatura pendente no Asaas será removida antes dos dados locais sempre que houver um recurso vinculado." : "O sistema tentará encerrar a recorrência no Asaas e bloqueará o acesso do cliente."}</div>
            <label className="mt-5 block text-sm font-semibold">Senha do Super Administrador</label>
            <Input className="mt-2" type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} autoFocus disabled={secureLoading} />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSecureTarget(null)} disabled={secureLoading}>Voltar</Button>
              <Button variant="destructive" onClick={confirmSecureAction} disabled={secureLoading}>{secureLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{secureAction === "delete_unpaid" ? "Excluir conta" : "Cancelar assinatura"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
