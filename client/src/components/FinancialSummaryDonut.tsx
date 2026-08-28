import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

export default function FinancialSummaryDonut() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();

  if (isLoading) {
    return <Card className="mb-6 h-72 animate-pulse bg-muted/30" />;
  }

  const received = Math.max(Number(stats?.loanMetrics?.totalReceived || 0), 0);
  const overdue = Math.max(Number(stats?.loanMetrics?.totalOverdue || 0), 0);
  const totalOpen = Math.max(Number(stats?.loanMetrics?.totalOpen || 0), 0);
  const openOnTime = Math.max(totalOpen - overdue, 0);
  const cashBalance = Number(stats?.saldoCaixa || 0);
  const portfolioTotal = received + openOnTime + overdue;

  const receivedPct = portfolioTotal ? (received / portfolioTotal) * 100 : 0;
  const openPct = portfolioTotal ? (openOnTime / portfolioTotal) * 100 : 0;
  const overduePct = portfolioTotal ? (overdue / portfolioTotal) * 100 : 0;
  const stopReceived = receivedPct;
  const stopOpen = receivedPct + openPct;

  const donutBackground = portfolioTotal
    ? `conic-gradient(#16a34a 0% ${stopReceived}%, #2563eb ${stopReceived}% ${stopOpen}%, #e11d48 ${stopOpen}% 100%)`
    : "conic-gradient(#e5e7eb 0% 100%)";

  return (
    <Card className="mb-6 overflow-hidden border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle>Resumo financeiro</CardTitle>
        <p className="text-sm text-muted-foreground">
          Visão da carteira do banco ativo: recebido, valores a receber e vencidos.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid items-center gap-8 lg:grid-cols-[280px_1fr]">
          <div className="flex justify-center">
            <div
              className="relative grid h-56 w-56 place-items-center rounded-full shadow-inner"
              style={{ background: donutBackground }}
              role="img"
              aria-label={`Gráfico financeiro: ${receivedPct.toFixed(1)}% recebido, ${openPct.toFixed(1)}% a receber em dia e ${overduePct.toFixed(1)}% vencido`}
            >
              <div className="grid h-36 w-36 place-items-center rounded-full bg-background text-center shadow-sm">
                <div className="px-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Carteira
                  </p>
                  <p className="mt-1 text-lg font-bold leading-tight">
                    {formatCurrency(portfolioTotal)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-emerald-50/60 p-4 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-600" />
                <p className="text-sm font-medium">Recebido</p>
              </div>
              <p className="mt-2 text-xl font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(received)}
              </p>
              <p className="text-xs text-muted-foreground">
                {receivedPct.toFixed(1)}% da carteira
              </p>
            </div>

            <div className="rounded-xl border bg-blue-50/60 p-4 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-600" />
                <p className="text-sm font-medium">A receber</p>
              </div>
              <p className="mt-2 text-xl font-bold text-blue-700 dark:text-blue-400">
                {formatCurrency(openOnTime)}
              </p>
              <p className="text-xs text-muted-foreground">
                {openPct.toFixed(1)}% da carteira em dia
              </p>
            </div>

            <div className="rounded-xl border bg-rose-50/60 p-4 dark:bg-rose-950/20">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-600" />
                <p className="text-sm font-medium">Vencido</p>
              </div>
              <p className="mt-2 text-xl font-bold text-rose-700 dark:text-rose-400">
                {formatCurrency(overdue)}
              </p>
              <p className="text-xs text-muted-foreground">
                {overduePct.toFixed(1)}% da carteira
              </p>
            </div>

            <div className="rounded-xl border bg-primary/5 p-4">
              <p className="text-sm font-medium">Saldo de caixa</p>
              <p
                className={`mt-2 text-xl font-bold ${
                  cashBalance < 0 ? "text-rose-600" : "text-primary"
                }`}
              >
                {formatCurrency(cashBalance)}
              </p>
              <p className="text-xs text-muted-foreground">
                Entradas menos saídas registradas
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
