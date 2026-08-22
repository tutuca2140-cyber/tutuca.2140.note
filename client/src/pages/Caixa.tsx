import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowDownCircle, ArrowUpCircle, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type MovementType = "ENTRADA" | "SAIDA";
type FormState = { type: MovementType; category: string; description: string; amount: string; movementDate: string; responsible: string; notes: string };
const initialForm: FormState = { type: "ENTRADA", category: "OUTROS", description: "", amount: "", movementDate: new Date().toISOString().slice(0, 16), responsible: "", notes: "" };
const money = (value: number | string) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Caixa() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const { data: movements, isLoading } = trpc.cashFlow.list.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const create = trpc.cashFlow.create.useMutation();
  const utils = trpc.useUtils();
  const entries = movements ?? [];
  const totalIn = entries.filter((item) => item.type === "ENTRADA").reduce((sum, item) => sum + Number(item.amount), 0);
  const totalOut = entries.filter((item) => item.type === "SAIDA").reduce((sum, item) => sum + Number(item.amount), 0);
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ ...form, movementDate: new Date(form.movementDate).toISOString(), amount: form.amount });
      await Promise.all([utils.cashFlow.list.invalidate(), utils.dashboard.stats.invalidate()]);
      toast.success(form.type === "ENTRADA" ? "Entrada registrada no caixa." : "Saída registrada no caixa.");
      setOpen(false); setForm(initialForm);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível registrar a movimentação."); }
  };
  return <DashboardLayout><div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Financeiro</p><h1 className="text-3xl font-bold tracking-tight">Caixa</h1><p className="mt-2 text-muted-foreground">Acompanhe movimentações reais e registre entradas ou saídas sem campos desnecessários.</p></div><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Movimentar caixa</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Nova movimentação</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-2"><Button type="button" variant={form.type === "ENTRADA" ? "default" : "outline"} onClick={() => setField("type", "ENTRADA")}><ArrowUpCircle className="mr-2 h-4 w-4" />Entrada</Button><Button type="button" variant={form.type === "SAIDA" ? "default" : "outline"} onClick={() => setField("type", "SAIDA")}><ArrowDownCircle className="mr-2 h-4 w-4" />Saída</Button></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="cash-category">Categoria *</Label><Input id="cash-category" required value={form.category} onChange={(event) => setField("category", event.target.value)} /></div><div><Label htmlFor="cash-amount">Valor *</Label><Input id="cash-amount" required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setField("amount", event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="cash-description">Descrição *</Label><Input id="cash-description" required value={form.description} onChange={(event) => setField("description", event.target.value)} /></div><div><Label htmlFor="cash-date">Data</Label><Input id="cash-date" type="datetime-local" value={form.movementDate} onChange={(event) => setField("movementDate", event.target.value)} /></div><div><Label htmlFor="cash-responsible">Responsável</Label><Input id="cash-responsible" value={form.responsible} onChange={(event) => setField("responsible", event.target.value)} /></div><div className="sm:col-span-2"><Label htmlFor="cash-notes">Observação</Label><Textarea id="cash-notes" value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando..." : "Confirmar movimentação"}</Button></div></form></DialogContent></Dialog></div><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Entradas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-emerald-600">{money(totalIn || stats?.totalEntradas || 0)}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saídas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{money(totalOut || stats?.totalSaidas || 0)}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo atual</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-primary">{money((totalIn - totalOut) || stats?.saldoCaixa || 0)}</p></CardContent></Card></div>{isLoading ? <div className="py-10 text-center text-muted-foreground">Carregando movimentações...</div> : <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Movimentações recentes</CardTitle></CardHeader><CardContent>{entries.length ? <div className="space-y-2">{entries.slice(0, 50).map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">{item.category} · {new Date(item.movementDate).toLocaleString("pt-BR")}{item.responsible ? ` · ${item.responsible}` : ""}</p></div><p className={`font-semibold ${item.type === "ENTRADA" ? "text-emerald-600" : "text-red-600"}`}>{item.type === "ENTRADA" ? "+" : "-"} {money(item.amount)}</p></div>)}</div> : <p className="py-8 text-center text-muted-foreground">Nenhuma movimentação no banco ativo.</p>}</CardContent></Card>}</div></DashboardLayout>;
}
