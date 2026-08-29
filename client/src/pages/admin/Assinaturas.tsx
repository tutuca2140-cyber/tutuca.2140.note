import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  Download,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Timer,
  Users,
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

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateOnly = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

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

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelCell(value: unknown, type: "String" | "Number" = "String", style?: string) {
  return `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function downloadAccountsExcel(accounts: CommercialAccount[]) {
  if (!accounts.length) {
    toast.error("Não há clientes comerciais para exportar.");
    return;
  }

  const headers = [
    "Nome e sobrenome",
    "Nome de usuário",
    "E-mail",
    "WhatsApp",
    "Plano",
    "Mensalidade (R$)",
    "Pagamento",
    "Status da assinatura",
    "Data de cadastro",
    "Último acesso",
    "Tempo de uso",
    "Tempo de uso (horas)",
    "Bancos criados",
    "Limite de bancos",
    "Bancos",
  ];

  const rows = accounts.map(account => [
    account.name || "",
    account.username,
    account.email || "",
    account.whatsapp || "",
    account.plan === "plus" ? "Plus" : "Basic",
    Number(account.priceCents || 0) / 100,
    paymentLabel(account),
    account.status,
    account.createdAt ? dateTime.format(new Date(account.createdAt)) : "",
    account.lastAccessAt ? dateTime.format(new Date(account.lastAccessAt)) : "Nunca acessou",
    formatUsage(account.usageMinutes),
    Number((Number(account.usageMinutes || 0) / 60).toFixed(2)),
    Number(account.databaseCount || 0),
    Number(account.databaseLimit || 0),
    account.databaseNames || "",
  ]);

  const numericColumns = new Set([5, 11, 12, 13]);
  const tableXml = [
    `<Row>${headers.map(header => excelCell(header, "String", "Header")).join("")}</Row>`,
    ...rows.map(row =>
      `<Row>${row
        .map((value, index) => excelCell(value, numericColumns.has(index) ? "Number" : "String"))
        .join("")}</Row>`
    ),
  ].join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Assinaturas">
  <Table>${tableXml}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
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

  useEffect(() => {
    if (!authLoading && user && user.role !== "super_admin") {
      navigate("/dashboard", { replace: true });
    }
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
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível carregar as assinaturas.");
      }
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
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível atualizar a assinatura.");
      }
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
    const names =
      account.plan === "plus"
        ? `Principal - ${account.username}, Principal - ${account.username} #2 e Principal - ${account.username} #3`
        : `Principal - ${account.username}`;

    if (!window.confirm(
      `Aprovar a conta de ${account.username} no plano ${planName}?\n\nO usuário será ativado agora. Os bancos ${names} serão criados automaticamente quando o contratante fizer o primeiro login.`
    )) return;
    await runAction(account, "approve");
  };

  const markUnpaid = async (account: CommercialAccount) => {
    if (!window.confirm(
      `Marcar a assinatura de ${account.username} como aguardando pagamento?\n\nO usuário continuará conseguindo entrar, mas poderá visualizar somente o Dashboard até o pagamento ser confirmado.`
    )) return;
    await runAction(account, "mark_unpaid");
  };

  const markPaid = async (account: CommercialAccount) => {
    if (!window.confirm(
      `Confirmar que o pagamento de ${account.username} foi regularizado?\n\nAs funções do plano serão liberadas novamente.`
    )) return;
    await runAction(account, "mark_paid");
  };

  if (authLoading || !user || user.role !== "super_admin") return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              Exclusivo do Super Administrador
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Assinaturas e Aprovações</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Todos os novos clientes do site aparecem aqui com contato, plano, pagamento, data de cadastro, acessos e tempo de uso do Note Note.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadAccountsExcel(data?.accounts ?? [])} disabled={!data?.accounts?.length}>
              <Download className="mr-2 h-4 w-4" />
              Baixar Excel
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>Regra de acesso:</strong> assinatura ativa libera as funções do plano. Quando marcada como aguardando pagamento, o cliente mantém o login e a visualização do Dashboard, mas qualquer outra área exibe “Sistema aguardando pagamento”.
        </div>

        <div className="rounded-xl border border-slate-200 bg-card p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Medição de uso:</strong> o Note Note registra atividade em blocos de 5 minutos enquanto a página estiver visível. Mudanças de tela dentro do mesmo intervalo não duplicam o tempo. Para o Plus, o total inclui a atividade do contratante e dos usuários adicionais da conta.
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

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
                      const provisioned = Boolean(account.provisionedAt);
                      const pending = account.status === "pending_payment";
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
                            <p className="mt-2 font-semibold">{money.format(Number(account.priceCents || 0) / 100)}/mês</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {active ? <Badge className="bg-emerald-600">Pago</Badge> : overdue ? <Badge variant="destructive">Não pago</Badge> : <Badge variant="outline">Aguardando aprovação</Badge>}
                            <p className="mt-2 text-xs text-muted-foreground">{active ? "Acesso do plano liberado" : overdue ? "Somente Dashboard" : "Conta ainda não aprovada"}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold">{account.createdAt ? dateOnly.format(new Date(account.createdAt)) : "—"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Registro da conta</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold">{formatUsage(account.usageMinutes)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Tempo total da conta</p>
                            <p className="mt-2 text-xs text-muted-foreground">Último acesso: {account.lastAccessAt ? dateTime.format(new Date(account.lastAccessAt)) : "ainda não acessou"}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="font-semibold">{Number(account.databaseCount || 0)}/{account.databaseLimit}</p>
                            <p className="max-w-[320px] truncate text-xs text-muted-foreground">{account.databaseNames || (pending ? "Serão criados após aprovação, no primeiro login" : "Serão criados no primeiro login")}</p>
                            {!pending && (provisioned ? <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Provisionado</span> : <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock3 className="h-3.5 w-3.5" />Aguardando primeiro login</span>)}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex justify-end gap-2">
                              {pending ? (
                                <Button size="sm" onClick={() => approve(account)} disabled={actionId === account.id}>{actionId === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aprovar conta</Button>
                              ) : overdue ? (
                                <Button size="sm" onClick={() => markPaid(account)} disabled={actionId === account.id}>{actionId === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Confirmar pagamento</Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => markUnpaid(account)} disabled={actionId === account.id}>{actionId === account.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}Marcar sem pagamento</Button>
                              )}
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
    </DashboardLayout>
  );
}
