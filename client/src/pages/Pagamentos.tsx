import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, ClipboardList, DollarSign, CreditCard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Pagamentos() {
  const [openCreate, setOpenCreate] = useState(false);
  const [contractType, setContractType] = useState<"emprestimo" | "financiamento">("emprestimo");
  const [selectedLoan, setSelectedLoan] = useState<string>("");
  const [selectedFinancing, setSelectedFinancing] = useState<string>("");
  const [formData, setFormData] = useState({
    amount: "",
    paymentDate: "",
    method: "dinheiro" as const,
    notes: ""
  });

  const { data: payments, isLoading: paymentsLoading } = trpc.payments.list.useQuery();
  const { data: loans } = trpc.loans.list.useQuery();
  const { data: financings } = trpc.vehicleFinancings.list.useQuery();
  
  const createPaymentMutation = trpc.payments.create.useMutation();
  const utils = trpc.useUtils();

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR');
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (contractType === "emprestimo" && !selectedLoan) {
      toast.error("Selecione um empréstimo");
      return;
    }

    if (contractType === "financiamento" && !selectedFinancing) {
      toast.error("Selecione um financiamento");
      return;
    }

    try {
      if (contractType === "emprestimo") {
        await createPaymentMutation.mutateAsync({
          loanId: parseInt(selectedLoan),
          installmentNumber: 1,
          amount: formData.amount,
          paymentDate: formData.paymentDate,
          dueDate: formData.paymentDate,
          status: "pago",
          notes: formData.notes
        });
        toast.success("Pagamento de empréstimo registrado com sucesso!");
      } else {
        toast.info("Pagamento de financiamento será registrado em breve");
      }

      setOpenCreate(false);
      setFormData({
        amount: "",
        paymentDate: "",
        method: "dinheiro",
        notes: ""
      });
      setSelectedLoan("");
      setSelectedFinancing("");
      utils.payments.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar pagamento");
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      dinheiro: "Dinheiro",
      cartao: "Cartão",
      transferencia: "Transferência",
      cheque: "Cheque",
      pix: "PIX"
    };
    return methods[method] || method;
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'dinheiro': return 'bg-green-100 text-green-800';
      case 'cartao': return 'bg-blue-100 text-blue-800';
      case 'transferencia': return 'bg-purple-100 text-purple-800';
      case 'cheque': return 'bg-yellow-100 text-yellow-800';
      case 'pix': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1>
            <p className="text-muted-foreground mt-2">
              Registre pagamentos de empréstimos e financiamentos
            </p>
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Pagamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Registrar Novo Pagamento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreatePayment} className="space-y-4">
                <div>
                  <Label htmlFor="contractType">Tipo de Contrato *</Label>
                  <Select value={contractType} onValueChange={(value: any) => {
                    setContractType(value);
                    setSelectedLoan("");
                    setSelectedFinancing("");
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emprestimo">Empréstimo</SelectItem>
                      <SelectItem value="financiamento">Financiamento de Veículo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {contractType === "emprestimo" ? (
                  <div>
                    <Label htmlFor="loanId">Selecione o Empréstimo *</Label>
                    <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar empréstimo" />
                      </SelectTrigger>
                      <SelectContent>
                        {loans?.filter(l => l.status === 'ativo').map((loan) => (
                          <SelectItem key={loan.id} value={loan.id.toString()}>
                            Cliente #{loan.clientId} - {formatCurrency(loan.amount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="financingId">Selecione o Financiamento *</Label>
                    <Select value={selectedFinancing} onValueChange={setSelectedFinancing}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar financiamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {financings?.filter(f => f.status === 'ativo').map((financing) => (
                          <SelectItem key={financing.id} value={financing.id.toString()}>
                            Cliente #{financing.clientId} - {formatCurrency(financing.financedAmount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Valor do Pagamento *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="paymentDate">Data do Pagamento *</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={formData.paymentDate}
                      onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Observações adicionais (opcional)"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createPaymentMutation.isPending}>
                    {createPaymentMutation.isPending ? "Salvando..." : "Registrar Pagamento"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="historico" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="historico">Histórico de Pagamentos</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="historico" className="space-y-4">
            {paymentsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Carregando pagamentos...</p>
              </div>
            ) : payments && payments.length > 0 ? (
              <div className="space-y-4">
                {payments.map((payment) => (
                  <Card key={payment.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <CreditCard className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold">Pagamento #{payment.id}</p>
                            <p className="text-sm text-muted-foreground">
                              Empréstimo #{payment.loanId} • {formatDate(payment.paymentDate)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{formatCurrency(payment.amount)}</p>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                            Pagamento
                          </span>
                        </div>
                      </div>
                      {payment.notes && (
                        <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                          {payment.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum pagamento registrado</p>
                  <Button className="mt-4" onClick={() => setOpenCreate(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Registrar Primeiro Pagamento
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="resumo" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total de Pagamentos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {payments?.length || 0} pagamentos registrados
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Pagamentos Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {payments?.filter(p => p.status === 'pendente').length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Pagamentos aguardando processamento
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Média por Pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      payments && payments.length > 0
                        ? (payments.reduce((sum, p) => sum + parseFloat(p.amount), 0) / payments.length)
                        : 0
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Valor médio de cada pagamento
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
