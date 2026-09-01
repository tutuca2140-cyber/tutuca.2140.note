import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { loanContractName } from "@/lib/contract-name";
import { Building2, ClipboardList, CreditCard, FilePenLine, KeyRound, Plus, RefreshCw, Trash2, UserRound, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PROPERTY_API = "/api/site-access?scope=properties";
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const formatCurrency = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const formatDate = (date: Date | string) => new Date(date).toLocaleDateString("pt-BR");
const dateInput = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

type PaymentRow = {
  id: number; amount: string; paymentDate: Date | string; dueDate: Date | string;
  status: "pago" | "pendente" | "atrasado"; notes: string | null;
  loanId: number | null; vehicleFinancingId: number | null;
  interestAmount: string; principalAmount: string; commissionAmount: string;
  commissionPercentage: string; netAmount: string;
};

export default function Pagamentos() {
  const { user } = useAuth();
  const [openCreate, setOpenCreate] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [contractType, setContractType] = useState<"emprestimo" | "financiamento">("emprestimo");
  const [selectedLoan, setSelectedLoan] = useState("");
  const [selectedFinancing, setSelectedFinancing] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [formData, setFormData] = useState({ amount: "", installmentNumber: "1", paymentDate: today(), notes: "" });
  const [editData, setEditData] = useState({ amount: "", status: "pago" as "pago" | "pendente" | "atrasado", paymentDate: today(), dueDate: today(), notes: "" });
  const [propertyData, setPropertyData] = useState<any>({ rentals: [], financings: [], payments: [], financingPayments: [], currentMonth: currentMonth() });
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyPaying, setPropertyPaying] = useState<string | null>(null);

  const { data: payments, isLoading: paymentsLoading } = trpc.payments.list.useQuery();
  const { data: loans } = trpc.loans.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: financings } = trpc.vehicleFinancings.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery({ includeInactive: false });
  const createPaymentMutation = trpc.payments.create.useMutation();
  const updatePaymentMutation = trpc.payments.update.useMutation();
  const deletePaymentMutation = trpc.payments.delete.useMutation();
  const utils = trpc.useUtils();

  const selectedFinancingData = financings?.find(financing => financing.id === Number(selectedFinancing));
  const financingExtra = selectedFinancingData ? Math.max(0, Number(formData.amount || 0) - Number(selectedFinancingData.installmentAmount)) : 0;

  const loadProperties = async () => {
    setPropertyLoading(true);
    try {
      const response = await fetch(PROPERTY_API, { credentials: "include" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message || "Não foi possível carregar os recebimentos de imóveis.");
      setPropertyData(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar pagamentos de imóveis.");
    } finally { setPropertyLoading(false); }
  };
  useEffect(() => { void loadProperties(); }, []);

  const postProperty = async (body: any) => {
    const response = await fetch(PROPERTY_API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Pagamento não concluído.");
    return json;
  };

  const invalidateFinance = async () => {
    await Promise.all([
      utils.payments.list.invalidate(), utils.loans.list.invalidate(), utils.vehicleFinancings.list.invalidate(),
      utils.cashFlow.list.invalidate(), utils.dashboard.stats.invalidate(), utils.dashboard.agentPerformance.invalidate(),
    ]);
  };

  const handleCreatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (contractType === "emprestimo" && !selectedLoan) return toast.error("Selecione um empréstimo.");
    if (contractType === "financiamento" && !selectedFinancing) return toast.error("Selecione um financiamento.");
    const percentage = commissionPercentage === "" ? undefined : Number(commissionPercentage);
    if (percentage !== undefined && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) return toast.error("A comissão deve estar entre 0% e 100%.");
    try {
      await createPaymentMutation.mutateAsync({
        loanId: contractType === "emprestimo" ? Number(selectedLoan) : undefined,
        vehicleFinancingId: contractType === "financiamento" ? Number(selectedFinancing) : undefined,
        installmentNumber: Number(formData.installmentNumber), amount: formData.amount,
        paymentDate: new Date(`${formData.paymentDate}T12:00:00`).toISOString(), dueDate: new Date(`${formData.paymentDate}T12:00:00`).toISOString(),
        status: "pago", notes: formData.notes, agentId: selectedAgent ? Number(selectedAgent) : undefined, commissionPercentage: percentage,
      });
      await invalidateFinance();
      toast.success("Pagamento lançado com sucesso e registrado no caixa.");
      setOpenCreate(false); setFormData({ amount: "", installmentNumber: "1", paymentDate: today(), notes: "" });
      setSelectedLoan(""); setSelectedFinancing(""); setSelectedAgent(""); setCommissionPercentage("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao registrar pagamento."); }
  };

  const openEdit = (payment: PaymentRow) => {
    setEditingPayment(payment);
    setEditData({ amount: String(payment.amount), status: payment.status, paymentDate: dateInput(payment.paymentDate), dueDate: dateInput(payment.dueDate), notes: payment.notes ?? "" });
  };
  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editingPayment) return;
    try {
      await updatePaymentMutation.mutateAsync({ id: editingPayment.id, amount: editData.amount, status: editData.status, paymentDate: new Date(`${editData.paymentDate}T12:00:00`).toISOString(), dueDate: new Date(`${editData.dueDate}T12:00:00`).toISOString(), notes: editData.notes });
      await invalidateFinance(); toast.success("Pagamento editado e caixa reconciliado."); setEditingPayment(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível editar o pagamento."); }
  };
  const handleDelete = async (id: number) => {
    if (!window.confirm("Excluir este pagamento? A entrada será revertida e o saldo recalculado.")) return;
    try { await deletePaymentMutation.mutateAsync({ id }); await invalidateFinance(); toast.success("Pagamento excluído e saldos recalculados."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o pagamento."); }
  };

  const rentalPaidThisMonth = (rentalId: number) => (propertyData.payments || []).some((p: any) => Number(p.rentalId) === Number(rentalId) && p.referenceMonth === (propertyData.currentMonth || currentMonth()) && p.status === "pago");
  const nextPropertyInstallment = (financing: any) => {
    const paid = (propertyData.financingPayments || []).filter((p: any) => Number(p.financingId) === Number(financing.id)).map((p: any) => Number(p.installmentNumber));
    let next = 1; while (paid.includes(next) && next <= Number(financing.installments)) next++;
    return next;
  };

  const receiveRent = async (rental: any) => {
    const referenceMonth = propertyData.currentMonth || currentMonth();
    if (!window.confirm(`Receber ${formatCurrency(rental.monthlyRent)} do aluguel de ${rental.propertyTitle} referente a ${referenceMonth}?`)) return;
    setPropertyPaying(`rent-${rental.id}`);
    try {
      const result = await postProperty({ action: "pay_rent", rentalId: rental.id, referenceMonth, amount: rental.monthlyRent });
      await Promise.all([loadProperties(), utils.cashFlow.list.invalidate(), utils.dashboard.stats.invalidate(), utils.dashboard.agentPerformance.invalidate()]);
      toast.success(Number(result.commissionAmount || 0) > 0 ? `Aluguel recebido. Comissão: ${formatCurrency(result.commissionAmount)}.` : "Aluguel recebido e lançado no caixa.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao receber aluguel."); }
    finally { setPropertyPaying(null); }
  };

  const receivePropertyFinancing = async (financing: any) => {
    const installmentNumber = nextPropertyInstallment(financing);
    if (installmentNumber > Number(financing.installments)) return toast.info("Este financiamento já está totalmente pago.");
    if (!window.confirm(`Receber parcela ${installmentNumber}/${financing.installments} de ${formatCurrency(financing.installmentAmount)} do imóvel ${financing.propertyTitle}?`)) return;
    setPropertyPaying(`finance-${financing.id}`);
    try {
      const result = await postProperty({ action: "pay_financing", financingId: financing.id, installmentNumber, amount: financing.installmentAmount });
      await Promise.all([loadProperties(), utils.cashFlow.list.invalidate(), utils.dashboard.stats.invalidate(), utils.dashboard.agentPerformance.invalidate()]);
      toast.success(Number(result.commissionAmount || 0) > 0 ? `Parcela recebida. Comissão: ${formatCurrency(result.commissionAmount)}.` : "Parcela do imóvel recebida e lançada no caixa.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao receber parcela do imóvel."); }
    finally { setPropertyPaying(null); }
  };

  const propertyHistory = useMemo(() => {
    const rents = (propertyData.payments || []).filter((p: any) => p.status === "pago").map((p: any) => ({ key: `rent-${p.id}`, kind: "Aluguel", title: p.propertyTitle || `Aluguel #${p.rentalId}`, client: p.clientName || "", amount: p.amount, date: p.paymentDate || p.createdAt, commission: p.commissionAmount, agent: p.agentName, detail: `Referência ${p.referenceMonth}` }));
    const installments = (propertyData.financingPayments || []).map((p: any) => ({ key: `fin-${p.id}`, kind: "Financiamento de imóvel", title: p.propertyTitle || `Financiamento #${p.financingId}`, client: p.clientName || "", amount: p.amount, date: p.paymentDate || p.createdAt, commission: p.commissionAmount, agent: p.agentName, detail: `Parcela ${p.installmentNumber}` }));
    return [...rents, ...installments].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [propertyData]);

  const legacyReceived = payments?.filter(payment => payment.status === "pago").reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
  const propertyReceived = propertyHistory.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1><p className="mt-2 text-muted-foreground">Receba empréstimos, financiamentos, aluguéis e parcelas de imóveis no mesmo lugar.</p></div>{user?.canInsert && <Dialog open={openCreate} onOpenChange={setOpenCreate}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo pagamento</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Registrar pagamento</DialogTitle></DialogHeader><form onSubmit={handleCreatePayment} className="space-y-4">
      <div><Label>Tipo de contrato</Label><Select value={contractType} onValueChange={(value: "emprestimo" | "financiamento") => { setContractType(value); setSelectedLoan(""); setSelectedFinancing(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="emprestimo">Empréstimo</SelectItem><SelectItem value="financiamento">Financiamento de veículo ou produto</SelectItem></SelectContent></Select></div>
      {contractType === "emprestimo" ? <div><Label>Empréstimo *</Label><Select value={selectedLoan} onValueChange={setSelectedLoan}><SelectTrigger><SelectValue placeholder="Selecionar empréstimo" /></SelectTrigger><SelectContent>{loans?.filter(loan => loan.status === "ativo").map(loan => <SelectItem key={loan.id} value={String(loan.id)}>{loanContractName(clients?.find(client => client.id === loan.clientId)?.name, loan.id)} · {formatCurrency(loan.amount)}</SelectItem>)}</SelectContent></Select></div> : <div><Label>Financiamento *</Label><Select value={selectedFinancing} onValueChange={value => { setSelectedFinancing(value); const financing = financings?.find(item => item.id === Number(value)); if (financing) setFormData(current => ({ ...current, amount: String(financing.installmentAmount) })); }}><SelectTrigger><SelectValue placeholder="Selecionar financiamento" /></SelectTrigger><SelectContent>{financings?.filter(financing => !["pago", "cancelado"].includes(financing.status)).map(financing => <SelectItem key={financing.id} value={String(financing.id)}>Contrato #{financing.id} · parcela {formatCurrency(financing.installmentAmount)}</SelectItem>)}</SelectContent></Select></div>}
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Número da parcela *</Label><Input type="number" min="1" max={selectedFinancingData?.installments} value={formData.installmentNumber} onChange={e => setFormData({ ...formData, installmentNumber: e.target.value })} required /></div><div><Label>Valor recebido *</Label><Input type="number" min="0.01" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required /></div><div><Label>Data do pagamento *</Label><Input type="date" value={formData.paymentDate} onChange={e => setFormData({ ...formData, paymentDate: e.target.value })} required /></div><div><Label>Notas</Label><Input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} /></div></div>
      {selectedFinancingData && <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2"><div><p className="text-muted-foreground">Valor da parcela</p><p className="font-semibold">{formatCurrency(selectedFinancingData.installmentAmount)}</p></div><div><p className="text-muted-foreground">Amortização extra</p><p className="font-semibold text-primary">{formatCurrency(financingExtra)}</p></div></div>}
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Agente comissionado</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Select value={selectedAgent || "none"} onValueChange={value => { setSelectedAgent(value === "none" ? "" : value); const agent = agents?.find(item => item.id.toString() === value); setCommissionPercentage(agent ? String(agent.defaultCommissionPercentage || "0") : ""); }}><SelectTrigger><SelectValue placeholder="Sem agente" /></SelectTrigger><SelectContent><SelectItem value="none">Sem agente comissionado</SelectItem>{agents?.map(agent => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {Number(agent.defaultCommissionPercentage || 0).toFixed(2)}%</SelectItem>)}</SelectContent></Select>{selectedAgent && <Input type="number" min="0" max="100" step="0.01" value={commissionPercentage} onChange={e => setCommissionPercentage(e.target.value)} />}</CardContent></Card>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button><Button type="submit" disabled={createPaymentMutation.isPending}>{createPaymentMutation.isPending ? "Salvando..." : "Registrar pagamento"}</Button></div>
    </form></DialogContent></Dialog>}</div>

    <Card className="border-blue-200 bg-blue-50/30"><CardHeader><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" />Recebimentos de imóveis</CardTitle><p className="mt-1 text-sm text-muted-foreground">Aluguéis e financiamentos imobiliários podem ser pagos diretamente por esta área.</p></div><Button size="sm" variant="outline" onClick={() => void loadProperties()} disabled={propertyLoading}><RefreshCw className={`mr-2 h-4 w-4 ${propertyLoading ? "animate-spin" : ""}`} />Atualizar</Button></div></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Aluguéis ativos</h3>{propertyLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : propertyData.rentals?.filter((r: any) => r.status === "ativo").length ? propertyData.rentals.filter((r: any) => r.status === "ativo").map((rental: any) => { const paid = rentalPaidThisMonth(rental.id); return <div key={rental.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{rental.propertyTitle}</p><p className="text-xs text-muted-foreground">{rental.clientName} · vence dia {rental.dueDay}</p>{rental.agentName && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><UserRound className="h-3 w-3" />{rental.agentName} · {Number(rental.commissionPercentage || 0).toFixed(2)}%</p>}</div><p className="font-bold">{formatCurrency(rental.monthlyRent)}</p></div><Button className="mt-3 w-full" size="sm" variant={paid ? "outline" : "default"} disabled={paid || propertyPaying === `rent-${rental.id}` || !user?.canEdit} onClick={() => receiveRent(rental)}>{paid ? "Aluguel do mês já pago" : propertyPaying === `rent-${rental.id}` ? "Recebendo..." : "Receber aluguel"}</Button></div>; }) : <p className="text-sm text-muted-foreground">Nenhum aluguel ativo.</p>}</div>
      <div className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><WalletCards className="h-4 w-4" />Financiamentos de imóveis</h3>{propertyLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : propertyData.financings?.filter((f: any) => f.status === "ativo").length ? propertyData.financings.filter((f: any) => f.status === "ativo").map((financing: any) => { const next = nextPropertyInstallment(financing); const finished = next > Number(financing.installments); return <div key={financing.id} className="rounded-xl border bg-background p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{financing.propertyTitle}</p><p className="text-xs text-muted-foreground">{financing.clientName} · próxima {Math.min(next, Number(financing.installments))}/{financing.installments}</p>{financing.agentName && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><UserRound className="h-3 w-3" />{financing.agentName} · {Number(financing.commissionPercentage || 0).toFixed(2)}%</p>}</div><p className="font-bold">{formatCurrency(financing.installmentAmount)}</p></div><Button className="mt-3 w-full" size="sm" disabled={finished || propertyPaying === `finance-${financing.id}` || !user?.canEdit} onClick={() => receivePropertyFinancing(financing)}>{finished ? "Financiamento quitado" : propertyPaying === `finance-${financing.id}` ? "Recebendo..." : "Receber próxima parcela"}</Button></div>; }) : <p className="text-sm text-muted-foreground">Nenhum financiamento imobiliário ativo.</p>}</div>
    </CardContent></Card>

    <Dialog open={editingPayment !== null} onOpenChange={value => !value && setEditingPayment(null)}><DialogContent><DialogHeader><DialogTitle>Editar pagamento #{editingPayment?.id}</DialogTitle></DialogHeader><form onSubmit={handleEdit} className="space-y-4"><div><Label>Valor</Label><Input type="number" min="0.01" step="0.01" value={editData.amount} onChange={e => setEditData({ ...editData, amount: e.target.value })} required /></div><div><Label>Status</Label><Select value={editData.status} onValueChange={(value: "pago" | "pendente" | "atrasado") => setEditData({ ...editData, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pago">Pago</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="atrasado">Atrasado</SelectItem></SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Data do pagamento</Label><Input type="date" value={editData.paymentDate} onChange={e => setEditData({ ...editData, paymentDate: e.target.value })} required /></div><div><Label>Vencimento</Label><Input type="date" value={editData.dueDate} onChange={e => setEditData({ ...editData, dueDate: e.target.value })} required /></div></div><div><Label>Notas</Label><Input value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} /></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingPayment(null)}>Cancelar</Button><Button type="submit" disabled={updatePaymentMutation.isPending}>Salvar edição</Button></div></form></DialogContent></Dialog>

    <Tabs defaultValue="historico"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="historico">Empréstimos e vendas</TabsTrigger><TabsTrigger value="imoveis">Imóveis</TabsTrigger><TabsTrigger value="resumo">Resumo</TabsTrigger></TabsList>
      <TabsContent value="historico" className="space-y-4">{paymentsLoading ? <div className="py-12 text-center text-muted-foreground">Carregando pagamentos...</div> : payments?.length ? payments.map(payment => <Card key={payment.id}><CardContent className="pt-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="rounded-lg bg-primary/10 p-3"><CreditCard className="h-6 w-6 text-primary" /></div><div><p className="font-semibold">Pagamento #{payment.id}</p><p className="text-sm text-muted-foreground">{payment.loanId ? `Empréstimo #${payment.loanId}` : `Financiamento #${payment.vehicleFinancingId}`} · {formatDate(payment.paymentDate)}</p></div></div><div className="sm:text-right"><p className="text-lg font-bold">{formatCurrency(payment.amount)}</p><span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">{payment.status}</span></div></div><div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4"><div><p className="text-muted-foreground">Juros</p><p className="font-medium">{formatCurrency(payment.interestAmount)}</p></div><div><p className="text-muted-foreground">Amortização</p><p className="font-medium">{formatCurrency(payment.principalAmount)}</p></div><div><p className="text-muted-foreground">Comissão</p><p className="font-medium text-primary">{formatCurrency(payment.commissionAmount)}</p></div><div><p className="text-muted-foreground">Líquido</p><p className="font-medium">{formatCurrency(payment.netAmount)}</p></div></div><div className="mt-4 flex gap-2 border-t pt-3">{user?.canEdit && <Button size="sm" variant="outline" onClick={() => openEdit(payment as PaymentRow)}><FilePenLine className="mr-1.5 h-4 w-4" />Editar</Button>}{user?.canDelete && <Button size="sm" variant="destructive" onClick={() => handleDelete(payment.id)}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button>}</div></CardContent></Card>) : <Card><CardContent className="py-12 text-center text-muted-foreground"><ClipboardList className="mx-auto mb-3 h-10 w-10" />Nenhum pagamento registrado.</CardContent></Card>}</TabsContent>
      <TabsContent value="imoveis" className="space-y-3">{propertyHistory.length ? propertyHistory.map(payment => <Card key={payment.key}><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{payment.kind} · {payment.title}</p><p className="text-sm text-muted-foreground">{payment.client}{payment.client ? " · " : ""}{payment.detail} · {payment.date ? formatDate(payment.date) : ""}</p>{payment.agent && <p className="mt-1 text-xs text-primary">Agente: {payment.agent} · comissão {formatCurrency(payment.commission || 0)}</p>}</div><p className="text-lg font-bold">{formatCurrency(payment.amount)}</p></div></CardContent></Card>) : <Card><CardContent className="py-12 text-center text-muted-foreground"><Building2 className="mx-auto mb-3 h-10 w-10" />Nenhum recebimento de imóvel registrado.</CardContent></Card>}</TabsContent>
      <TabsContent value="resumo"><div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-3"><CardTitle className="text-sm">Total recebido geral</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(legacyReceived + propertyReceived)}</p><p className="mt-2 text-xs text-muted-foreground">Inclui imóveis, aluguéis, empréstimos e vendas</p></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-sm">Recebimentos de imóveis</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(propertyReceived)}</p></CardContent></Card><Card><CardHeader className="pb-3"><CardTitle className="text-sm">Outros recebimentos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(legacyReceived)}</p></CardContent></Card></div></TabsContent>
    </Tabs>
  </div></DashboardLayout>;
}
