import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Car, Plus, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PaymentMethod = "DINHEIRO" | "PIX" | "TRANSFERENCIA" | "CARTAO" | "FINANCIAMENTO" | "OUTRO";
type SaleForm = { vehicleId: string; clientId: string; saleAmount: string; receivedAmount: string; paymentMethod: PaymentMethod; saleDate: string; notes: string };
const initialForm: SaleForm = { vehicleId: "", clientId: "", saleAmount: "", receivedAmount: "", paymentMethod: "PIX", saleDate: new Date().toISOString().slice(0, 16), notes: "" };
const money = (value: number | string) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function VendasVeiculos() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SaleForm>(initialForm);
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const { data: sales, isLoading } = trpc.vehicleSales.list.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const createSale = trpc.vehicleSales.create.useMutation();
  const receiveSale = trpc.vehicleSales.receive.useMutation();
  const utils = trpc.useUtils();
  const availableVehicles = (vehicles ?? []).filter((vehicle) => vehicle.status === "disponivel");
  const vehicleMap = new Map((vehicles ?? []).map((vehicle) => [vehicle.id, `${vehicle.brand ?? ""} ${vehicle.model}`.trim()]));
  const clientMap = new Map((clients ?? []).map((client) => [client.id, client.name]));

  const setField = <K extends keyof SaleForm>(key: K, value: SaleForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createSale.mutateAsync({ vehicleId: Number(form.vehicleId), clientId: form.clientId ? Number(form.clientId) : undefined, saleAmount: form.saleAmount, receivedAmount: form.receivedAmount || "0", paymentMethod: form.paymentMethod, saleDate: new Date(form.saleDate).toISOString(), notes: form.notes || undefined });
      await Promise.all([utils.vehicleSales.list.invalidate(), utils.vehicles.list.invalidate(), utils.cashFlow.list.invalidate()]);
      toast.success("Venda registrada e veículo atualizado no estoque.");
      setOpen(false);
      setForm({ ...initialForm, saleDate: new Date().toISOString().slice(0, 16) });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a venda."); }
  };
  const receive = async () => {
    if (!receivingId || !receiveAmount) return;
    try {
      await receiveSale.mutateAsync({ saleId: receivingId, amount: receiveAmount, movementDate: new Date().toISOString() });
      await Promise.all([utils.vehicleSales.list.invalidate(), utils.cashFlow.list.invalidate()]);
      toast.success("Recebimento lançado no fluxo de caixa.");
      setReceivingId(null);
      setReceiveAmount("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar o recebimento."); }
  };

  return <DashboardLayout><div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Comercial</p><h1 className="text-3xl font-bold tracking-tight">Vendas de veículos</h1><p className="mt-2 text-muted-foreground">Selecione um veículo disponível do estoque; a venda não duplica o cadastro.</p></div><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nova venda</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Registrar venda de veículo</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="sale-vehicle">Veículo do estoque *</Label><select id="sale-vehicle" required value={form.vehicleId} onChange={(event) => { setField("vehicleId", event.target.value); const selected = availableVehicles.find((item) => item.id === Number(event.target.value)); if (selected?.salePrice || selected?.price) setField("saleAmount", String(selected.salePrice || selected.price)); }} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Selecione um veículo disponível</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.brand ?? ""} {vehicle.model}{vehicle.year ? ` · ${vehicle.year}` : ""}</option>)}</select></div><div><Label htmlFor="sale-client">Cliente (opcional)</Label><select id="sale-client" value={form.clientId} onChange={(event) => setField("clientId", event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Venda sem cliente vinculado</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><div><Label htmlFor="sale-amount">Valor da venda *</Label><Input id="sale-amount" type="number" min="0.01" step="0.01" required value={form.saleAmount} onChange={(event) => setField("saleAmount", event.target.value)} /></div><div><Label htmlFor="sale-received">Valor recebido agora</Label><Input id="sale-received" type="number" min="0" step="0.01" value={form.receivedAmount} onChange={(event) => setField("receivedAmount", event.target.value)} /></div><div><Label htmlFor="sale-method">Forma de pagamento</Label><select id="sale-method" value={form.paymentMethod} onChange={(event) => setField("paymentMethod", event.target.value as PaymentMethod)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="TRANSFERENCIA">Transferência</option><option value="CARTAO">Cartão</option><option value="FINANCIAMENTO">Financiamento</option><option value="OUTRO">Outro</option></select></div><div><Label htmlFor="sale-date">Data da venda</Label><Input id="sale-date" type="datetime-local" value={form.saleDate} onChange={(event) => setField("saleDate", event.target.value)} /></div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={createSale.isPending}>{createSale.isPending ? "Salvando..." : "Confirmar venda"}</Button></div></form></DialogContent></Dialog></div>{isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando vendas...</div> : sales?.length ? <div className="grid gap-4 md:grid-cols-2">{sales.map((sale) => <Card key={sale.id}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><Car className="h-5 w-5" /></div><div><CardTitle className="text-lg">{vehicleMap.get(sale.vehicleId) ?? `Veículo #${sale.vehicleId}`}</CardTitle><p className="text-sm text-muted-foreground">Venda #{sale.id} · {new Date(sale.saleDate).toLocaleDateString("pt-BR")}</p></div></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{Number(sale.receivableBalance) > 0 ? "A receber" : "Quitada"}</span></div></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-muted-foreground">Valor da venda</span><p className="font-semibold">{money(sale.saleAmount)}</p></div><div><span className="text-muted-foreground">Recebido</span><p className="font-semibold text-emerald-600">{money(sale.receivedAmount)}</p></div><div><span className="text-muted-foreground">Saldo a receber</span><p className="font-semibold text-primary">{money(sale.receivableBalance)}</p></div><div><span className="text-muted-foreground">Cliente</span><p className="font-semibold">{sale.clientId ? clientMap.get(sale.clientId) ?? "Não encontrado" : "Não vinculado"}</p></div></div>{Number(sale.receivableBalance) > 0 && <Button variant="outline" className="w-full" onClick={() => { setReceivingId(sale.id); setReceiveAmount(""); }}><Wallet className="mr-2 h-4 w-4" />Receber parcela</Button>}{receivingId === sale.id && <div className="flex gap-2"><Input type="number" min="0.01" step="0.01" placeholder="Valor recebido" value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} /><Button onClick={receive} disabled={receiveSale.isPending}>Confirmar</Button></div>}</CardContent></Card>)}</div> : <Card><CardContent className="flex flex-col items-center justify-center py-14 text-center"><Receipt className="mb-4 h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground">Nenhuma venda de veículo registrada.</p><Button className="mt-4" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Registrar primeira venda</Button></CardContent></Card>}</div></DashboardLayout>;
}
