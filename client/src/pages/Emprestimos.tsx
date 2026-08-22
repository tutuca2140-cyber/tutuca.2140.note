import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { calculateLoanPlan, type InterestType, type RatePeriod } from "../../../shared/finance";
import { Banknote, Calculator, CalendarDays, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const currency = (value: number | string) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Emprestimos() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    clientId: "",
    amount: "",
    interestType: "simple" as InterestType,
    interestRate: "0",
    ratePeriod: "month" as RatePeriod,
    installments: "",
    startDate: today(),
    endDate: "",
    description: "",
  });
  const { data: loans, isLoading } = trpc.loans.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const utils = trpc.useUtils();
  const createLoan = trpc.loans.create.useMutation();

  const plan = useMemo(() => {
    const principal = Number(form.amount);
    const rate = Number(form.interestRate);
    const periods = form.installments.trim() === "" ? 1 : Number(form.installments);
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(periods) || periods < 1) return null;
    return calculateLoanPlan({ principal, ratePercent: rate, periods, interestType: form.interestType, ratePeriod: form.ratePeriod });
  }, [form.amount, form.interestRate, form.installments, form.interestType, form.ratePeriod]);

  const clientMap = useMemo(() => new Map((clients ?? []).map((client) => [client.id, client.name])), [clients]);
  const filteredLoans = (loans ?? []).filter((loan) => {
    const clientName = clientMap.get(loan.clientId) ?? "";
    return `${clientName} ${loan.description ?? ""} ${loan.status}`.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => setForm({ clientId: "", amount: "", interestType: "simple", interestRate: "0", ratePeriod: "month", installments: "", startDate: today(), endDate: "", description: "" });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan || !form.clientId) {
      toast.error("Selecione um cliente e informe valores válidos para calcular o contrato.");
      return;
    }
    try {
      await createLoan.mutateAsync({
        clientId: Number(form.clientId),
        amount: plan.principal.toFixed(2),
        interestType: form.interestType,
        interestRate: Number(form.interestRate).toFixed(4),
        ratePeriod: form.ratePeriod,
        installments: form.installments.trim() ? plan.periods : undefined,
        startDate: new Date(`${form.startDate}T12:00:00`).toISOString(),
        endDate: form.endDate ? new Date(`${form.endDate}T12:00:00`).toISOString() : undefined,
        description: form.description || undefined,
      });
      await utils.loans.list.invalidate();
      toast.success("Empréstimo calculado e salvo com sucesso.");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o empréstimo.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Carteira</p>
            <h1 className="text-3xl font-bold tracking-tight">Empréstimos</h1>
            <p className="mt-2 text-muted-foreground">Cadastre contratos vinculados a clientes e calcule juros com clareza.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo empréstimo</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader><DialogTitle>Novo empréstimo</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label htmlFor="loan-client">Cliente existente *</Label><select id="loan-client" value={form.clientId} onChange={(event) => update("clientId", event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" required><option value="">Selecione um cliente</option>{(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
                  <div><Label htmlFor="loan-amount">Principal (R$) *</Label><Input id="loan-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update("amount", event.target.value)} placeholder="1.000,00" required /></div>
                  <div><Label htmlFor="loan-rate">Taxa por período (%) *</Label><Input id="loan-rate" type="number" min="0" step="0.0001" value={form.interestRate} onChange={(event) => update("interestRate", event.target.value)} required /></div>
                  <div><Label htmlFor="loan-interest-type">Tipo de juros</Label><select id="loan-interest-type" value={form.interestType} onChange={(event) => update("interestType", event.target.value as InterestType)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="simple">Juros simples</option><option value="compound">Juros compostos</option></select></div>
                  <div><Label htmlFor="loan-period">Periodicidade da taxa</Label><select id="loan-period" value={form.ratePeriod} onChange={(event) => update("ratePeriod", event.target.value as RatePeriod)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="day">Diária</option><option value="week">Semanal</option><option value="month">Mensal</option><option value="year">Anual</option></select></div>
                  <div><Label htmlFor="loan-installments">Quantidade de períodos (opcional)</Label><Input id="loan-installments" type="number" min="1" step="1" value={form.installments} onChange={(event) => update("installments", event.target.value)} placeholder="Deixe em branco para contrato aberto" /></div>
                  <div><Label htmlFor="loan-start">Início *</Label><Input id="loan-start" type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} required /></div>
                  <div><Label htmlFor="loan-end">Término (opcional)</Label><Input id="loan-end" type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></div>
                  <div className="sm:col-span-2"><Label htmlFor="loan-description">Observações</Label><Textarea id="loan-description" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Garantias, condições ou observações do contrato" /></div>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold"><Calculator className="h-4 w-4 text-primary" />Prévia financeira</div>
                  {plan ? <div className="grid gap-3 text-sm sm:grid-cols-4"><div><span className="text-muted-foreground">Juros</span><p className="font-semibold">{currency(plan.interestAmount)}</p></div><div><span className="text-muted-foreground">Total</span><p className="font-semibold">{currency(plan.totalAmount)}</p></div><div><span className="text-muted-foreground">Parcela</span><p className="font-semibold text-primary">{currency(plan.installmentAmount)}</p></div><div><span className="text-muted-foreground">Fórmula</span><p className="font-semibold">{form.interestType === "simple" ? "Simples" : "Compostos"}</p></div></div> : <p className="text-sm text-muted-foreground">Informe principal, taxa e quantidade de períodos para visualizar o cálculo.</p>}
                </div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={createLoan.isPending || !plan}>{createLoan.isPending ? "Salvando..." : "Salvar empréstimo"}</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" placeholder="Buscar por cliente, descrição ou status..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></div>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">Carregando empréstimos...</div> : filteredLoans.length ? <div className="grid gap-4 md:grid-cols-2">{filteredLoans.map((loan) => <Card key={loan.id}><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">{clientMap.get(loan.clientId) ?? "Cliente não encontrado"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Contrato #{loan.id} · {loan.interestType === "compound" ? "Juros compostos" : "Juros simples"}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">{loan.status}</span></CardHeader><CardContent><div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><span className="text-muted-foreground">Principal</span><p className="font-semibold">{currency(loan.amount)}</p></div><div><span className="text-muted-foreground">Total</span><p className="font-semibold">{currency(loan.totalAmount)}</p></div><div><span className="text-muted-foreground">Parcela</span><p className="font-semibold">{currency(loan.installmentAmount)}</p></div><div><span className="text-muted-foreground">Saldo</span><p className="font-semibold text-primary">{currency(loan.remainingBalance)}</p></div></div><div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{new Date(loan.startDate).toLocaleDateString("pt-BR")} até {new Date(loan.endDate).toLocaleDateString("pt-BR")} · {loan.installments} períodos</div></CardContent></Card>)}</div> : <Card><CardContent className="flex flex-col items-center justify-center py-14 text-center"><Banknote className="mb-4 h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground">{searchTerm ? "Nenhum empréstimo encontrado." : "Nenhum empréstimo cadastrado."}</p>{!searchTerm && <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Cadastrar primeiro empréstimo</Button>}</CardContent></Card>}
      </div>
    </DashboardLayout>
  );
}
