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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Check,
  Copy,
  Database,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type DatabaseRecord = {
  id: number;
  name: string;
  description?: string | null;
  type: string;
  isActive: boolean;
};

export default function AdminBancos() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [adminPending, setAdminPending] = useState(false);
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerDatabases, setCustomerDatabases] = useState<any[]>([]);
  const [customerUnlocked, setCustomerUnlocked] = useState(false);
  const [editTarget, setEditTarget] = useState<DatabaseRecord | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<DatabaseRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [duplicateForm, setDuplicateForm] = useState({ name: "", description: "" });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "novo" as "novo" | "existente",
  });

  const { data: databases, isLoading } = trpc.databases.list.useQuery();
  const createMutation = trpc.databases.create.useMutation();
  const setActiveMutation = trpc.databases.setActive.useMutation();
  const deleteMutation = trpc.databases.delete.useMutation();
  const listCustomerDatabases = trpc.databases.listCustomerDatabases.useMutation();
  const enterCustomerDatabase = trpc.databases.enterCustomerDatabase.useMutation();
  const utils = trpc.useUtils();

  const refreshDatabases = async () => {
    await Promise.all([
      utils.databases.list.invalidate(),
      utils.databases.getActive.invalidate(),
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast.success("Banco de dados criado com sucesso!");
      setOpen(false);
      setFormData({ name: "", description: "", type: "novo" });
      await refreshDatabases();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar banco");
    }
  };

  const handleSetActive = async (id: number) => {
    try {
      await setActiveMutation.mutateAsync({ id });
      toast.success("Banco de dados ativado!");
      await refreshDatabases();
    } catch (error: any) {
      toast.error(error.message || "Erro ao ativar banco");
    }
  };

  const handleDelete = async (database: { id: number; name: string }) => {
    if (
      !window.confirm(
        `Excluir definitivamente o banco “${database.name}” e todos os dados vinculados? Esta ação não pode ser desfeita.`
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync({ id: database.id });
      await refreshDatabases();
      toast.success("Banco e todos os dados vinculados foram excluídos.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o banco."
      );
    }
  };

  const runDatabaseAdmin = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/database-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || "Não foi possível concluir a operação.");
    }
    return data;
  };

  const openEdit = (database: DatabaseRecord) => {
    setEditTarget(database);
    setEditForm({
      name: database.name,
      description: database.description || "",
    });
    setEditOpen(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setAdminPending(true);
    try {
      await runDatabaseAdmin({
        action: "update",
        databaseId: editTarget.id,
        name: editForm.name,
        description: editForm.description,
      });
      await refreshDatabases();
      setEditOpen(false);
      toast.success("Banco atualizado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao editar banco.");
    } finally {
      setAdminPending(false);
    }
  };

  const openDuplicate = (database: DatabaseRecord) => {
    setDuplicateTarget(database);
    setDuplicateForm({
      name: `${database.name} - Cópia`,
      description: database.description || `Cópia completa de ${database.name}`,
    });
    setDuplicateOpen(true);
  };

  const duplicateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTarget) return;
    setAdminPending(true);
    try {
      const result = await runDatabaseAdmin({
        action: "duplicate",
        databaseId: duplicateTarget.id,
        name: duplicateForm.name,
        description: duplicateForm.description,
      });
      await refreshDatabases();
      setDuplicateOpen(false);
      const copied = result?.counts
        ? Object.values(result.counts).reduce(
            (total: number, value) => total + Number(value || 0),
            0
          )
        : 0;
      toast.success(
        copied
          ? `Banco duplicado com ${copied} registros vinculados.`
          : "Banco duplicado com sucesso."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao duplicar banco."
      );
    } finally {
      setAdminPending(false);
    }
  };

  const unlockCustomerDatabases = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rows = await listCustomerDatabases.mutateAsync({ password: customerPassword });
      setCustomerDatabases(rows);
      setCustomerUnlocked(true);
      toast.success("Área protegida liberada.");
    } catch (error) {
      setCustomerUnlocked(false);
      toast.error(error instanceof Error ? error.message : "Não foi possível liberar os bancos de clientes.");
    }
  };

  const openCustomerDatabase = async (databaseId: number) => {
    if (!customerPassword) {
      toast.error("Digite novamente a senha do Super Admin.");
      return;
    }
    try {
      await enterCustomerDatabase.mutateAsync({ id: databaseId, password: customerPassword });
      await refreshDatabases();
      toast.success("Banco do cliente liberado para esta sessão administrativa.");
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível acessar o banco do cliente.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bancos de Dados</h1>
            <p className="mt-2 text-muted-foreground">
              Edite, duplique, ative e administre seus bancos de dados isolados.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Banco
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Banco de Dados</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: "novo" | "existente") =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo (Vazio)</SelectItem>
                      <SelectItem value="existente">Existente</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Para copiar dados, use o botão Duplicar no banco desejado.
                  </p>
                </div>
                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={e =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Banco"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {user?.role === "super_admin" && (
          <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Bancos de Clientes — Área Protegida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Os bancos pertencentes a usuários que contrataram o Note Note não aparecem em “Banco em operação”. Para consultar um deles, confirme a senha do Super Admin nesta área específica.
              </p>
              {!customerUnlocked ? (
                <form onSubmit={unlockCustomerDatabases} className="flex flex-col gap-2 sm:flex-row">
                  <Input type="password" value={customerPassword} onChange={e => setCustomerPassword(e.target.value)} placeholder="Senha do Super Admin" autoComplete="current-password" required />
                  <Button type="submit" disabled={listCustomerDatabases.isPending}>{listCustomerDatabases.isPending ? "Verificando..." : "Liberar área protegida"}</Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Área liberada nesta tela.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCustomerUnlocked(false); setCustomerDatabases([]); setCustomerPassword(""); }}>Bloquear novamente</Button>
                  </div>
                  {customerDatabases.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {customerDatabases.map((db: any) => (
                        <div key={db.id} className="rounded-xl border bg-background p-4">
                          <p className="font-semibold">{db.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Cliente: {db.ownerName || db.ownerUsername || db.ownerEmail || "Conta comercial"}</p>
                          <p className="text-xs text-muted-foreground">{db.ownerEmail || "E-mail não informado"}</p>
                          <Button className="mt-3 w-full" size="sm" onClick={() => openCustomerDatabase(db.id)} disabled={enterCustomerDatabase.isPending}>Acessar com senha do Super Admin</Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Nenhum banco de cliente comercial encontrado.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="mt-4 text-muted-foreground">Carregando bancos...</p>
          </div>
        ) : databases && databases.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {databases.map(db => (
              <Card
                key={db.id}
                className={db.isActive ? "border-2 border-primary" : ""}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3 text-lg">
                    <span className="truncate">{db.name}</span>
                    {db.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        <Check className="h-3.5 w-3.5" />
                        Ativo
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="min-h-12 space-y-1 text-sm">
                    <p className="text-muted-foreground">
                      Tipo: <span className="font-medium">{db.type}</span>
                    </p>
                    {db.description ? (
                      <p className="text-xs text-muted-foreground">
                        {db.description}
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        Sem descrição
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(db as DatabaseRecord)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDuplicate(db as DatabaseRecord)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicar
                    </Button>
                  </div>

                  {!db.isActive && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => handleSetActive(db.id)}
                      disabled={setActiveMutation.isPending}
                    >
                      Ativar Banco
                    </Button>
                  )}

                  {user?.role === "super_admin" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDelete(db)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir definitivamente
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhum banco cadastrado</p>
            </CardContent>
          </Card>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Banco de Dados</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <Label htmlFor="edit-database-name">Nome *</Label>
                <Input
                  id="edit-database-name"
                  value={editForm.name}
                  onChange={e =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  maxLength={255}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-database-description">Descrição</Label>
                <Textarea
                  id="edit-database-description"
                  value={editForm.description}
                  onChange={e =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={4}
                />
              </div>
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                Alterar o nome ou a descrição não modifica clientes, contratos,
                pagamentos ou demais dados armazenados neste banco.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  disabled={adminPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={adminPending}>
                  {adminPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar alterações
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Duplicar Banco de Dados</DialogTitle>
            </DialogHeader>
            <form onSubmit={duplicateDatabase} className="space-y-4">
              <div>
                <Label>Banco de origem</Label>
                <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                  {duplicateTarget?.name || "—"}
                </div>
              </div>
              <div>
                <Label htmlFor="duplicate-database-name">Nome da cópia *</Label>
                <Input
                  id="duplicate-database-name"
                  value={duplicateForm.name}
                  onChange={e =>
                    setDuplicateForm({ ...duplicateForm, name: e.target.value })
                  }
                  maxLength={255}
                  required
                />
              </div>
              <div>
                <Label htmlFor="duplicate-database-description">Descrição</Label>
                <Textarea
                  id="duplicate-database-description"
                  value={duplicateForm.description}
                  onChange={e =>
                    setDuplicateForm({
                      ...duplicateForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                />
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                A duplicação cria um novo banco independente e copia clientes,
                empréstimos, agentes, veículos, produtos, financiamentos, vendas,
                pagamentos, histórico de juros e caixa. Alterações futuras em um
                banco não afetam o outro.
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDuplicateOpen(false)}
                  disabled={adminPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={adminPending}>
                  {adminPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Duplicar banco
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
