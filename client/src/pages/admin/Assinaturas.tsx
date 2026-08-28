import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  CreditCard,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
  isActive: boolean;
  createdAt: string;
  plan: "basic" | "plus";
  priceCents: number | string;
  status: string;
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
    active: number;
    monthlyActiveCents: number;
  };
  message?: string;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function AdminAssinaturas() {
  const { user, loading: authLoading } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });
  const [, navigate] = useLocation();
  const [data, setData] = useState<CommercialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
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

  const approve = async (account: CommercialAccount) => {
    const planName = account.plan === "plus" ? "Plus" : "Basic";
    const names =
      account.plan === "plus"
        ? `Principal - ${account.username}, Principal - ${account.username} #2 e Principal - ${account.username} #3`
        : `Principal - ${account.username}`;

    if (
      !window.confirm(
        `Aprovar a conta de ${account.username} no plano ${planName}?\n\nO usuário será ativado e o sistema garantirá automaticamente os bancos: ${names}.`
      )
    ) {
      return;
    }

    setApprovingId(account.id);
    try {
      const response = await fetch("/api/admin/commercial-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "approve", userId: account.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível aprovar a conta.");
      }
      toast.success(result.message || "Conta aprovada com sucesso.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aprovar a conta.");
    } finally {
      setApprovingId(null);
    }
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
              Aprove contas comerciais após confirmar o pagamento. A aprovação ativa o cliente e cria automaticamente os bancos previstos no plano.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>Provisionamento automático:</strong> Basic recebe 1 banco chamado <strong>Principal - nome do usuário</strong>. Plus recebe 3 bancos: o Principal, <strong>#2</strong> e <strong>#3</strong>. Depois da aprovação, o cliente pode renomear os próprios bancos na área Meu Banco.
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Contas comerciais</p>
                <p className="mt-1 text-2xl font-black">{data?.summary.total ?? 0}</p>
              </div>
              <Users className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Aguardando aprovação</p>
                <p className="mt-1 text-2xl font-black">{data?.summary.pending ?? 0}</p>
              </div>
              <CreditCard className="h-6 w-6 text-amber-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Assinaturas ativas</p>
                <p className="mt-1 text-2xl font-black">{data?.summary.active ?? 0}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Mensalidade ativa</p>
                <p className="mt-1 text-2xl font-black">
                  {money.format(Number(data?.summary.monthlyActiveCents || 0) / 100)}
                </p>
              </div>
              <Database className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Clientes comerciais</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando contas...
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Mensalidade</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Bancos</th>
                      <th className="px-4 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.accounts ?? []).map(account => {
                      const approved = account.status === "active" || account.status === "paid";
                      return (
                        <tr key={account.id} className="hover:bg-muted/20">
                          <td className="px-4 py-4">
                            <p className="font-semibold">{account.name || account.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {account.username} · {account.email || "sem e-mail"}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={account.plan === "plus" ? "default" : "secondary"}>
                              {account.plan === "plus" ? "Plus" : "Basic"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 font-semibold">
                            {money.format(Number(account.priceCents || 0) / 100)}
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={approved ? "default" : "outline"}>
                              {approved ? "Ativa" : "Aguardando aprovação"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold">
                              {Number(account.databaseCount || 0)}/{account.databaseLimit}
                            </p>
                            <p className="max-w-[320px] truncate text-xs text-muted-foreground">
                              {account.databaseNames || "Bancos serão criados na aprovação"}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {approved && Number(account.databaseCount) === account.databaseLimit ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" />
                                Provisionado
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => approve(account)}
                                disabled={approvingId === account.id}
                              >
                                {approvingId === account.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                )}
                                Aprovar e criar bancos
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!data?.accounts?.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          Nenhum cadastro comercial encontrado.
                        </td>
                      </tr>
                    )}
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
