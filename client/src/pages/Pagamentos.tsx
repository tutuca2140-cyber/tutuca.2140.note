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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { loanContractName } from "@/lib/contract-name";
import {
  ClipboardList,
  CreditCard,
  Download,
  FilePenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);
const formatCurrency = (value: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0)
  );
const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("pt-BR");
const dateInput = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);

type PaymentRow = {
  id: number;
  amount: string;
  paymentDate: Date | string;
  dueDate: Date | string;
  status: "pago" | "pendente" | "atrasado";
  notes: string | null;
  loanId: number | null;
  vehicleFinancingId: number | null;
  installmentNumber: number;
  interestAmount: string;
  principalAmount: string;
  commissionAmount: string;
  commissionPercentage: string;
  netAmount: string;
};

export default function Pagamentos() {
  const { user } = useAuth();
  const shortcut = new URLSearchParams(window.location.search);
  const shortcutType =
    shortcut.get("tipo") === "financiamento" ? "financiamento" : "emprestimo";
  const shortcutContractId = shortcut.get("contrato") || "";
  const [openCreate, setOpenCreate] = useState(
    () => shortcut.get("novo") === "1"
  );
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [contractType, setContractType] = useState<
    "emprestimo" | "financiamento"
  >(shortcutType);
  const [selectedLoan, setSelectedLoan] = useState(
    shortcutType === "emprestimo" ? shortcutContractId : ""
  );
  const [selectedFinancing, setSelectedFinancing] = useState(
    shortcutType === "financiamento" ? shortcutContractId : ""
  );
  const [selectedAgent, setSelectedAgent] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [formData, setFormData] = useState({
    amount: "",
    installmentNumber: shortcut.get("parcela") || "1",
    paymentDate: today(),
    notes: "",
  });
  const [editData, setEditData] = useState({
    amount: "",
    status: "pago" as "pago" | "pendente" | "atrasado",
    paymentDate: today(),
    dueDate: today(),
    notes: "",
  });

  const { data: payments, isLoading: paymentsLoading } =
    trpc.payments.list.useQuery();
  const { data: loans } = trpc.loans.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: financings } = trpc.vehicleFinancings.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery({
    includeInactive: false,
  });
  const createPaymentMutation = trpc.payments.create.useMutation();
  const updatePaymentMutation = trpc.payments.update.useMutation();
  const deletePaymentMutation = trpc.payments.delete.useMutation();
  const utils = trpc.useUtils();
  const selectedFinancingData = financings?.find(
    financing => financing.id === Number(selectedFinancing)
  );
  const selectedLoanData = loans?.find(
    loan => loan.id === Number(selectedLoan)
  );
  const selectedContract =
    contractType === "emprestimo" ? selectedLoanData : selectedFinancingData;
  const selectedClient = clients?.find(
    client => client.id === selectedContract?.clientId
  );
  const financingExtra = selectedFinancingData
    ? Math.max(
        0,
        Number(formData.amount || 0) -
          Number(selectedFinancingData.installmentAmount)
      )
    : 0;

  const paymentIdentity = (payment: PaymentRow) => {
    const contract = payment.loanId
      ? loans?.find(item => item.id === payment.loanId)
      : financings?.find(item => item.id === payment.vehicleFinancingId);
    const client = clients?.find(item => item.id === contract?.clientId);
    return {
      clientName: client?.name || `Cliente #${contract?.clientId || "—"}`,
      contractLabel: payment.loanId
        ? `Empréstimo #${payment.loanId}`
        : `Financiamento #${payment.vehicleFinancingId}`,
      whatsapp: client?.whatsapp || client?.phone || "",
    };
  };

  const downloadReceipt = (payment: PaymentRow) => {
    const identity = paymentIdentity(payment);
    const document = new jsPDF();
    document.setFillColor(37, 99, 235);
    document.rect(0, 0, 210, 38, "F");
    document.setTextColor(255, 255, 255);
    document.setFontSize(22);
    document.setFont("helvetica", "bold");
    document.text("NOTE NOTE", 18, 18);
    document.setFontSize(11);
    document.setFont("helvetica", "normal");
    document.text("Seu caderninho digital", 18, 27);
    document.setTextColor(15, 23, 42);
    document.setFontSize(18);
    document.setFont("helvetica", "bold");
    document.text("Comprovante de pagamento", 18, 57);
    document.setFontSize(10);
    document.setFont("helvetica", "normal");
    document.setTextColor(100, 116, 139);
    document.text(`Comprovante nº ${payment.id}`, 18, 66);
    const fields = [
      ["Cliente", identity.clientName],
      ["Contrato", identity.contractLabel],
      ["Parcela", `${payment.installmentNumber}`],
      ["Data do pagamento", formatDate(payment.paymentDate)],
      ["Valor recebido", formatCurrency(payment.amount)],
      ["Situação", payment.status.toUpperCase()],
    ];
    let y = 84;
    fields.forEach(([label, value]) => {
      document.setTextColor(100, 116, 139);
      document.setFont("helvetica", "normal");
      document.text(label, 18, y);
      document.setTextColor(15, 23, 42);
      document.setFont("helvetica", "bold");
      document.text(String(value), 72, y);
      y += 13;
    });
    if (payment.notes) {
      document.setTextColor(100, 116, 139);
      document.setFont("helvetica", "normal");
      document.text("Observações", 18, y + 3);
      document.setTextColor(15, 23, 42);
      document.text(document.splitTextToSize(payment.notes, 115), 72, y + 3);
    }
    document.setDrawColor(203, 213, 225);
    document.line(18, 178, 192, 178);
    document.setFontSize(9);
    document.setTextColor(100, 116, 139);
    document.text("Pagamento registrado no sistema Note Note.", 18, 188);
    document.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 18, 195);
    document.save(
      `comprovante-${payment.id}-${identity.clientName.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`
    );
  };

  useEffect(() => {
    if (!openCreate || formData.amount || !selectedContract) return;
    setFormData(current => ({
      ...current,
      amount: String(selectedContract.installmentAmount),
    }));
  }, [formData.amount, openCreate, selectedContract]);

  const invalidateFinance = async () => {
    await Promise.all([
      utils.payments.list.invalidate(),
      utils.loans.list.invalidate(),
      utils.vehicleFinancings.list.invalidate(),
      utils.cashFlow.list.invalidate(),
      utils.dashboard.stats.invalidate(),
      utils.dashboard.agentPerformance.invalidate(),
    ]);
  };

  const handleCreatePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (contractType === "emprestimo" && !selectedLoan) {
      toast.error("Selecione um empréstimo.");
      return;
    }
    if (contractType === "financiamento" && !selectedFinancing) {
      toast.error("Selecione um financiamento.");
      return;
    }
    const percentage =
      commissionPercentage === "" ? undefined : Number(commissionPercentage);
    if (
      percentage !== undefined &&
      (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)
    ) {
      toast.error("A comissão deve estar entre 0% e 100%.");
      return;
    }
    try {
      await createPaymentMutation.mutateAsync({
        loanId:
          contractType === "emprestimo" ? Number(selectedLoan) : undefined,
        vehicleFinancingId:
          contractType === "financiamento"
            ? Number(selectedFinancing)
            : undefined,
        installmentNumber: Number(formData.installmentNumber),
        amount: formData.amount,
        paymentDate: new Date(`${formData.paymentDate}T12:00:00`).toISOString(),
        dueDate: new Date(`${formData.paymentDate}T12:00:00`).toISOString(),
        status: "pago",
        notes: formData.notes,
        agentId: selectedAgent ? Number(selectedAgent) : undefined,
        commissionPercentage: percentage,
      });
      await invalidateFinance();
      toast.success(
        "Pagamento lançado com sucesso. A entrada integral foi registrada no caixa."
      );
      setOpenCreate(false);
      setFormData({
        amount: "",
        installmentNumber: "1",
        paymentDate: today(),
        notes: "",
      });
      setSelectedLoan("");
      setSelectedFinancing("");
      setSelectedAgent("");
      setCommissionPercentage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao registrar pagamento."
      );
    }
  };

  const openEdit = (payment: PaymentRow) => {
    setEditingPayment(payment);
    setEditData({
      amount: String(payment.amount),
      status: payment.status,
      paymentDate: dateInput(payment.paymentDate),
      dueDate: dateInput(payment.dueDate),
      notes: payment.notes ?? "",
    });
  };
  const handleEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPayment) return;
    try {
      await updatePaymentMutation.mutateAsync({
        id: editingPayment.id,
        amount: editData.amount,
        status: editData.status,
        paymentDate: new Date(`${editData.paymentDate}T12:00:00`).toISOString(),
        dueDate: new Date(`${editData.dueDate}T12:00:00`).toISOString(),
        notes: editData.notes,
      });
      await invalidateFinance();
      toast.success("Pagamento editado e caixa reconciliado.");
      setEditingPayment(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível editar o pagamento."
      );
    }
  };
  const handleDelete = async (paymentId: number) => {
    if (
      !window.confirm(
        "Tem certeza que deseja excluir este pagamento? A entrada correspondente será revertida e o saldo recalculado."
      )
    )
      return;
    try {
      await deletePaymentMutation.mutateAsync({ id: paymentId });
      await invalidateFinance();
      toast.success("Pagamento excluído; caixa e saldo foram recalculados.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o pagamento."
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1>
            <p className="mt-2 text-muted-foreground">
              Registre recebimentos e mantenha o caixa sincronizado com os
              contratos.
            </p>
          </div>
          {user?.canInsert && (
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo pagamento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Registrar novo pagamento</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreatePayment} className="space-y-4">
                  <div>
                    <Label>Tipo de contrato</Label>
                    <Select
                      value={contractType}
                      onValueChange={(
                        value: "emprestimo" | "financiamento"
                      ) => {
                        setContractType(value);
                        setSelectedLoan("");
                        setSelectedFinancing("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emprestimo">Empréstimo</SelectItem>
                        <SelectItem value="financiamento">
                          Financiamento de veículo ou produto
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {contractType === "emprestimo" ? (
                    <div>
                      <Label>Empréstimo *</Label>
                      <Select
                        value={selectedLoan}
                        onValueChange={value => {
                          setSelectedLoan(value);
                          const loan = loans?.find(
                            item => item.id === Number(value)
                          );
                          if (loan) {
                            setFormData(current => ({
                              ...current,
                              amount: String(loan.installmentAmount),
                            }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar empréstimo" />
                        </SelectTrigger>
                        <SelectContent>
                          {loans
                            ?.filter(loan => loan.status === "ativo")
                            .map(loan => (
                              <SelectItem key={loan.id} value={String(loan.id)}>
                                {loanContractName(
                                  clients?.find(
                                    client => client.id === loan.clientId
                                  )?.name,
                                  loan.id
                                )}{" "}
                                · {formatCurrency(loan.amount)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <Label>Financiamento *</Label>
                      <Select
                        value={selectedFinancing}
                        onValueChange={value => {
                          setSelectedFinancing(value);
                          const financing = financings?.find(
                            item => item.id === Number(value)
                          );
                          if (financing) {
                            setFormData(current => ({
                              ...current,
                              amount: String(financing.installmentAmount),
                            }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar financiamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {financings
                            ?.filter(
                              financing =>
                                !["pago", "cancelado"].includes(
                                  financing.status
                                )
                            )
                            .map(financing => (
                              <SelectItem
                                key={financing.id}
                                value={String(financing.id)}
                              >
                                Contrato #{financing.id} · parcela{" "}
                                {formatCurrency(financing.installmentAmount)} ·{" "}
                                {clients?.find(
                                  client => client.id === financing.clientId
                                )?.name || `Cliente #${financing.clientId}`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedContract ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                      <p className="text-sm text-muted-foreground">
                        Pagamento selecionado
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {selectedClient?.name ||
                          `Cliente #${selectedContract.clientId}`}
                      </p>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-muted-foreground">Contrato</p>
                          <p className="font-semibold">
                            {contractType === "emprestimo"
                              ? "Empréstimo"
                              : "Financiamento"}{" "}
                            #{selectedContract.id}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Parcela</p>
                          <p className="font-semibold">
                            {formData.installmentNumber} de{" "}
                            {selectedContract.installments}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            Valor previsto
                          </p>
                          <p className="font-semibold">
                            {formatCurrency(selectedContract.installmentAmount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>
                        {contractType === "financiamento"
                          ? "Cota da parcela"
                          : "Número da parcela"}{" "}
                        *
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        max={selectedFinancingData?.installments}
                        value={formData.installmentNumber}
                        onChange={event =>
                          setFormData({
                            ...formData,
                            installmentNumber: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label>Valor recebido *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={formData.amount}
                        onChange={event =>
                          setFormData({
                            ...formData,
                            amount: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label>Data do pagamento *</Label>
                      <Input
                        type="date"
                        value={formData.paymentDate}
                        onChange={event =>
                          setFormData({
                            ...formData,
                            paymentDate: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label>Notas</Label>
                      <Input
                        value={formData.notes}
                        onChange={event =>
                          setFormData({
                            ...formData,
                            notes: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  {selectedFinancingData ? (
                    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">
                          Valor da parcela
                        </p>
                        <p className="font-semibold">
                          {formatCurrency(
                            selectedFinancingData.installmentAmount
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          Amortização extra
                        </p>
                        <p className="font-semibold text-primary">
                          {formatCurrency(financingExtra)}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <Card className="border-primary/20 bg-primary/[0.03]">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Agente comissionado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Select
                        value={selectedAgent || "none"}
                        onValueChange={value => {
                          setSelectedAgent(value === "none" ? "" : value);
                          const agent = agents?.find(
                            item => item.id.toString() === value
                          );
                          setCommissionPercentage(
                            agent
                              ? String(agent.defaultCommissionPercentage || "0")
                              : ""
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem agente comissionado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Sem agente comissionado
                          </SelectItem>
                          {agents?.map(agent => (
                            <SelectItem key={agent.id} value={String(agent.id)}>
                              {agent.name} ·{" "}
                              {Number(
                                agent.defaultCommissionPercentage || 0
                              ).toFixed(2)}
                              %
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedAgent && (
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={commissionPercentage}
                          onChange={event =>
                            setCommissionPercentage(event.target.value)
                          }
                        />
                      )}
                    </CardContent>
                  </Card>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpenCreate(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createPaymentMutation.isPending}
                    >
                      {createPaymentMutation.isPending
                        ? "Salvando pagamento..."
                        : "Registrar pagamento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Dialog
          open={editingPayment !== null}
          onOpenChange={value => {
            if (!value) setEditingPayment(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar pagamento #{editingPayment?.id}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <Label>Valor</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editData.amount}
                  onChange={event =>
                    setEditData({ ...editData, amount: event.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(value: "pago" | "pendente" | "atrasado") =>
                    setEditData({ ...editData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Data do pagamento</Label>
                  <Input
                    type="date"
                    value={editData.paymentDate}
                    onChange={event =>
                      setEditData({
                        ...editData,
                        paymentDate: event.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Vencimento</Label>
                  <Input
                    type="date"
                    value={editData.dueDate}
                    onChange={event =>
                      setEditData({ ...editData, dueDate: event.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Input
                  value={editData.notes}
                  onChange={event =>
                    setEditData({ ...editData, notes: event.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingPayment(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updatePaymentMutation.isPending}
                >
                  {updatePaymentMutation.isPending
                    ? "Atualizando..."
                    : "Salvar edição"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="historico">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>
          <TabsContent value="historico" className="space-y-4">
            {paymentsLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                Carregando pagamentos...
              </div>
            ) : payments?.length ? (
              payments.map(payment => (
                <Card key={payment.id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-primary/10 p-3">
                          <CreditCard className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">
                            Pagamento #{payment.id}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {payment.loanId
                              ? `Empréstimo #${payment.loanId}`
                              : `Financiamento #${payment.vehicleFinancingId}`}{" "}
                            · {formatDate(payment.paymentDate)}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-bold">
                          {formatCurrency(payment.amount)}
                        </p>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                          {payment.status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Juros</p>
                        <p className="font-medium">
                          {formatCurrency(payment.interestAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amortização</p>
                        <p className="font-medium">
                          {formatCurrency(payment.principalAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Comissão</p>
                        <p className="font-medium text-primary">
                          {formatCurrency(payment.commissionAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Líquido</p>
                        <p className="font-medium">
                          {formatCurrency(payment.netAmount)}
                        </p>
                      </div>
                    </div>
                    {payment.notes && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {payment.notes}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                      {user?.canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(payment)}
                        >
                          <FilePenLine className="mr-1.5 h-4 w-4" />
                          Editar pagamento
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadReceipt(payment as PaymentRow)}
                      >
                        <Download className="mr-1.5 h-4 w-4" />
                        Baixar comprovante
                      </Button>
                      {user?.canDelete && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(payment.id)}
                          disabled={deletePaymentMutation.isPending}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Excluir pagamento
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Nenhum pagamento registrado.
                  </p>
                  {user?.canInsert && (
                    <Button
                      className="mt-4"
                      onClick={() => setOpenCreate(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Registrar primeiro pagamento
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="resumo" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Total recebido
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      payments
                        ?.filter(payment => payment.status === "pago")
                        .reduce(
                          (sum, payment) => sum + Number(payment.amount),
                          0
                        ) || 0
                    )}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Entradas efetivas no caixa
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Pagamentos pendentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {payments?.filter(payment => payment.status !== "pago")
                      .length || 0}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Média recebida
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      (payments
                        ?.filter(payment => payment.status === "pago")
                        .reduce(
                          (sum, payment) => sum + Number(payment.amount),
                          0
                        ) || 0) /
                        Math.max(
                          1,
                          payments?.filter(payment => payment.status === "pago")
                            .length || 1
                        )
                    )}
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
