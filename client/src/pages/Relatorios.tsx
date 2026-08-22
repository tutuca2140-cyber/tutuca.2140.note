import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";
import { jsPDF } from "jspdf";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const money = (value: unknown) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function Relatorios() {
  const [search, setSearch] = useState("");
  const { data: clients = [], isLoading: clientsLoading } = trpc.clients.list.useQuery();
  const { data: loans = [], isLoading: loansLoading, refetch: refetchLoans } = trpc.loans.list.useQuery();
  const { data: financings = [], isLoading: financingsLoading } = trpc.vehicleFinancings.list.useQuery();
  const { data: payments = [], isLoading: paymentsLoading, refetch: refetchPayments } = trpc.payments.list.useQuery();

  const clientMap = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const query = search.trim().toLowerCase();
  const filteredLoans = useMemo(() => loans.filter((loan) => !query || (clientMap.get(loan.clientId) ?? '').toLowerCase().includes(query) || String(loan.id).includes(query)), [loans, clientMap, query]);
  const filteredPayments = useMemo(() => payments.filter((payment) => !query || String(payment.id).includes(query) || String(payment.loanId ?? payment.vehicleFinancingId ?? '').includes(query)), [payments, query]);
  const isLoading = clientsLoading || loansLoading || financingsLoading || paymentsLoading;
  const totalReceipts = payments.filter((payment) => payment.status === 'pago').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const openBalance = loans.reduce((sum, loan) => sum + Number(loan.remainingBalance || 0), 0) + financings.reduce((sum, financing) => sum + Number(financing.totalAmount || financing.financedAmount || 0), 0);

  const downloadCsv = (name: string, headers: string[], rows: unknown[][]) => {
    const content = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\n');
    const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Arquivo ${name} gerado.`);
  };

  const exportLoans = () => downloadCsv('relatorio-emprestimos.csv', ['Contrato', 'Cliente', 'Status', 'Principal', 'Total', 'Saldo', 'Parcelas'], filteredLoans.map((loan) => [loan.id, clientMap.get(loan.clientId) ?? 'Não informado', loan.status, money(loan.amount), money(loan.totalAmount), money(loan.remainingBalance), loan.installments]));
  const exportCashFlow = () => downloadCsv('relatorio-fluxo-de-caixa.csv', ['Pagamento', 'Data', 'Contrato', 'Tipo', 'Status', 'Valor', 'Principal', 'Juros', 'Comissão', 'Líquido'], filteredPayments.map((payment) => [payment.id, new Date(payment.paymentDate).toLocaleDateString('pt-BR'), payment.loanId ?? payment.vehicleFinancingId, payment.loanId ? 'Empréstimo' : 'Financiamento', payment.status, money(payment.amount), money(payment.principalAmount), money(payment.interestAmount), money(payment.commissionAmount), money(payment.netAmount)]));
  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('DEATH NOTE — Relatório financeiro', 14, 18);
    doc.setFontSize(10); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 26);
    let y = 38;
    doc.setFontSize(13); doc.text('Empréstimos', 14, y); y += 8; doc.setFontSize(9);
    filteredLoans.forEach((loan) => { if (y > 280) { doc.addPage(); y = 18; } doc.text(`#${loan.id} | ${clientMap.get(loan.clientId) ?? 'Cliente não informado'} | ${loan.status} | Total ${money(loan.totalAmount)} | Saldo ${money(loan.remainingBalance)}`, 14, y); y += 6; });
    y += 6; doc.setFontSize(13); doc.text('Fluxo financeiro — pagamentos', 14, y); y += 8; doc.setFontSize(9);
    filteredPayments.forEach((payment) => { if (y > 280) { doc.addPage(); y = 18; } doc.text(`#${payment.id} | ${new Date(payment.paymentDate).toLocaleDateString('pt-BR')} | ${payment.loanId ? `Empréstimo #${payment.loanId}` : `Financiamento #${payment.vehicleFinancingId}`} | ${payment.status} | ${money(payment.amount)} | Líquido ${money(payment.netAmount)}`, 14, y); y += 6; });
    doc.save('relatorio-financeiro.pdf'); toast.success('PDF financeiro gerado.');
  };

  return <DashboardLayout><div className="space-y-6 print:p-0"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Relatórios</h1><p className="mt-2 text-muted-foreground">Empréstimos, contratos de veículos e fluxo de caixa do banco ativo.</p></div><div className="flex gap-2 print:hidden"><Button variant="outline" onClick={() => { void refetchLoans(); void refetchPayments(); }}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button><Button variant="outline" onClick={exportPdf}><Printer className="mr-2 h-4 w-4" />PDF</Button></div></div><div className="print:hidden"><Input placeholder="Filtrar por cliente ou número do contrato..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>{isLoading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando dados dos relatórios...</CardContent></Card> : <><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Recebimentos pagos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-primary">{money(totalReceipts)}</p><p className="text-xs text-muted-foreground">{payments.filter((payment) => payment.status === 'pago').length} pagamentos</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Saldo contratado em aberto</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{money(openBalance)}</p><p className="text-xs text-muted-foreground">Empréstimos e financiamentos</p></CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Clientes cadastrados</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{clients.length}</p><p className="text-xs text-muted-foreground">No banco de dados ativo</p></CardContent></Card></div><div className="grid gap-4 md:grid-cols-2 print:grid-cols-1"><Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Relatório de empréstimos</CardTitle><Button size="sm" variant="outline" className="print:hidden" onClick={exportLoans}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader><CardContent><div className="space-y-2 text-sm">{filteredLoans.slice(0, 8).map((loan) => <div key={loan.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">#{loan.id} · {clientMap.get(loan.clientId) ?? 'Cliente não informado'}</p><p className="text-xs capitalize text-muted-foreground">{loan.status} · {loan.installments} parcelas</p></div><div className="text-right"><p className="font-semibold">{money(loan.totalAmount)}</p><p className="text-xs text-muted-foreground">Saldo: {money(loan.remainingBalance)}</p></div></div>)}{!filteredLoans.length && <p className="py-6 text-center text-muted-foreground">Nenhum empréstimo encontrado.</p>}</div></CardContent></Card><Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Fluxo de caixa</CardTitle><Button size="sm" variant="outline" className="print:hidden" onClick={exportCashFlow}><Download className="mr-2 h-4 w-4" />CSV</Button></CardHeader><CardContent><div className="space-y-2 text-sm">{filteredPayments.slice(0, 8).map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{new Date(payment.paymentDate).toLocaleDateString('pt-BR')} · {payment.loanId ? `Empréstimo #${payment.loanId}` : `Financiamento #${payment.vehicleFinancingId}`}</p><p className="text-xs capitalize text-muted-foreground">{payment.status} · {money(payment.netAmount)} líquido</p></div><p className="font-semibold text-primary">{money(payment.amount)}</p></div>)}{!filteredPayments.length && <p className="py-6 text-center text-muted-foreground">Nenhum pagamento encontrado.</p>}</div></CardContent></Card></div></>}</div></DashboardLayout>;
}
