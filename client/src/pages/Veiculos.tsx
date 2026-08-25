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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Car, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const currency = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
type VehicleType = "CARRO" | "MOTO" | "OUTRO";
type VehicleForm = {
  vehicleType: VehicleType;
  brand: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  renavam: string;
  chassi: string;
  mileage: string;
  purchasePrice: string;
  expenses: string;
  salePrice: string;
  clientId: string;
  description: string;
};
const initialForm: VehicleForm = {
  vehicleType: "CARRO",
  brand: "",
  model: "",
  year: "",
  color: "",
  plate: "",
  renavam: "",
  chassi: "",
  mileage: "",
  purchasePrice: "",
  expenses: "",
  salePrice: "",
  clientId: "",
  description: "",
};

export default function Veiculos() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [form, setForm] = useState<VehicleForm>(initialForm);
  const { data: vehicles, isLoading } = trpc.vehicles.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const createVehicle = trpc.vehicles.create.useMutation();
  const deleteVehicle = trpc.vehicles.delete.useMutation();
  const utils = trpc.useUtils();
  const clientMap = useMemo(
    () => new Map((clients ?? []).map(client => [client.id, client.name])),
    [clients]
  );
  const filtered = (vehicles ?? []).filter(vehicle => {
    const matchesText =
      `${vehicle.brand ?? ""} ${vehicle.model} ${vehicle.plate ?? ""} ${vehicle.renavam ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "todos" || vehicle.status === statusFilter;
    const matchesType =
      typeFilter === "todos" || vehicle.vehicleType === typeFilter;
    return matchesText && matchesStatus && matchesType;
  });
  const update = <K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createVehicle.mutateAsync({
        vehicleType: form.vehicleType,
        model: form.model.trim(),
        brand: form.brand.trim() || undefined,
        year: form.year ? Number(form.year) : undefined,
        color: form.color || undefined,
        plate: form.plate || undefined,
        renavam: form.renavam || undefined,
        chassi: form.chassi || undefined,
        mileage: form.mileage ? Number(form.mileage) : undefined,
        purchasePrice: form.purchasePrice || "0",
        expenses: form.expenses || "0",
        salePrice: form.salePrice || undefined,
        clientId: form.clientId ? Number(form.clientId) : undefined,
        price: form.salePrice || "0",
        description: form.description || undefined,
      });
      await Promise.all([
        utils.vehicles.list.invalidate(),
        utils.cashFlow.list.invalidate(),
      ]);
      toast.success("Veículo adicionado ao estoque.");
      setOpen(false);
      setForm(initialForm);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o veículo."
      );
    }
  };
  const remove = async (id: number, name: string) => {
    if (
      !window.confirm(
        `Excluir definitivamente o veículo "${name}" e todos os vínculos financeiros? Esta ação não pode ser desfeita.`
      )
    )
      return;
    try {
      await deleteVehicle.mutateAsync({ id });
      await Promise.all([
        utils.vehicles.list.invalidate(),
        utils.vehicleFinancings.list.invalidate(),
        utils.cashFlow.list.invalidate(),
        utils.payments.list.invalidate(),
      ]);
      toast.success(
        "Veículo e informações vinculadas excluídos definitivamente."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o veículo."
      );
    }
  };
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Patrimônio
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Estoque de veículos
            </h1>
            <p className="mt-2 text-muted-foreground">
              Cadastre o modelo e mantenha os demais dados opcionais. Vendas
              usam este mesmo registro.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo veículo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar veículo no estoque</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="vehicle-type">Tipo</Label>
                    <select
                      id="vehicle-type"
                      value={form.vehicleType}
                      onChange={event =>
                        update("vehicleType", event.target.value as VehicleType)
                      }
                      className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="CARRO">Carro</option>
                      <option value="MOTO">Moto</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="vehicle-model">Modelo *</Label>
                    <Input
                      id="vehicle-model"
                      value={form.model}
                      onChange={event => update("model", event.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-brand">Marca</Label>
                    <Input
                      id="vehicle-brand"
                      value={form.brand}
                      onChange={event => update("brand", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-year">Ano</Label>
                    <Input
                      id="vehicle-year"
                      type="number"
                      min="1900"
                      max="2200"
                      value={form.year}
                      onChange={event => update("year", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-purchase">Valor de compra</Label>
                    <Input
                      id="vehicle-purchase"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.purchasePrice}
                      onChange={event =>
                        update("purchasePrice", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-sale">Valor de venda</Label>
                    <Input
                      id="vehicle-sale"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.salePrice}
                      onChange={event =>
                        update("salePrice", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-expenses">
                      Despesas acumuladas
                    </Label>
                    <Input
                      id="vehicle-expenses"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.expenses}
                      onChange={event => update("expenses", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-color">Cor</Label>
                    <Input
                      id="vehicle-color"
                      value={form.color}
                      onChange={event => update("color", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-mileage">Quilometragem</Label>
                    <Input
                      id="vehicle-mileage"
                      type="number"
                      min="0"
                      value={form.mileage}
                      onChange={event => update("mileage", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-plate">Placa</Label>
                    <Input
                      id="vehicle-plate"
                      value={form.plate}
                      onChange={event =>
                        update("plate", event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-renavam">Renavam</Label>
                    <Input
                      id="vehicle-renavam"
                      value={form.renavam}
                      onChange={event => update("renavam", event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-chassi">Chassi</Label>
                    <Input
                      id="vehicle-chassi"
                      value={form.chassi}
                      onChange={event =>
                        update("chassi", event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="vehicle-client">
                      Cliente vinculado (opcional)
                    </Label>
                    <select
                      id="vehicle-client"
                      value={form.clientId}
                      onChange={event => update("clientId", event.target.value)}
                      className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">Nenhum cliente</option>
                      {(clients ?? []).map(client => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="vehicle-description">Observações</Label>
                    <Textarea
                      id="vehicle-description"
                      value={form.description}
                      onChange={event =>
                        update("description", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createVehicle.isPending}>
                    {createVehicle.isPending ? "Salvando..." : "Salvar veículo"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Buscar por marca, modelo, placa ou Renavam..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <select
            value={typeFilter}
            onChange={event => setTypeFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Todos os tipos</option>
            <option value="CARRO">Carros</option>
            <option value="MOTO">Motos</option>
            <option value="OUTRO">Outros</option>
          </select>
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Todos os status</option>
            <option value="disponivel">Disponíveis</option>
            <option value="reservado">Reservados</option>
            <option value="vendido">Vendidos</option>
            <option value="indisponivel">Indisponíveis</option>
          </select>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            Carregando estoque...
          </div>
        ) : filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(vehicle => (
              <Card key={vehicle.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-3 text-primary">
                        <Car className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {vehicle.brand ? `${vehicle.brand} ` : ""}
                          {vehicle.model}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {vehicle.vehicleType}
                          {vehicle.year ? ` · ${vehicle.year}` : ""}
                          {vehicle.plate ? ` · ${vehicle.plate}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs capitalize text-primary">
                      {vehicle.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        Valor compra
                      </span>
                      <p className="font-semibold">
                        {currency(vehicle.purchasePrice)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valor venda</span>
                      <p className="font-semibold">
                        {currency(vehicle.salePrice ?? vehicle.price)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Despesas</span>
                      <p className="font-semibold text-rose-600">
                        {currency(vehicle.expenses)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cliente</span>
                      <p className="font-semibold">
                        {vehicle.clientId
                          ? (clientMap.get(vehicle.clientId) ??
                            "Não encontrado")
                          : "Não vinculado"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Quilometragem
                      </span>
                      <p className="font-semibold">{vehicle.mileage ?? "—"}</p>
                    </div>
                  </div>
                  {vehicle.description && (
                    <p className="text-sm text-muted-foreground">
                      {vehicle.description}
                    </p>
                  )}
                </CardContent>
                {user?.role === "super_admin" && (
                  <div className="px-6 pb-6">
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={deleteVehicle.isPending}
                      onClick={() =>
                        remove(
                          vehicle.id,
                          `${vehicle.brand ?? ""} ${vehicle.model}`.trim()
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir definitivamente
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Car className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">
                {search || statusFilter !== "todos" || typeFilter !== "todos"
                  ? "Nenhum veículo encontrado."
                  : "Nenhum veículo cadastrado."}
              </p>
              {!search &&
                statusFilter === "todos" &&
                typeFilter === "todos" && (
                  <Button className="mt-4" onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar primeiro veículo
                  </Button>
                )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
