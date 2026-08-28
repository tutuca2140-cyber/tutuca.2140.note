import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCommercialContext } from "@/hooks/useCommercialContext";
import { trpc } from "@/lib/trpc";
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type MovementType = "ENTRADA" | "SAIDA";
type FormState = {
  type: MovementType;
  category: string;
  description: string;
  amount: string;
  movementDate: string;
  responsible: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  type: "ENTRADA",
  category: "OUTROS",
  description: "",
  amount: "",
  movementDate: new Date().toISOString().slice(0, 16),
  responsible: "",
  notes: "",
});

const money = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const originLabel = (item: {
  paymentId: number | null;
  loanId: number | null;
  vehicleSaleId: number | null;
  vehicleId: number | null;
  category: string;
  description: string;
}) => {
  if (item.paymentId) return `Origem: pagamento #${item.paymentId}`;
  if (item.loanId) return `Origem: empréstimo #${item.loanId}`;
  if (item.vehicleSaleId) return `Origem: venda #${item.vehicleSaleId}`;
  if (item.vehicleId) return `Origem: veículo #${item.vehicleId}`;
  const loanMatch = item.description.match(/empréstimo #(\d+)/i);
  if (loanMatch || item.category.includes("EMPRESTIMO")) {
    return loanMatch
      ? `Origem: empréstimo #${loanMatch[1]} (legado)`
      : "Origem: pagamento de empréstimo (legado)";
  }
  if (item.category.includes("VEICULO")) return "Origem: operação de veículo";
  return "Origem: lançamento manual";
};

export default function Caixa() {
  const { user } = useAuth();
  const { data: commercialContext } = useCommercialContext();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deletingMovement, setDeletingMovement] = useState<{
    id: number;
    description: string;
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const { data: movements, isLoading } = trpc.cashFlow.list.useQuery();
  const create = trpc.cashFlow.create.useMutation();
  const utils = trpc.useUtils();
  const entries = movements ?? [];
  const totalIn = entries
    .filter(item => item.type === "ENTRADA")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalOut = entries
    .filter(item => item.type === "SAIDA")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const canDeleteCash = Boolean(
    user?.role === "super_admin" ||
      (commercialContext?.commercial &&
        commercialContext.permissions.canDeleteCashFlow)
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const refreshFinance = async () => {
    await Promise.all([
      utils.cashFlow.list.invalidate(),
      utils.dashboard.stats.invalidate(),
    ]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({
        ...form,
        movementDate: new Date(form.movementDate).toISOString(),
        amount: form.amount,
      });
      await refreshFinance();
      toast.success(
        form.type === "ENTRADA"
          ? "Entrada registrada no caixa."
          : "Saída registrada no caixa."
      );
      setOpen(false);
      setForm(emptyForm());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a movimentação."
      );
    }
  };

  const handleDelete = async () => {
    if (!deletingMovement) return;
    const reason = deleteReason.trim();
    if (reason.length < 3) {
      toast.error("Informe uma observação com pelo menos 3 caracteres.");
      return;
    }

    setDeletePending(true);
    try {
      const response = await fetch(
        "/api/commercial-account?scope=cash-delete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: deletingMovement.id, reason }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível excluir o lançamento.");
      }
      await refreshFinance();
      toast.success(result.message || "Lançamento removido do caixa.");
      setDeletingMovement(null);
      setDeleteReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o lançamento."
      );
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Financeiro
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Caixa</h1>
            <p className="mt-2 text-muted-foreground">
              Acompanhe movimentações reais e registre entradas ou saídas manuais.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Movimentar caixa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova movimentação</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={form.type === "ENTRADA" ? "default" : "outline"}
                    onClick={() => setField("type", "ENTRADA")}
                  >
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Entrada
                  </Button>
                  <Button
                    type="button"
                    variant={form.type === "SAIDA" ? "default" : "outline"}
                    onClick={() => setField("type", "SAIDA")}
                  >
                    <ArrowDownCircle className="mr-2 h-4 w-4" />
                    Saída
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <Label htmlFor="cash-category">Categoria *</Label>
                    <Input
                      id="cash-category"
                      required
                      value={form.category}
                      onChange={event => setField("category", event.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cash-amount">Valor *</Label>
                    <Input
                      id="cash-amount"
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.amount}
                      onChange={event => setField("amount", event.target.value)}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <Label htmlFor="cash-description">Descrição *</Label>
                    <Input
                      id="cash-description"
                      required
                      value={form.description}
                      onChange={event =>
                        setField("description", event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cash-date">Data *</Label>
                    <Input
                      id="cash-date"
                      required
                      type="datetime-local"
                      value={form.movementDate}
                      onChange={event =>
                        setField("movementDate", event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <Label htmlFor="cash-responsible">Responsável</Label>
                    <Input
                      id="cash-responsible"
                      value={form.responsible}
                      onChange={event =>
                        setField("responsible", event.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <Label htmlFor="cash-notes">Observação</Label>
                    <Textarea
                      id="cash-notes"
                      value={form.notes}
                      onChange={event => setField("notes", event.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending ? "Salvando..." : "Confirmar movimentação"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Entradas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{money(totalIn)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Saídas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{money(totalOut)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Saldo atual</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">
                {money(totalIn - totalOut)}
              </p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground">
            Carregando movimentações...
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Movimentações recentes
              </CardTitle>
              {canDeleteCash && (
                <p className="text-sm text-muted-foreground">
                  Sua conta possui permissão para apagar lançamentos do caixa mediante observação obrigatória.
                </p>
              )}
            </CardHeader>
            <CardContent>
              {entries.length ? (
                <div className="space-y-2">
                  {entries.slice(0, 50).map(item => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{item.description}</p>
                        <p className="break-words text-xs text-muted-foreground">
                          {item.category} ·{" "}
                          {new Date(item.movementDate).toLocaleString("pt-BR")}
                          {item.responsible ? ` · ${item.responsible}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-medium text-primary">
                          {originLabel(item)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <p
                          className={`font-semibold ${
                            item.type === "ENTRADA"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {item.type === "ENTRADA" ? "+" : "-"} {money(item.amount)}
                        </p>
                        {canDeleteCash && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Excluir ${item.description}`}
                            title="Excluir lançamento do caixa"
                            disabled={deletePending}
                            onClick={() => {
                              setDeletingMovement({
                                id: item.id,
                                description: item.description,
                              });
                              setDeleteReason("");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhuma movimentação no banco ativo.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog
          open={deletingMovement !== null}
          onOpenChange={value => {
            if (!value) {
              setDeletingMovement(null);
              setDeleteReason("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir lançamento do caixa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                “{deletingMovement?.description}” será removido do caixa e dos totais do dashboard. A operação de origem não será apagada.
              </p>
              <div>
                <Label htmlFor="cash-delete-reason">Observação obrigatória</Label>
                <Textarea
                  id="cash-delete-reason"
                  value={deleteReason}
                  onChange={event => setDeleteReason(event.target.value)}
                  maxLength={500}
                  placeholder="Informe o motivo da exclusão"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletingMovement(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deletePending || deleteReason.trim().length < 3}
                >
                  {deletePending ? "Excluindo..." : "Confirmar exclusão"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
