import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Eye, Percent, Plus, UserRound, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const money = (value: string | number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const date = (value: string | Date) => new Date(value).toLocaleDateString("pt-BR");
const percentageNumber = (value: string) => Number(value.trim().replace(",", "."));

export default function Agentes() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [percentage, setPercentage] = useState("0");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPercentage, setEditPercentage] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const agentsQuery = trpc.agents.list.useQuery({ includeInactive: true });
  const historyQuery = trpc.agents.history.useQuery(
    { agentId: selectedAgentId ?? 0 },
    { enabled: selectedAgentId !== null },
  );
  const createMutation = trpc.agents.create.useMutation();
  const updateMutation = trpc.agents.update.useMutation();
  const deactivateMutation = trpc.agents.deactivate.useMutation();
  const utils = trpc.useUtils();

  const refresh = async () => {
    await Promise.all([
      utils.agents.list.invalidate(),
      utils.agents.history.invalidate(),
      utils.dashboard.agentPerformance.invalidate(),
    ]);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedPercentage = percentageNumber(percentage);
    if (!normalizedName) { toast.error("Informe o nome do agente."); return; }
    if (!Number.isFinite(normalizedPercentage) || normalizedPercentage < 0 || normalizedPercentage > 100) {
      toast.error("Informe uma comissão entre 0 e 100%."); return;
    }
    try {
      await createMutation.mutateAsync({ name: normalizedName, defaultCommissionPercentage: normalizedPercentage });
      toast.success("Agente criado com sucesso.");
      setName("");
      setPercentage("0");
      setShowCreate(false);
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Não foi possível criar o agente.");
    }
  };

  const beginEdit = (agent: NonNullable<typeof agentsQuery.data>[number]) => {
    setEditingId(agent.id);
    setEditName(agent.name);
    setEditPercentage(String(agent.defaultCommissionPercentage || 0));
  };

  const handleUpdate = async (id: number) => {
    const normalizedName = editName.trim();
    const normalizedPercentage = percentageNumber(editPercentage);
    if (!normalizedName) { toast.error("Informe o nome do agente."); return; }
    if (!Number.isFinite(normalizedPercentage) || normalizedPercentage < 0 || normalizedPercentage > 100) {
      toast.error("Informe uma comissão entre 0 e 100%."); return;
    }
    try {
      await updateMutation.mutateAsync({ id, name: normalizedName, defaultCommissionPercentage: normalizedPercentage });
      toast.success("Agente atualizado. O histórico anterior foi preservado.");
      setEditingId(null);
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Não foi possível atualizar o agente.");
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!window.confirm("Desativar este agente? Ele continuará visível no histórico, mas não poderá ser usado em novos pagamentos.")) return;
    try {
      await deactivateMutation.mutateAsync({ id });
      toast.success("Agente desativado. O histórico foi preservado.");
      await refresh();
    } catch (error: any) {
      toast.error(error.message || "Não foi possível desativar o agente.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Comissões</p>
            <h1 className="text-3xl font-bold tracking-tight">Agentes Comissionados</h1>
            <p className="mt-2 text-muted-foreground">Gerencie agentes, percentuais padrão e histórico financeiro por banco ativo.</p>
          </div>
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus className="mr-2 h-4 w-4" /> Novo agente
          </Button>
        </div>

        {showCreate && (
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader><CardTitle className="text-lg">Cadastrar agente</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <div className="space-y-2"><Label htmlFor="agent-name">Nome</Label><Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do agente" required /></div>
                <div className="space-y-2"><Label htmlFor="agent-percentage">Comissão padrão (%)</Label><Input id="agent-percentage" type="number" min="0" max="100" step="0.01" value={percentage} onChange={(event) => setPercentage(event.target.value)} required /></div>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Salvando..." : "Salvar agente"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {agentsQuery.isLoading ? <p className="py-10 text-center text-muted-foreground">Carregando agentes...</p> : (
          <div className="grid gap-4 xl:grid-cols-2">
            {(agentsQuery.data ?? []).map((agent) => (
              <Card key={agent.id} className={agent.status === "INACTIVE" ? "opacity-75" : ""}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-3 text-primary"><UserRound className="h-5 w-5" /></div><div><CardTitle className="text-lg">{agent.name}</CardTitle><p className="text-sm text-muted-foreground">Criado em {date(agent.createdAt)}</p></div></div>
                  <Badge variant={agent.status === "ACTIVE" ? "default" : "outline"}>{agent.status === "ACTIVE" ? "Ativo" : "Inativo"}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingId === agent.id ? (
                    <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto_auto] sm:items-end">
                      <div className="space-y-2"><Label>Nome</Label><Input value={editName} onChange={(event) => setEditName(event.target.value)} /></div>
                      <div className="space-y-2"><Label>Comissão (%)</Label><Input type="number" min="0" max="100" step="0.01" value={editPercentage} onChange={(event) => setEditPercentage(event.target.value)} /></div>
                      <Button onClick={() => handleUpdate(agent.id)} disabled={updateMutation.isPending}>Salvar</Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"><Percent className="h-4 w-4" /> {Number(agent.defaultCommissionPercentage || 0).toFixed(2)}% padrão</span>
                      {agent.status === "ACTIVE" ? <span className="inline-flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Disponível em novos pagamentos</span> : <span className="inline-flex items-center gap-2 text-sm text-amber-700"><XCircle className="h-4 w-4" /> Apenas histórico</span>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button variant="outline" size="sm" onClick={() => setSelectedAgentId(agent.id)}><Eye className="mr-2 h-4 w-4" /> Ver histórico</Button>
                    {agent.status === "ACTIVE" && <Button variant="ghost" size="sm" onClick={() => beginEdit(agent)}>Editar padrão</Button>}
                    {agent.status === "ACTIVE" && <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-800" onClick={() => handleDeactivate(agent.id)}>Desativar</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selectedAgentId !== null && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Histórico de comissões</CardTitle><Button variant="ghost" onClick={() => setSelectedAgentId(null)}>Fechar</Button></CardHeader>
            <CardContent>
              {historyQuery.isLoading ? <p className="text-muted-foreground">Carregando histórico...</p> : historyQuery.data?.payments.length ? <>
                <div className="mb-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Pagamentos</p><p className="text-xl font-bold">{historyQuery.data.totals.totalPayments}</p></div>
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Volume</p><p className="text-xl font-bold">{money(historyQuery.data.totals.totalPaymentAmount)}</p></div>
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Comissões</p><p className="text-xl font-bold text-primary">{money(historyQuery.data.totals.totalCommission)}</p></div>
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Média / pagamento</p><p className="text-xl font-bold">{money(historyQuery.data.totals.averageCommission)}</p></div>
                </div>
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Data</th><th className="p-3">Cliente</th><th className="p-3">Pagamento</th><th className="p-3">%</th><th className="p-3">Comissão</th><th className="p-3">Líquido</th></tr></thead><tbody>{historyQuery.data.payments.map((payment) => <tr key={payment.id} className="border-b last:border-0"><td className="p-3">{date(payment.paymentDate)}</td><td className="p-3">{payment.clientName || "Cliente não informado"}</td><td className="p-3">{money(payment.paymentAmount)}</td><td className="p-3">{Number(payment.commissionPercentage || 0).toFixed(2)}%</td><td className="p-3 font-medium text-primary">{money(payment.commissionAmount)}</td><td className="p-3">{money(payment.netAmount)}</td></tr>)}</tbody></table></div>
              </> : <p className="py-6 text-center text-muted-foreground">Nenhum pagamento comissionado encontrado.</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
