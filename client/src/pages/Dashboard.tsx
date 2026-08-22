import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CreditCard, DollarSign, Percent, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";

const formatCurrency = (value: number | string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

function periodRange(period: string, customStart: string, customEnd: string) {
  if (period === "custom") return { startDate: customStart || undefined, endDate: customEnd || undefined };
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === "today") start.setHours(0, 0, 0, 0);
  if (period === "last_7") start.setDate(now.getDate() - 6);
  if (period === "last_30") start.setDate(now.getDate() - 29);
  if (period === "previous_month") {
    start.setMonth(now.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
  }
  if (period === "current_year") start.setMonth(0, 1);
  if (period === "current_month") start.setDate(1);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export default function Dashboard() {
  const [period, setPeriod] = useState("current_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: activeDb } = trpc.databases.getActive.useQuery();
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const { data: performance, isLoading: performanceLoading } = trpc.dashboard.agentPerformance.useQuery(range);

  if (isLoading) {
    return <DashboardLayout><div className="space-y-6"><h1 className="text-3xl font-bold">Dashboard</h1><p className="text-muted-foreground">Carregando estatísticas...</p><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Card key={item} className="h-32 animate-pulse bg-muted/30" />)}</div></div></DashboardLayout>;
  }

  const ranking = performance?.ranking ?? [];
  const maxVolume = Math.max(...ranking.map((item) => Number(item.paymentVolume)), 1);
  const maxEvolution = Math.max(...(performance?.evolution ?? []).map((item) => Number(item.paymentVolume)), 1);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Visão geral financeira e performance dos agentes comissionados.</p>
          {activeDb && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />Banco: {activeDb.name}</div>}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Empréstimos Ativos</CardTitle><CreditCard className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.activeLoans.count || 0}</div><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(stats?.activeLoans.total || 0)}</p></CardContent></Card>
          <Card><CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Empréstimos Pagos</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.paidLoans.count || 0}</div><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(stats?.paidLoans.total || 0)}</p></CardContent></Card>
          <Card><CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pagamentos Pendentes</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.pendingPayments.count || 0}</div><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(stats?.pendingPayments.total || 0)}</p></CardContent></Card>
          <Card><CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total de Clientes</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalClients || 0}</div><p className="mt-1 text-xs text-muted-foreground">Clientes cadastrados</p></CardContent></Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Entradas no caixa</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{formatCurrency(stats?.totalEntradas || 0)}</div><p className="mt-1 text-xs text-muted-foreground">Pagamentos e recebimentos registrados</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Saídas no caixa</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{formatCurrency(stats?.totalSaidas || 0)}</div><p className="mt-1 text-xs text-muted-foreground">Despesas lançadas no banco ativo</p></CardContent></Card>
          <Card className="border-primary/20"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Saldo de caixa</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(stats?.saldoCaixa || 0)}</div><p className="mt-1 text-xs text-muted-foreground">Entradas menos saídas</p></CardContent></Card>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><CardTitle>Performance dos Agentes</CardTitle><p className="mt-1 text-sm text-muted-foreground">KPIs, ranking e evolução dos pagamentos comissionados.</p></div><div className="flex flex-wrap items-center gap-2"><select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Período da performance"><option value="today">Hoje</option><option value="last_7">Últimos 7 dias</option><option value="last_30">Últimos 30 dias</option><option value="current_month">Mês atual</option><option value="previous_month">Mês anterior</option><option value="current_year">Ano atual</option><option value="custom">Período personalizado</option></select>{period === "custom" && <><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Data inicial" /><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Data final" /></>}</div></CardHeader>
          <CardContent className="space-y-6">
            {performanceLoading ? <p className="py-8 text-center text-muted-foreground">Atualizando performance...</p> : <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl bg-primary/10 p-4"><p className="text-xs text-muted-foreground">Agentes ativos</p><p className="mt-1 text-2xl font-bold text-primary">{performance?.kpis.activeAgents ?? 0}</p><p className="text-xs text-muted-foreground">de {performance?.kpis.totalAgents ?? 0} cadastrados</p></div>
                <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Pagamentos</p><p className="mt-1 text-2xl font-bold">{performance?.kpis.totalPayments ?? 0}</p></div>
                <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Volume pago</p><p className="mt-1 text-2xl font-bold">{formatCurrency(performance?.kpis.totalPaymentVolume ?? 0)}</p></div>
                <div className="rounded-xl bg-primary/10 p-4"><p className="text-xs text-muted-foreground">Total de comissões</p><p className="mt-1 text-2xl font-bold text-primary">{formatCurrency(performance?.kpis.totalCommissions ?? 0)}</p></div>
                <div className="rounded-xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Melhor agente</p><p className="mt-1 truncate text-lg font-bold">{performance?.kpis.bestAgent?.agentName ?? "—"}</p></div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div><div className="mb-3 flex items-center gap-2"><Percent className="h-4 w-4 text-primary" /><h3 className="font-semibold">Ranking por volume</h3></div>{ranking.length ? <div className="space-y-3">{ranking.slice(0, 8).map((item, index) => <div key={item.agentId}><div className="mb-1 flex items-center justify-between text-sm"><span><strong className="mr-2 text-primary">#{index + 1}</strong>{item.agentName}</span><span className="font-medium">{formatCurrency(item.paymentVolume)}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, (Number(item.paymentVolume) / maxVolume) * 100)}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{item.paymentCount} pagamento(s) · {formatCurrency(item.commissionAmount)} em comissão</p></div>)}</div> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum pagamento comissionado no período.</p>}</div>
                <div><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Evolução diária</h3><span className="text-xs text-muted-foreground">Volume de pagamentos</span></div>{performance?.evolution.length ? <div className="flex h-52 items-end gap-2 overflow-x-auto rounded-lg bg-muted/30 p-4">{performance.evolution.slice(-14).map((item) => <div key={item.period} className="flex min-w-[30px] flex-1 flex-col items-center justify-end gap-2"><div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(8, (Number(item.paymentVolume) / maxEvolution) * 140)}px` }} title={`${item.period}: ${formatCurrency(item.paymentVolume)}`} /><span className="text-[10px] text-muted-foreground">{item.period.slice(8)}</span></div>)}</div> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">A evolução aparecerá após o primeiro pagamento comissionado.</p>}</div>
              </div>
            </>}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Bem-vindo ao DEATH NOTE</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Sistema completo de gestão financeira com empréstimos, pagamentos, financiamentos e comissões por agente.</p></CardContent></Card><Card><CardHeader><CardTitle>Ações Rápidas</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2"><a href="/clientes" className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/20">Novo Cliente</a><a href="/emprestimos" className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/20">Novo Empréstimo</a><a href="/pagamentos" className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/20">Registrar Pagamento</a><a href="/agentes" className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/20">Gerenciar Agentes</a></CardContent></Card></div>
      </div>
    </DashboardLayout>
  );
}
