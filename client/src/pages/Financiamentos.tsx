import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Plus, ClipboardList, Edit, Trash2, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyFinancingForm = () => ({
  clientId: "", vehicleId: "", vehiclePrice: "", downPayment: "", financedAmount: "",
  totalAmount: "", interestRate: "", installments: "", installmentAmount: "",
  status: "ativo" as const, startDate: "", endDate: "", notes: "",
});

const dateAtNoon = (date: string) => new Date(`${date}T12:00:00`).toISOString();

export default function Financiamentos() {
  const { user } = useAuth();
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [selectedFinancing, setSelectedFinancing] = useState<any>(null);
  const [formData, setFormData] = useState(emptyFinancingForm);

  const { data: financings, isLoading } = trpc.vehicleFinancings.list.useQuery();
  const { data: clients } = trpc.clients.list.useQuery();
  const { data: vehicles } = trpc.vehicles.list.useQuery();
  const createMutation = trpc.vehicleFinancings.create.useMutation();
  const updateMutation = trpc.vehicleFinancings.update.useMutation();
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientId = Number(formData.clientId);
    const vehicleId = Number(formData.vehicleId);
    const installments = Number(formData.installments);
    const amounts = {
      vehiclePrice: Number(formData.vehiclePrice),
      downPayment: Number(formData.downPayment),
      financedAmount: Number(formData.financedAmount),
      totalAmount: Number(formData.totalAmount),
      interestRate: Number(formData.interestRate),
      installmentAmount: Number(formData.installmentAmount),
    };
    if (!Number.isInteger(clientId) || clientId <= 0) { toast.error("Selecione um cliente."); return; }
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) { toast.error("Selecione um veículo."); return; }
    if (!Number.isInteger(installments) || installments <= 0) { toast.error("Informe um número válido de parcelas."); return; }
    if (!Number.isFinite(amounts.vehiclePrice) || amounts.vehiclePrice <= 0 ||
        !Number.isFinite(amounts.financedAmount) || amounts.financedAmount <= 0 ||
        !Number.isFinite(amounts.totalAmount) || amounts.totalAmount <= 0 ||
        !Number.isFinite(amounts.installmentAmount) || amounts.installmentAmount <= 0 ||
        !Number.isFinite(amounts.downPayment) || amounts.downPayment < 0 ||
        !Number.isFinite(amounts.interestRate) || amounts.interestRate < 0) {
      toast.error("Preencha os valores financeiros com números válidos."); return;
    }
    if (amounts.downPayment > amounts.vehiclePrice) { toast.error("A entrada não pode ser maior que o preço do veículo."); return; }
    if (amounts.totalAmount < amounts.financedAmount) { toast.error("O total não pode ser menor que o valor financiado."); return; }
    if (!formData.startDate || !formData.endDate) { toast.error("Informe as datas inicial e final."); return; }
    if (new Date(formData.endDate) < new Date(formData.startDate)) { toast.error("A data final deve ser posterior à data inicial."); return; }
    try {
      await createMutation.mutateAsync({
        clientId,
        vehicleId,
        vehiclePrice: amounts.vehiclePrice.toFixed(2),
        downPayment: amounts.downPayment.toFixed(2),
        financedAmount: amounts.financedAmount.toFixed(2),
        totalAmount: amounts.totalAmount.toFixed(2),
        interestRate: amounts.interestRate.toFixed(2),
        installments,
        installmentAmount: amounts.installmentAmount.toFixed(2),
        startDate: dateAtNoon(formData.startDate),
        endDate: dateAtNoon(formData.endDate),
        notes: formData.notes.trim() || undefined,
      });
      toast.success("Financiamento criado com sucesso!");
      setOpenCreate(false);
      setFormData(emptyFinancingForm());
      await utils.vehicleFinancings.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar financiamento");
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinancing) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedFinancing.id,
        status: formData.status,
        notes: formData.notes
      });
      toast.success("Financiamento atualizado com sucesso!");
      setOpenEdit(false);
      setSelectedFinancing(null);
      utils.vehicleFinancings.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar financiamento");
    }
  };

  const handleDelete = async (id: number) => {
    toast.info("Exclusão de financiamentos não permitida para manter histórico");
  };

  const openEditDialog = (financing: any) => {
    setSelectedFinancing(financing);
    setFormData({
      clientId: financing.clientId.toString(),
      vehicleId: financing.vehicleId.toString(),
      vehiclePrice: financing.vehiclePrice,
      downPayment: financing.downPayment,
      financedAmount: financing.financedAmount,
      totalAmount: financing.totalAmount,
      interestRate: financing.interestRate,
      installments: financing.installments.toString(),
      installmentAmount: financing.installmentAmount,
      status: financing.status,
      startDate: new Date(financing.startDate).toISOString().split('T')[0],
      endDate: new Date(financing.endDate).toISOString().split('T')[0],
      notes: financing.notes || ""
    });
    setOpenEdit(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800';
      case 'pago': return 'bg-blue-100 text-blue-800';
      case 'atrasado': return 'bg-red-100 text-red-800';
      case 'cancelado': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financiamentos de Veículos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie financiamentos de veículos com cálculos automáticos
            </p>
          </div>
          {user?.canInsert ? <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Financiamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Financiamento de Veículo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="clientId">Cliente *</Label>
                    <Select value={formData.clientId} onValueChange={(value) => setFormData({ ...formData, clientId: value })}>
                      <SelectTrigger id="clientId">
                        <SelectValue placeholder="Selecionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id.toString()}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="vehicleId">Veículo *</Label>
                    <Select value={formData.vehicleId} onValueChange={(value) => setFormData({ ...formData, vehicleId: value })}>
                      <SelectTrigger id="vehicleId">
                        <SelectValue placeholder="Selecionar veículo" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles?.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.brand} {vehicle.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="vehiclePrice">Preço do Veículo *</Label>
                    <Input
                      id="vehiclePrice"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.vehiclePrice}
                      onChange={(e) => setFormData({ ...formData, vehiclePrice: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="downPayment">Entrada *</Label>
                    <Input
                      id="downPayment"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.downPayment}
                      onChange={(e) => setFormData({ ...formData, downPayment: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="financedAmount">Valor Financiado *</Label>
                    <Input
                      id="financedAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.financedAmount}
                      onChange={(e) => setFormData({ ...formData, financedAmount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="totalAmount">Valor Total (com juros) *</Label>
                    <Input
                      id="totalAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.totalAmount}
                      onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="interestRate">Taxa de Juros (%) *</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.interestRate}
                      onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="installments">Número de Parcelas *</Label>
                    <Input
                      id="installments"
                      type="number"
                      min="1"
                      value={formData.installments}
                      onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="installmentAmount">Valor da Parcela *</Label>
                    <Input
                      id="installmentAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={formData.installmentAmount}
                      onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status *</Label>
                    <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="atrasado">Atrasado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="startDate">Data de Início *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Data de Término *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Salvando..." : "Criar Financiamento"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog> : null}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando financiamentos...</p>
          </div>
        ) : financings && financings.length > 0 ? (
          <div className="space-y-4">
            {financings.map((financing) => (
              <Card key={financing.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">Financiamento #{financing.id}</CardTitle>
                        <p className="text-sm text-muted-foreground">Cliente: {financing.clientId} | Veículo: {financing.vehicleId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(financing.status)}`}>
                        {financing.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(financing)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(financing.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Preço do Veículo</p>
                      <p className="font-semibold">{formatCurrency(financing.vehiclePrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entrada</p>
                      <p className="font-semibold">{formatCurrency(financing.downPayment)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor Financiado</p>
                      <p className="font-semibold">{formatCurrency(financing.financedAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Taxa de Juros</p>
                      <p className="font-semibold">{financing.interestRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parcelas</p>
                      <p className="font-semibold">{financing.installments}x de {formatCurrency(financing.installmentAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Início</p>
                      <p className="font-semibold">{formatDate(financing.startDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Término</p>
                      <p className="font-semibold">{formatDate(financing.endDate)}</p>
                    </div>
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum financiamento cadastrado</p>
              {user?.canInsert ? <Button className="mt-4" onClick={() => setOpenCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Financiamento
              </Button> : null}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Financiamento #{selectedFinancing?.id}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="vehiclePrice">Preço do Veículo *</Label>
                <Input
                  id="vehiclePrice"
                  type="number"
                  step="0.01"
                  value={formData.vehiclePrice}
                  onChange={(e) => setFormData({ ...formData, vehiclePrice: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="downPayment">Entrada *</Label>
                <Input
                  id="downPayment"
                  type="number"
                  step="0.01"
                  value={formData.downPayment}
                  onChange={(e) => setFormData({ ...formData, downPayment: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="financedAmount">Valor Financiado *</Label>
                <Input
                  id="financedAmount"
                  type="number"
                  step="0.01"
                  value={formData.financedAmount}
                  onChange={(e) => setFormData({ ...formData, financedAmount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="totalAmount">Valor Total (com juros) *</Label>
                <Input
                  id="totalAmount"
                  type="number"
                  step="0.01"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="interestRate">Taxa de Juros (%) *</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  value={formData.interestRate}
                  onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="installments">Número de Parcelas *</Label>
                <Input
                  id="installments"
                  type="number"
                  value={formData.installments}
                  onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="installmentAmount">Valor da Parcela *</Label>
                <Input
                  id="installmentAmount"
                  type="number"
                  step="0.01"
                  value={formData.installmentAmount}
                  onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="status">Status *</Label>
                <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="startDate">Data de Início *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="endDate">Data de Término *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenEdit(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Salvando..." : "Atualizar Financiamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
