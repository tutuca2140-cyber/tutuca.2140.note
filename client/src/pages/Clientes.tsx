import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Trash2, Edit, Users, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const formatAddress = (value: unknown) => value && typeof value === "object" ? Object.values(value as Record<string, unknown>).filter(Boolean).join(" · ") : "Não informado";

export default function Clientes() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    email: "",
    phone: "",
    whatsapp: "",
    profession: "",
    indicatorAgentId: "",
    address: "",
    commercialAddress: "",
    city: "",
    state: "",
    zipCode: "",
    notes: ""
  });

  const { data: clients, isLoading, refetch } = trpc.clients.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery({ includeInactive: false });
  const { data: profile, isLoading: profileLoading } = trpc.clients.profile.useQuery({ id: profileId ?? 0 }, { enabled: profileId !== null });
  const createMutation = trpc.clients.create.useMutation();
  const deleteMutation = trpc.clients.delete.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        ...formData,
        indicatorAgentId: formData.indicatorAgentId ? Number(formData.indicatorAgentId) : undefined,
        residentialAddress: { logradouro: formData.address, cidade: formData.city, estado: formData.state, cep: formData.zipCode },
        commercialAddress: formData.commercialAddress ? { logradouro: formData.commercialAddress } : undefined,
      });
      toast.success("Cliente criado com sucesso!");
      setOpen(false);
      setFormData({
        name: "",
        birthDate: "",
        email: "",
        phone: "",
        whatsapp: "",
        profession: "",
        indicatorAgentId: "",
        address: "",
        commercialAddress: "",
        city: "",
        state: "",
        zipCode: "",
        notes: ""
      });
      utils.clients.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar cliente");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja deletar este cliente?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Cliente deletado com sucesso!");
      utils.clients.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar cliente");
    }
  };

  const filteredClients = clients?.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie os clientes cadastrados no sistema
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Novo Cliente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Nome Completo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthDate">Data de nascimento</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="profession">Profissão</Label>
                    <Input
                      id="profession"
                      value={formData.profession}
                      onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="indicatorAgentId">Agente indicador</Label>
                    <select id="indicatorAgentId" value={formData.indicatorAgentId} onChange={(e) => setFormData({ ...formData, indicatorAgentId: e.target.value })} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm">
                      <option value="">Nenhum agente</option>
                      {(agents ?? []).filter((agent) => agent.status === "ACTIVE").map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="commercialAddress">Endereço comercial</Label>
                    <Input
                      id="commercialAddress"
                      value={formData.commercialAddress}
                      onChange={(e) => setFormData({ ...formData, commercialAddress: e.target.value })}
                      placeholder="Rua, número e complemento"
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">Estado</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                      placeholder="SP"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Salvando..." : "Salvar Cliente"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Clients List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando clientes...</p>
          </div>
        ) : filteredClients && filteredClients.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <Card key={client.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-start justify-between">
                    <span className="truncate">{client.name}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setProfileId(client.id)} aria-label={`Abrir perfil de ${client.name}`}>
                        <Eye className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(client.id)} aria-label={`Excluir ${client.name}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {client.email && (
                    <p className="text-sm text-muted-foreground truncate">
                      <strong>E-mail:</strong> {client.email}
                    </p>
                  )}
                  {client.phone && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Telefone:</strong> {client.phone}
                    </p>
                  )}
                  {client.city && client.state && (
                    <p className="text-sm text-muted-foreground">
                      <strong>Cidade:</strong> {client.city}/{client.state}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
              </p>
              {!searchTerm && (
                <Button className="mt-4" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Primeiro Cliente
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={profileId !== null} onOpenChange={(value) => { if (!value) setProfileId(null); }}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader><DialogTitle>{profile?.client.name ?? "Perfil do cliente"}</DialogTitle></DialogHeader>
            {profileLoading ? <div className="py-10 text-center text-muted-foreground">Carregando histórico financeiro...</div> : profile ? <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Total pago</p><p className="mt-1 font-semibold">R$ {profile.financialHistory.totalPaid.toFixed(2).replace('.', ',')}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Saldo aberto</p><p className="mt-1 font-semibold text-primary">R$ {profile.financialHistory.remainingBalance.toFixed(2).replace('.', ',')}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Contratos</p><p className="mt-1 font-semibold">{profile.loans.length + profile.financings.length}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Veículos</p><p className="mt-1 font-semibold">{profile.vehicles.length}</p></div></div><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Dados pessoais</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><strong>E-mail:</strong> {profile.client.email || "Não informado"}</p><p><strong>Telefone/WhatsApp:</strong> {profile.client.phone || "Não informado"} {profile.client.whatsapp ? `· ${profile.client.whatsapp}` : ""}</p><p><strong>Nascimento:</strong> {profile.client.birthDate ? new Date(profile.client.birthDate).toLocaleDateString("pt-BR") : "Não informado"}</p><p><strong>Profissão:</strong> {profile.client.profession || "Não informado"}</p><p><strong>Agente indicador:</strong> {profile.client.indicatorAgentId ? `#${profile.client.indicatorAgentId}` : "Não informado"}</p><p><strong>Endereço residencial:</strong> {formatAddress(profile.client.residentialAddress) !== "Não informado" ? formatAddress(profile.client.residentialAddress) : ([profile.client.address, profile.client.city, profile.client.state].filter(Boolean).join(" · ") || "Não informado")}</p><p><strong>Endereço comercial:</strong> {formatAddress(profile.client.commercialAddress)}</p></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Histórico financeiro</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><strong>Pagamentos:</strong> {profile.financialHistory.paymentCount}</p><p><strong>Principal amortizado:</strong> R$ {profile.financialHistory.totalPrincipal.toFixed(2).replace('.', ',')}</p><p><strong>Juros pagos:</strong> R$ {profile.financialHistory.totalInterest.toFixed(2).replace('.', ',')}</p><p><strong>Comissões:</strong> R$ {profile.financialHistory.totalCommissions.toFixed(2).replace('.', ',')}</p></CardContent></Card></div><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Empréstimos ({profile.loans.length})</CardTitle></CardHeader><CardContent>{profile.loans.length ? <div className="space-y-2 text-sm">{profile.loans.map((loan) => <div key={loan.id} className="flex items-center justify-between rounded-lg border p-3"><span>#{loan.id} · {loan.installments} parcelas</span><span className="font-semibold">R$ {Number(loan.remainingBalance).toFixed(2).replace('.', ',')}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum empréstimo vinculado.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Veículos ({profile.vehicles.length})</CardTitle></CardHeader><CardContent>{profile.vehicles.length ? <div className="space-y-2 text-sm">{profile.vehicles.map((vehicle) => <div key={vehicle.id} className="flex items-center justify-between rounded-lg border p-3"><span>{vehicle.brand} {vehicle.model}</span><span className="text-muted-foreground">{vehicle.plate || vehicle.status}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum veículo vinculado.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Financiamentos ({profile.financings.length})</CardTitle></CardHeader><CardContent>{profile.financings.length ? <div className="space-y-2 text-sm">{profile.financings.map((financing) => <div key={financing.id} className="flex items-center justify-between rounded-lg border p-3"><span>#{financing.id} · {financing.installments} parcelas</span><span className="font-semibold">R$ {Number(financing.totalAmount || financing.financedAmount || 0).toFixed(2).replace('.', ',')}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum financiamento vinculado.</p>}</CardContent></Card></div><div className="grid gap-4"><Card><CardHeader><CardTitle className="text-base">Histórico de pagamentos ({profile.payments.length})</CardTitle></CardHeader><CardContent>{profile.payments.length ? <div className="space-y-2">{profile.payments.map((payment) => <div key={payment.id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-5"><span>{new Date(payment.paymentDate).toLocaleDateString('pt-BR')}</span><span className="font-semibold">R$ {Number(payment.amount || 0).toFixed(2).replace('.', ',')}</span><span>Principal: R$ {Number(payment.principalAmount || 0).toFixed(2).replace('.', ',')}</span><span>Juros: R$ {Number(payment.interestAmount || 0).toFixed(2).replace('.', ',')}</span><span>Comissão: R$ {Number(payment.commissionAmount || 0).toFixed(2).replace('.', ',')}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum pagamento registrado para este cliente.</p>}</CardContent></Card></div></div> : <p className="py-10 text-center text-muted-foreground">Perfil não encontrado.</p>}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
