import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Car, Plus, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const currency = (value: number | string) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type VehicleForm = { clientId: string; brand: string; model: string; year: string; color: string; plate: string; chassi: string; price: string; description: string };
const initialForm: VehicleForm = { clientId: "", brand: "", model: "", year: String(new Date().getFullYear()), color: "", plate: "", chassi: "", price: "", description: "" };

export default function Veiculos() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<VehicleForm>(initialForm);
  const { data: vehicles, isLoading } = trpc.vehicles.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const createVehicle = trpc.vehicles.create.useMutation();
  const utils = trpc.useUtils();
  const clientMap = useMemo(() => new Map((clients ?? []).map((client) => [client.id, client.name])), [clients]);
  const filtered = (vehicles ?? []).filter((vehicle) => `${vehicle.brand} ${vehicle.model} ${vehicle.plate ?? ""} ${clientMap.get(vehicle.clientId ?? 0) ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const update = (key: keyof VehicleForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createVehicle.mutateAsync({ clientId: Number(form.clientId), brand: form.brand.trim(), model: form.model.trim(), year: Number(form.year), color: form.color || undefined, plate: form.plate || undefined, chassi: form.chassi || undefined, price: Number(form.price).toFixed(2), description: form.description || undefined });
      await utils.vehicles.list.invalidate();
      toast.success("Veículo vinculado ao cliente com sucesso.");
      setOpen(false);
      setForm(initialForm);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o veículo.");
    }
  };

  return <DashboardLayout><div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Patrimônio</p><h1 className="text-3xl font-bold tracking-tight">Veículos</h1><p className="mt-2 text-muted-foreground">Relacione cada veículo a um cliente e acompanhe seu status.</p></div><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo veículo</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Novo veículo</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="vehicle-client">Cliente existente *</Label><select id="vehicle-client" value={form.clientId} onChange={(event) => update("clientId", event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" required><option value="">Selecione um cliente</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}{client.cpf ? ` — ${client.cpf}` : ""}</option>)}</select></div><div><Label htmlFor="vehicle-brand">Marca *</Label><Input id="vehicle-brand" value={form.brand} onChange={(event) => update("brand", event.target.value)} required /></div><div><Label htmlFor="vehicle-model">Modelo *</Label><Input id="vehicle-model" value={form.model} onChange={(event) => update("model", event.target.value)} required /></div><div><Label htmlFor="vehicle-year">Ano *</Label><Input id="vehicle-year" type="number" min="1900" max="2200" value={form.year} onChange={(event) => update("year", event.target.value)} required /></div><div><Label htmlFor="vehicle-price">Preço (R$) *</Label><Input id="vehicle-price" type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => update("price", event.target.value)} required /></div><div><Label htmlFor="vehicle-color">Cor</Label><Input id="vehicle-color" value={form.color} onChange={(event) => update("color", event.target.value)} /></div><div><Label htmlFor="vehicle-plate">Placa</Label><Input id="vehicle-plate" value={form.plate} onChange={(event) => update("plate", event.target.value.toUpperCase())} /></div><div className="sm:col-span-2"><Label htmlFor="vehicle-chassi">Chassi</Label><Input id="vehicle-chassi" value={form.chassi} onChange={(event) => update("chassi", event.target.value.toUpperCase())} /></div><div className="sm:col-span-2"><Label htmlFor="vehicle-description">Observações</Label><Textarea id="vehicle-description" value={form.description} onChange={(event) => update("description", event.target.value)} /></div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={createVehicle.isPending}>{createVehicle.isPending ? "Salvando..." : "Salvar veículo"}</Button></div></form></DialogContent></Dialog></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" placeholder="Buscar por cliente, marca, modelo ou placa..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>{isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando veículos...</div> : filtered.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.map((vehicle) => <Card key={vehicle.id}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Car className="h-5 w-5" /></div><div><CardTitle className="text-lg">{vehicle.brand} {vehicle.model}</CardTitle><p className="text-sm text-muted-foreground">{vehicle.year}{vehicle.plate ? ` · ${vehicle.plate}` : ""}</p></div></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs capitalize text-primary">{vehicle.status}</span></div></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-primary" /><span>{vehicle.clientId ? clientMap.get(vehicle.clientId) ?? "Cliente não encontrado" : "Sem cliente vinculado"}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">Preço</span><p className="font-semibold">{currency(vehicle.price)}</p></div><div><span className="text-muted-foreground">Cor</span><p className="font-semibold">{vehicle.color || "—"}</p></div></div>{vehicle.description && <p className="text-sm text-muted-foreground">{vehicle.description}</p>}</CardContent></Card>)}</div> : <Card><CardContent className="flex flex-col items-center justify-center py-14 text-center"><Car className="mb-4 h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground">{search ? "Nenhum veículo encontrado." : "Nenhum veículo cadastrado."}</p>{!search && <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar primeiro veículo</Button>}</CardContent></Card>}</div></DashboardLayout>;
}
