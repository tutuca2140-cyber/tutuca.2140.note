import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ClipboardList, DollarSign, Edit, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Status = "ativo" | "pago" | "atrasado" | "cancelado";
const emptyForm = () => ({
  clientId: "",
  vehicleId: "",
  vehiclePrice: "",
  downPayment: "0",
  interestRate: "",
  installments: "",
  status: "ativo" as Status,
  startDate: "",
  notes: "",
});
const money = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function Financiamentos() {
  const { user } = useAuth();
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const { data: financings = [], isLoading } =
    trpc.vehicleFinancings.list.useQuery();
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const { data: vehicles = [] } = trpc.vehicles.list.useQuery();
  const createFinancing = trpc.vehicleFinancings.create.useMutation();
  const updateFinancing = trpc.vehicleFinancings.update.useMutation();
  const utils = trpc.useUtils();
  const clientMap = useMemo(
    () => new Map(clients.map(item => [item.id, item.name])),
    [clients]
  );
  const vehicleMap = useMemo(
    () =>
      new Map(
        vehicles.map(item => [
          item.id,
          `${item.brand ?? ""} ${item.model}`.trim(),
        ])
      ),
    [vehicles]
  );
  const calculation = useMemo(() => {
    const price = Number(form.vehiclePrice),
      entry = Number(form.downPayment),
      rate = Number(form.interestRate),
      installments = Number(form.installments);
    const principal =
      Number.isFinite(price - entry) && price > entry ? price - entry : 0;
    const interest =
      principal > 0 && rate >= 0 && installments > 0
        ? ((principal * rate) / 100) * installments
        : 0;
    const total = principal + interest;
    return {
      principal,
      interest,
      total,
      installment: installments > 0 ? total / installments : 0,
    };
  }, [
    form.vehiclePrice,
    form.downPayment,
    form.interestRate,
    form.installments,
  ]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const clientId = Number(form.clientId),
      vehicleId = Number(form.vehicleId),
      vehiclePrice = Number(form.vehiclePrice);
    const downPayment = Number(form.downPayment),
      interestRate = Number(form.interestRate),
      installments = Number(form.installments);
    if (!Number.isInteger(clientId) || clientId <= 0)
      return toast.error("Selecione um cliente.");
    if (!Number.isInteger(vehicleId) || vehicleId <= 0)
      return toast.error("Selecione um veículo.");
    if (!Number.isFinite(vehiclePrice) || vehiclePrice <= 0)
      return toast.error("Informe o preço do veículo.");
    if (
      !Number.isFinite(downPayment) ||
      downPayment < 0 ||
      downPayment >= vehiclePrice
    )
      return toast.error("A entrada deve ser menor que o preço do veículo.");
    if (!Number.isFinite(interestRate) || interestRate < 0)
      return toast.error("Informe uma taxa mensal válida.");
    if (!Number.isInteger(installments) || installments <= 0)
      return toast.error("Informe um número válido de parcelas.");
    if (!form.startDate) return toast.error("Informe a data inicial.");
    try {
      await createFinancing.mutateAsync({
        clientId,
        vehicleId,
        vehiclePrice: vehiclePrice.toFixed(2),
        downPayment: downPayment.toFixed(2),
        interestRate: interestRate.toFixed(2),
        installments,
        startDate: new Date(`${form.startDate}T12:00:00`).toISOString(),
        notes: form.notes.trim() || undefined,
      });
      await Promise.all([
        utils.vehicleFinancings.list.invalidate(),
        utils.vehicles.list.invalidate(),
      ]);
      toast.success(
        "Financiamento salvo com os juros calculados automaticamente."
      );
      setOpenCreate(false);
      setForm(emptyForm());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o financiamento."
      );
    }
  };

  const update = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      await updateFinancing.mutateAsync({
        id: selected.id,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      await utils.vehicleFinancings.list.invalidate();
      toast.success("Financiamento atualizado.");
      setOpenEdit(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o financiamento."
      );
    }
  };
  const edit = (financing: any) => {
    setSelected(financing);
    setForm({
      ...emptyForm(),
      status: financing.status,
      notes: financing.notes ?? "",
    });
    setOpenEdit(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Financiamentos de veículos
            </h1>
            <p className="mt-2 text-muted-foreground">
              O valor financiado, os juros e as parcelas são calculados
              automaticamente.
            </p>
          </div>
          {user?.canInsert && (
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo financiamento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Novo financiamento</DialogTitle>
                </DialogHeader>
                <form onSubmit={create} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Cliente *</Label>
                      <Select
                        value={form.clientId}
                        onValueChange={value =>
                          setForm(current => ({ ...current, clientId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(client => (
                            <SelectItem
                              key={client.id}
                              value={String(client.id)}
                            >
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Veículo *</Label>
                      <Select
                        value={form.vehicleId}
                        onValueChange={value =>
                          setForm(current => ({ ...current, vehicleId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar veículo" />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicles
                            .filter(vehicle => vehicle.status !== "vendido")
                            .map(vehicle => (
                              <SelectItem
                                key={vehicle.id}
                                value={String(vehicle.id)}
                              >
                                {vehicleMap.get(vehicle.id)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="vehiclePrice">Preço do veículo *</Label>
                      <Input
                        id="vehiclePrice"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.vehiclePrice}
                        onChange={e =>
                          setForm(c => ({ ...c, vehiclePrice: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="downPayment">Entrada *</Label>
                      <Input
                        id="downPayment"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.downPayment}
                        onChange={e =>
                          setForm(c => ({ ...c, downPayment: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="interestRate">Juros ao mês (%) *</Label>
                      <Input
                        id="interestRate"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.interestRate}
                        onChange={e =>
                          setForm(c => ({ ...c, interestRate: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="installments">Número de parcelas *</Label>
                      <Input
                        id="installments"
                        type="number"
                        min="1"
                        step="1"
                        value={form.installments}
                        onChange={e =>
                          setForm(c => ({ ...c, installments: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="startDate">Data inicial *</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={form.startDate}
                        onChange={e =>
                          setForm(c => ({ ...c, startDate: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="notes">Observações</Label>
                      <Textarea
                        id="notes"
                        value={form.notes}
                        onChange={e =>
                          setForm(c => ({ ...c, notes: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Valor financiado
                      </p>
                      <p className="font-semibold">
                        {money(calculation.principal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Juros totais
                      </p>
                      <p className="font-semibold">
                        {money(calculation.interest)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total devido
                      </p>
                      <p className="font-semibold">
                        {money(calculation.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parcela</p>
                      <p className="font-semibold">
                        {money(calculation.installment)}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpenCreate(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createFinancing.isPending}>
                      {createFinancing.isPending
                        ? "Salvando..."
                        : "Salvar financiamento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            Carregando financiamentos...
          </div>
        ) : financings.length ? (
          <div className="space-y-4">
            {financings.map(financing => (
              <Card key={financing.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">
                          Financiamento #{financing.id}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {clientMap.get(financing.clientId) ??
                            `Cliente #${financing.clientId}`}{" "}
                          ·{" "}
                          {vehicleMap.get(financing.vehicleId) ??
                            `Veículo #${financing.vehicleId}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs capitalize text-primary">
                        {financing.status}
                      </span>
                      {user?.canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar financiamento"
                          onClick={() => edit(financing)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[
                      ["Preço", financing.vehiclePrice],
                      ["Entrada", financing.downPayment],
                      ["Financiado", financing.financedAmount],
                      ["Total com juros", financing.totalAmount],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-semibold">{money(value)}</p>
                      </div>
                    ))}
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Taxa mensal
                      </p>
                      <p className="font-semibold">{financing.interestRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parcelas</p>
                      <p className="font-semibold">
                        {financing.installments}x{" "}
                        {money(financing.installmentAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Início</p>
                      <p className="font-semibold">
                        {new Date(financing.startDate).toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Término</p>
                      <p className="font-semibold">
                        {new Date(financing.endDate).toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                Nenhum financiamento cadastrado.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar financiamento #{selected?.id}</DialogTitle>
          </DialogHeader>
          <form onSubmit={update} className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value: Status) =>
                  setForm(c => ({ ...c, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea
                id="edit-notes"
                value={form.notes}
                onChange={e => setForm(c => ({ ...c, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenEdit(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateFinancing.isPending}>
                Salvar alteração
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
