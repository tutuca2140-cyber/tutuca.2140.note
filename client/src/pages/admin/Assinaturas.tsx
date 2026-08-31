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
  CreditCard,
  Database,
  Download,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type CommercialAccount = {
  id: number;
  username: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  isActive: boolean;
  createdAt: string;
  lastSignedIn?: string | null;
  lastAccessAt?: string | null;
  usageMinutes: number;
  usageHours: number;
  paymentState: "paid" | "unpaid" | "pending";
  plan: "basic" | "plus";
  priceCents: number | string;
  status: string;
  provisionedAt?: string | null;
  databaseCount: number;
  databaseLimit: number;
  databaseNames?: string;
};

type CommercialResponse = {
  success: boolean;
  accounts: CommercialAccount[];
  summary: {
    total: number;
    pending: number;
    overdue: number;
    active: number;
    monthlyActiveCents: number;
    totalUsageMinutes: number;
  };
  message?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatUsage(minutesValue: number | string | null | undefined) {
  const minutes = Math.max(0, Number(minutesValue || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

function paymentLabel(account: CommercialAccount) {
  if (account.paymentState === "paid") return "Pago";
  if (account.paymentState === "unpaid") return "Não pago";
  return "Aguardando aprovação";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadAccountsExcel(accounts: CommercialAccount[]) {
  if (!accounts.length) {
    toast.error("Não há clientes comerciais para exportar.");
    return;
  }
  const headers = [
    "Nome e sobrenome", "Nome de usuário", "E-mail", "WhatsApp", "Plano",
    "Valor", "Pagamento", "Status", "Cadastro", "Último acesso", "Tempo de uso",
    "Bancos criados", "Limite de bancos", "Bancos"
  ];
  const rows = accounts.map(account => [
    account.name || "", account.username, account.email || "", account.whatsapp || "",
    account.plan === "plus" ? "Plus" : "Basic", money.format(Number(account.priceCents || 0) / 100),
    paymentLabel(account), account.status,
    account.createdAt ? dateTime.format(new Date(account.createdAt)) : "",
    account.lastAccessAt ? dateTime.format(new Date(account.lastAccessAt)) : "Nunca acessou",
    formatUsage(account.usageMinutes), Number(account.databaseCount || 0), Number(account.databaseLimit || 0),
    account.databaseNames || ""
  ]);
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `assinaturas-notenote-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success("Planilha de assinaturas gerada.");
}

export default function AdminAssinaturas() {
  const { user, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });
  const [, navigate] = useLocation();
  const [data, setData] = useState<CommercialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CommercialAccount | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "super_admin") navigate("/dashboard", { replace: true });
  }, [authLoading, navigate, user]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/commercial-accounts", {
        credentials: "include",
        cache: "no-store",
      });
      const result = (await response.json().catch(() => ({}))) as CommercialResponse;
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível carregar as assinaturas.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as assinaturas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "super_admin") void load();
  }, [user?.role]);

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

  const approve = async (account: CommercialAccount) => {
    const planName = account.plan === "plus" ? "Plus" : "Basic";
    if (!window.confirm(`Aprovar a conta de ${account.username} no plano ${planName}?`)) return;
    await runAction(account, "approve");
  };

  const markUnpaid = async (account: CommercialAccount) => {
    if (!window.confirm(`Marcar a assinatura de ${account.username} como aguardando pagamento?\n\nO usuário ficará restrito ao Dashboard até o pagamento ser confirmado.`)) return;
    await runAction(account, "mark_unpaid");
  };

  const markPaid = async (account: CommercialAccount) => {
    if (!window.confirm(`Confirmar que o pagamento de ${account.username} foi regularizado?`)) return;
    await runAction(account, "mark_paid");
  };

  const openDelete = (account: CommercialAccount) => {
    setAdminPassword("");
    setDeleteTarget(account);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
    setAdminPassword("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (!adminPassword) {
      toast.error("Digite a senha do Super Administrador.");
      return;
    }
    setDeleting(true);
    setActionId(deleteTarget.id);
    try {
      const response = await fetch("/api/admin/commercial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete_unpaid", userId: deleteTarget.id, password: adminPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível excluir a conta.");
      toast.success(result.message || "Conta excluída.");
      setDeleteTarget(null);
      setAdminPassword("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a conta.");
    } finally {
      setDeleting(false);
      setActionId(null);
    }
  };

  if (authLoading || !user || user.role !== "super_admin") return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" /> Exclusivo do Super Administrador
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Assinaturas e Aprovações</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Gerencie clientes, pagamentos, acessos e contas comerciais do Note Note.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadAccountsExcel(data?.accounts ?? [])} disabled={!data?.accounts?.length}>
              <Download className="mr-2 h-4 w-4" /> Baixar Excel
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Atualizar
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>Segurança:</strong> contas sem pagamento podem ser excluídas somente pelo Super Administrador. A exclusão exige a senha atual do Super Admin e a cobrança vinculada no Mercado Pago é cancelada antes da remoção.
        </div>

        {error ? <Card className="border-destructive/40"><CardContent className="p-5 text-sm text-destructive">{error}</CardContent></Card> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Contas comerciais</p><p className="mt-1 text-2xl font-black">{data?.summary.total ?? 0}</p></div><Users className="h-6 w-6 text-primary" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Aguardando aprovação</p><p className="mt-1 text-2xl font-black">{data?.summary.pending ?? 0}</p></div><CreditCard className="h-6 w-6 text-amber-600" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Não pagos</p><p className="mt-1 text-2xl font-black">{data?.summary.overdue ?? 0}</p></div><AlertTriangle className="h-6 w-6 text-rose-600" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Pagos / ativos</p><p className="mt-1 text-2xl font-black">{data?.summary.active ?? 0}</p></div><CheckCircle2 className="h-6 w-6 text-emerald-600" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Mensalidade ativa</p><p className="mt-1 text-2xl font-black">{money.format(Number(data?.summary.monthlyActiveCents || 0) / 100)}</p></div><Database className="h-6 w-6 text-primary" /></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Uso acumulado</p><p className="mt-1 text-2xl font-black">{formatUsage(data?.summary.totalUsageMinutes ?? 0)}</p></div><Timer className="h-6 w-6 text-primary" /></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Clientes comerciais</CardTitle></CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando contas...</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[1680px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Cliente e contato</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Pagamento</th>
                      <th className="px-4 py-3">Cadastro</th>
                      <th className="px-4 py-3">Uso do sistema</th>
                      <th className="px-4 py-3">Bancos</th>
                      <th className="px-4 py-3 text-right">Administração</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.accounts ?? []).map(account => {
                      const active = account.status === "active" || account.status === "paid";
                      const overdue = account.status === "past_due";
                      const pending = account.status === "pending_payment";
                      const provisioned = Boolean(account.provisionedAt);
                      const canDelete = overdue || pending;
                      return (
                        <tr key={account.id} className="hover:bg-muted/20">
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold">{account.name || account.username}</p>
                            <p className="text-xs text-muted-foreground">@{account.username}</p>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{account.email || "Sem e-mail"}</p>
                              <p className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" />{account.whatsapp || "Sem WhatsApp"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <Badge variant={account.plan === "plus" ? "default" : "secondary"}>{account.plan === "plus" ? "Plus" : "Basic"}</Badge>
                            <p className="mt-2 font-semibold">{money.format(Number(account.priceCents || 0) / 100)}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {active ? <Badge className="bg-emerald-600">Pago</Badge> : overdue ? <Badge variant="destructive">Não pago</Badge> : <Badge variant="outline">Aguardando aprovação</Badge>}
                            <p className="mt-2 text-xs text-muted-foreground">{active ? "Acesso do plano liberado" : overdue ? "Somente Dashboard" : "Conta ainda sem pagamento confirmado"}</p>
                          </td>
                          <td className="px-4 py-4 align-top"><p className="font-semibold">{account.createdAt ? dateOnly.format(new Date(account.createdAt)) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Registro da conta</p></td>
                          <td className="px-4 py-4 align-top"><p className="font-semibold">{formatUsage(account.usageMinutes)}</p><p className="mt-1 text-xs text-muted-foreground">Tempo total da conta</p><p className="mt-2 text-xs text-muted-foreground">Último acesso: {account.lastAccessAt ? dateTime.format(new Date(account.lastAccessAt)) : "ainda não acessou"}</p></td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold">{Number(account.databaseCount || 0)}/{account.databaseLimit}</p>
                            <p className="max-w-[320px] truncate text-xs text-muted-foreground">{account.databaseNames || (pending ? "Serão criados após aprovação" : "Serão criados no primeiro login")}</p>
                            {!pending && (provisioned ? <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Provisionado</span> : <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock3 className="h-3.5 w-3.5" />Aguardando primeiro login</span>)}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap justify-end gap-2">
                              {pending ? (
                                <Button size="sm" onClick={() => approve(account)} disabled={actionId === account.id}>{actionId === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar conta</Button>
                              ) : overdue ? (
                                <Button size="sm" onClick={() => markPaid(account)} disabled={actionId === account.id}>{actionId === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirmar pagamento</Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => markUnpaid(account)} disabled={actionId === account.id}><AlertTriangle className="mr-2 h-4 w-4" />Marcar sem pagamento</Button>
                              )}
                              {canDelete ? (
                                <Button size="sm" variant="destructive" onClick={() => openDelete(account)} disabled={actionId === account.id}>
                                  <Trash2 className="mr-2 h-4 w-4" />Excluir usuário
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!data?.accounts?.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nenhum cadastro comercial encontrado.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></div>
              <button type="button" onClick={closeDelete} disabled={deleting} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <h2 className="mt-4 text-xl font-black">Excluir usuário sem pagamento?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Você está prestes a excluir <strong className="text-foreground">{deleteTarget.name || deleteTarget.username}</strong>. Esta ação remove o login e os usuários adicionais vinculados e não pode ser desfeita.
            </p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <strong>Confirmação obrigatória:</strong> digite a senha atual do Super Administrador. A senha é validada no servidor e não é salva.
            </div>
            <label className="mt-5 block text-sm font-semibold" htmlFor="super-admin-delete-password">Senha do Super Admin</label>
            <div className="relative mt-2">
              <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="super-admin-delete-password"
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={event => setAdminPassword(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter" && !deleting) void confirmDelete(); }}
                placeholder="Digite sua senha"
                className="pl-10"
                disabled={deleting}
                autoFocus
              />
            </div>
            <div className="mt-6 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={closeDelete} disabled={deleting}>Cancelar</Button>
              <Button type="button" variant="destructive" className="flex-1" onClick={() => void confirmDelete()} disabled={deleting || !adminPassword}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Excluir definitivamente
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
