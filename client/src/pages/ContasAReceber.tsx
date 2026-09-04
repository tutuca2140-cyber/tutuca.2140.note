import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  BellRing,
  CalendarDays,
  CreditCard,
  MessageCircle,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const money = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function ContasAReceber() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const upcoming = stats?.collections?.upcoming ?? [];
  const overdue = stats?.collections?.overdue ?? [];
  const dueToday = stats?.collections?.dueToday ?? [];
  const [view, setView] = useState<"upcoming" | "overdue">("upcoming");
  const [search, setSearch] = useState("");
  const rows = view === "overdue" ? overdue : upcoming;
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      item =>
        item.clientName.toLowerCase().includes(query) ||
        item.product.toLowerCase().includes(query) ||
        String(item.contractId).includes(query)
    );
  }, [rows, search]);
  const upcomingTotal = upcoming.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const overdueTotal = overdue.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const enableNotifications = async () => {
    if (!("Notification" in window))
      return toast.error("Este navegador não oferece notificações.");
    const permission = await Notification.requestPermission();
    permission === "granted"
      ? toast.success("Alertas de recebimentos ativados neste dispositivo.")
      : toast.error("A permissão de notificações não foi concedida.");
  };

  const openWhatsapp = (item: (typeof rows)[number]) => {
    const client = clients.find(record => record.id === item.clientId);
    const digits = String(client?.whatsapp || client?.phone || "").replace(
      /\D/g,
      ""
    );
    if (!digits)
      return toast.error("Este cliente não possui WhatsApp cadastrado.");
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const due = new Date(item.dueDate).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const message =
      view === "overdue"
        ? `Olá, ${item.clientName}! Identificamos que a parcela ${item.installmentNumber}, no valor de ${money(item.amount)}, com vencimento em ${due}, está pendente. Podemos ajudar com a regularização?`
        : `Olá, ${item.clientName}! Passando para lembrar que a parcela ${item.installmentNumber}, no valor de ${money(item.amount)}, vence em ${due}.`;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Central de cobranças
            </h1>
            <p className="mt-2 text-muted-foreground">
              Acompanhe vencimentos, cobre pelo WhatsApp e registre pagamentos.
            </p>
          </div>
          <Button variant="outline" onClick={enableNotifications}>
            <BellRing className="mr-2 h-4 w-4" />
            Ativar alertas
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Vencem hoje</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{dueToday.length}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Próximos dois dias</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {money(upcomingTotal)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valores vencidos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-700 dark:text-red-300">
                {money(overdueTotal)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {overdue.length} parcela(s)
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Cobranças
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button
                  variant={view === "upcoming" ? "default" : "outline"}
                  onClick={() => setView("upcoming")}
                >
                  Próximos
                </Button>
                <Button
                  variant={view === "overdue" ? "destructive" : "outline"}
                  onClick={() => setView("overdue")}
                >
                  Atrasados ({overdue.length})
                </Button>
              </div>
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar cliente, contrato ou produto"
                  className="pl-9"
                />
              </div>
            </div>
            {isLoading ? (
              <p className="py-8 text-center text-muted-foreground">
                Carregando cobranças...
              </p>
            ) : null}
            {!isLoading &&
              visibleRows.map(item => (
                <div
                  key={`${item.contractType}-${item.contractId}-${item.installmentNumber}`}
                  className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[120px_1fr_1fr_auto] md:items-center ${view === "overdue" ? "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20" : ""}`}
                >
                  <div>
                    <p className="text-sm text-muted-foreground">Vencimento</p>
                    <p className="font-semibold">
                      {new Date(item.dueDate).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-semibold">{item.clientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Referente a</p>
                    <p className="font-semibold">{item.product}</p>
                    <p className="text-sm text-muted-foreground">
                      Parcela {item.installmentNumber}
                    </p>
                  </div>
                  <div className="space-y-2 md:text-right">
                    <p
                      className={`text-lg font-bold ${view === "overdue" ? "text-red-700 dark:text-red-300" : "text-primary"}`}
                    >
                      {money(item.amount)}
                    </p>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openWhatsapp(item)}
                      >
                        <MessageCircle className="mr-2 h-4 w-4" />
                        WhatsApp
                      </Button>
                      {user?.canInsert ? (
                        <Link
                          href={`/pagamentos?novo=1&tipo=${item.contractType}&contrato=${item.contractId}&parcela=${item.installmentNumber}`}
                        >
                          <a>
                            <Button size="sm">
                              <CreditCard className="mr-2 h-4 w-4" />
                              Lançar pagamento
                            </Button>
                          </a>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            {!isLoading && !visibleRows.length ? (
              <p className="py-8 text-center text-muted-foreground">
                Nenhuma cobrança encontrada neste período.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
