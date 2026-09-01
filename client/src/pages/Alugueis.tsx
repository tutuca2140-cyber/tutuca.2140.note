import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { CalendarDays, CheckCircle2, Home, KeyRound, Plus, UserRound, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const API = "/api/site-access?scope=properties";
const money = (value: any) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = new Date();
const monthNow = today.toISOString().slice(0, 7);
const empty = () => ({ propertyId: "", clientId: "", monthlyRent: "", dueDay: "5", startDate: today.toISOString().slice(0, 10), agentId: "", commissionPercentage: "", notes: "" });

export default function Alugueis() {
  const { user } = useAuth();
  const [data, setData] = useState<any>({ properties: [], rentals: [], clients: [], payments: [], agents: [], currentMonth: monthNow });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [paying, setPaying] = useState<any>(null);
  const [payMonth, setPayMonth] = useState(monthNow);
  const [payAmount, setPayAmount] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(API, { credentials: "include" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setData(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar aluguéis.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const post = async (body: any) => {
    const response = await fetch(API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Operação não concluída.");
    return json;
  };

  const chooseAgent = (value: string) => {
    const agent = data.agents?.find((item: any) => String(item.id) === value);
    setForm(current => ({ ...current, agentId: value === "none" ? "" : value, commissionPercentage: agent ? String(agent.defaultCommissionPercentage || 0) : "" }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await post({ action: "create_rental", ...form });
      toast.success("Aluguel criado com o agente e a comissão definidos.");
      setOpen(false); setForm(empty()); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao criar aluguel."); }
  };

  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!paying) return;
    try {
      const result = await post({ action: "pay_rent", rentalId: paying.id, referenceMonth: payMonth, amount: payAmount || paying.monthlyRent });
      const commission = Number(result.commissionAmount || 0);
      toast.success(commission > 0 ? `Aluguel recebido. Comissão registrada: ${money(commission)}.` : "Aluguel recebido e lançado no caixa.");
      setPaying(null); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao registrar pagamento."); }
  };

  const end = async (rental: any) => {
    if (!window.confirm(`Encerrar o aluguel de ${rental.propertyTitle}?`)) return;
    try { await post({ action: "end_rental", id: rental.id }); toast.success("Aluguel encerrado e imóvel liberado."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao encerrar aluguel."); }
  };

  const paidKey = useMemo(() => new Set(data.payments.filter((p: any) => p.status === "pago").map((p: any) => `${p.rentalId}:${p.referenceMonth}`)), [data.payments]);
  const active = data.rentals.filter((r: any) => r.status === "ativo");
  const monthTotal = active.reduce((sum: number, r: any) => sum + Number(r.monthlyRent || 0), 0);
  const received = active.filter((r: any) => paidKey.has(`${r.id}:${data.currentMonth || monthNow}`)).reduce((sum: number, r: any) => sum + Number(r.monthlyRent || 0), 0);
  const state = (r: any) => { const ref = data.currentMonth || monthNow; if (paidKey.has(`${r.id}:${ref}`)) return "pago"; return today.getDate() > Number(r.dueDay) ? "atrasado" : "pendente"; };

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><KeyRound className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Aluguéis</h1></div><p className="mt-1 text-muted-foreground">Controle inquilinos, vencimentos, recebimentos e agentes comissionados.</p></div>{user?.canInsert && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo aluguel</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Novo contrato de aluguel</DialogTitle></DialogHeader><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <div><Label>Imóvel *</Label><Select value={form.propertyId} onValueChange={value => setForm({ ...form, propertyId: value })}><SelectTrigger><SelectValue placeholder="Selecionar imóvel" /></SelectTrigger><SelectContent>{data.properties.filter((p: any) => p.status === "disponivel").map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.title} · {p.address}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Cliente *</Label><Select value={form.clientId} onValueChange={value => setForm({ ...form, clientId: value })}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{data.clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Valor mensal *</Label><Input type="number" min="0.01" step="0.01" value={form.monthlyRent} onChange={e => setForm({ ...form, monthlyRent: e.target.value })} required /></div>
      <div><Label>Dia do pagamento *</Label><Input type="number" min="1" max="31" value={form.dueDay} onChange={e => setForm({ ...form, dueDay: e.target.value })} required /></div>
      <div><Label>Início do aluguel *</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></div>
      <div><Label>Agente comissionado</Label><Select value={form.agentId || "none"} onValueChange={chooseAgent}><SelectTrigger><SelectValue placeholder="Sem agente" /></SelectTrigger><SelectContent><SelectItem value="none">Sem agente comissionado</SelectItem>{data.agents?.map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {Number(agent.defaultCommissionPercentage || 0).toFixed(2)}%</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Comissão sobre cada aluguel (%)</Label><Input type="number" min="0" max="100" step="0.01" value={form.commissionPercentage} disabled={!form.agentId} onChange={e => setForm({ ...form, commissionPercentage: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar aluguel</Button></div>
    </form></DialogContent></Dialog>}</div>

    <div className="grid gap-3 sm:grid-cols-4"><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Contratos ativos</p><p className="text-2xl font-bold">{active.length}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Previsto no mês</p><p className="text-2xl font-bold">{money(monthTotal)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Recebido no mês</p><p className="text-2xl font-bold">{money(received)}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendente no mês</p><p className="text-2xl font-bold">{money(monthTotal - received)}</p></CardContent></Card></div>

    {loading ? <div className="py-16 text-center text-muted-foreground">Carregando aluguéis...</div> : data.rentals.length === 0 ? <Card><CardContent className="py-16 text-center"><Home className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">Nenhum aluguel cadastrado</p></CardContent></Card> : <div className="space-y-3">{data.rentals.map((r: any) => { const status = r.status === "ativo" ? state(r) : "encerrado"; return <Card key={r.id}><CardContent className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{r.propertyTitle}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${status === "pago" ? "bg-emerald-100 text-emerald-700" : status === "atrasado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{status}</span></div><p className="text-sm text-muted-foreground">Inquilino: {r.clientName}</p>{r.agentName && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><UserRound className="h-3.5 w-3.5" />Agente: {r.agentName} · {Number(r.commissionPercentage || 0).toFixed(2)}%</p>}</div><div><p className="font-bold">{money(r.monthlyRent)}</p><p className="text-xs text-muted-foreground">Vencimento dia {r.dueDay}</p></div></div>{r.status === "ativo" && <div className="mt-4 flex flex-wrap gap-2">{user?.canEdit && status !== "pago" && <Button size="sm" onClick={() => { setPaying(r); setPayMonth(data.currentMonth || monthNow); setPayAmount(String(r.monthlyRent)); }}><Wallet className="mr-2 h-4 w-4" />Registrar pagamento</Button>}{status === "pago" && <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Pagamento do mês registrado</span>}{user?.canEdit && <Button size="sm" variant="outline" onClick={() => end(r)}>Encerrar aluguel</Button>}</div>}</CardContent></Card>; })}</div>}

    <Dialog open={Boolean(paying)} onOpenChange={value => !value && setPaying(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Registrar pagamento do aluguel</DialogTitle></DialogHeader>{paying && <form onSubmit={pay} className="space-y-4"><div className="rounded-xl bg-muted/40 p-3"><p className="font-semibold">{paying.propertyTitle}</p><p className="text-sm text-muted-foreground">{paying.clientName}</p>{paying.agentName && <p className="mt-1 text-xs text-primary">Comissão: {paying.agentName} · {Number(paying.commissionPercentage || 0).toFixed(2)}%</p>}</div><div><Label>Mês de referência *</Label><Input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)} required /></div><div><Label>Valor recebido *</Label><Input type="number" min="0.01" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} required /></div><p className="flex items-start gap-2 rounded-xl border p-3 text-xs text-muted-foreground"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />O recebimento entra no Caixa e, se houver agente, a comissão fica registrada neste pagamento.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPaying(null)}>Cancelar</Button><Button type="submit">Confirmar pagamento</Button></div></form>}</DialogContent></Dialog>
  </div></DashboardLayout>;
}
