import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BellRing, CalendarDays } from "lucide-react";
import { toast } from "sonner";

const money = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function ContasAReceber() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const upcoming = stats?.collections?.upcoming ?? [];
  const total = upcoming.reduce((sum, item) => sum + Number(item.amount), 0);

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Este navegador não oferece notificações.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      toast.success("Alertas de recebimentos ativados neste dispositivo.");
    } else {
      toast.error("A permissão de notificações não foi concedida.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Contas a receber
            </h1>
            <p className="mt-2 text-muted-foreground">
              Vencimentos de hoje até os próximos dois dias.
            </p>
          </div>
          <Button variant="outline" onClick={enableNotifications}>
            <BellRing className="mr-2 h-4 w-4" />
            Ativar alertas
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recebimentos previstos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{upcoming.length}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valor previsto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{money(total)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> Próximos
              vencimentos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="py-8 text-center text-muted-foreground">
                Carregando vencimentos...
              </p>
            ) : null}
            {!isLoading &&
              upcoming.map(item => (
                <div
                  key={`${item.contractType}-${item.clientId}-${item.installmentNumber}`}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-[120px_1fr_1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-xs text-muted-foreground">Vencimento</p>
                    <p className="font-semibold">
                      {new Date(item.dueDate).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-semibold">{item.clientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Referente a</p>
                    <p className="font-semibold">{item.product}</p>
                    <p className="text-xs text-muted-foreground">
                      Parcela {item.installmentNumber}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-primary">
                    {money(item.amount)}
                  </p>
                </div>
              ))}
            {!isLoading && !upcoming.length ? (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum recebimento neste período.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
