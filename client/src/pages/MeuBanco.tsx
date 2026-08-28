import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Check,
  Clock3,
  Database,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type DatabaseRecord = {
  id: number;
  name: string;
  description?: string | null;
  type: string;
  isActive: boolean;
};

type RecoveryStatus = {
  canRestore: boolean;
  canClearAgain: boolean;
  createdAt?: string | null;
  recoveryUntil?: string | null;
  status?: string | null;
};

type StatusResponse = {
  success?: boolean;
  database?: DatabaseRecord;
  recovery?: RecoveryStatus;
  sharedWithOtherUsers?: boolean;
  message?: string;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function MeuBanco() {
  const { user } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/login",
  });
  const { data: databases = [], isLoading } = trpc.databases.list.useQuery();
  const { data: activeDb } = trpc.databases.getActive.useQuery();
  const utils = trpc.useUtils();

  const [statusById, setStatusById] = useState<Record<number, StatusResponse>>({});
  const [pending, setPending] = useState(false);
  const [editTarget, setEditTarget] = useState<DatabaseRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [clearTarget, setClearTarget] = useState<DatabaseRecord | null>(null);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DatabaseRecord | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const callSelfService = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/database-self-service", {
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

  const refreshStatus = async (databaseIds?: number[]) => {
    const ids = databaseIds ?? databases.map(database => database.id);
    if (!ids.length) {
      setStatusById({});
      return;
    }
    const entries = await Promise.all(
      ids.map(async databaseId => {
        try {
          const status = (await callSelfService({
            action: "status",
            databaseId,
          })) as StatusResponse;
          return [databaseId, status] as const;
        } catch (error) {
          return [
            databaseId,
            {
              success: false,
              message:
                error instanceof Error
                  ? error.message
                  : "Não foi possível consultar o banco.",
            } satisfies StatusResponse,
          ] as const;
        }
      })
    );
    setStatusById(Object.fromEntries(entries));
  };

  useEffect(() => {
    if (databases.length) void refreshStatus(databases.map(database => database.id));
    else setStatusById({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databases.map(database => database.id).join(",")]);

  const refreshAll = async () => {
    await Promise.all([
      utils.databases.list.invalidate(),
      utils.databases.getActive.invalidate(),
      utils.invalidate(),
    ]);
  };

  const openEdit = (database: DatabaseRecord) => {
    setEditTarget(database);
    setEditName(database.name);
    setEditDescription(database.description || "");
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;
    setPending(true);
    try {
      await callSelfService({
        action: "update",
        databaseId: editTarget.id,
        name: editName,
        description: editDescription,
      });
      await refreshAll();
      await refreshStatus([editTarget.id]);
      setEditTarget(null);
      toast.success("Banco atualizado com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao editar banco.");
    } finally {
      setPending(false);
    }
  };

  const clearMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clearTarget) return;
    setPending(true);
    try {
      const result = await callSelfService({
        action: "clear",
        databaseId: clearTarget.id,
        confirmation: clearConfirmation,
      });
      await refreshAll();
      await refreshStatus([clearTarget.id]);
      setClearTarget(null);
      setClearConfirmation("");
      toast.success(
        result?.message ||
          "Memória limpa. A restauração ficará disponível por 48 horas."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível limpar a memória."
      );
    } finally {
      setPending(false);
    }
  };

  const restoreMemory = async (database: DatabaseRecord) => {
    if (
      !window.confirm(
        `Restaurar a memória anterior de “${database.name}”? Dados lançados depois da limpeza serão substituídos pela cópia anterior.`
      )
    )
      return;
    setPending(true);
    try {
      const result = await callSelfService({
        action: "restore",
        databaseId: database.id,
      });
      await refreshAll();
      await refreshStatus([database.id]);
      toast.success(result?.message || "Memória restaurada com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível restaurar a memória."
      );
    } finally {
      setPending(false);
    }
  };

  const deleteDatabase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deleteTarget) return;
    setPending(true);
    try {
      const result = await callSelfService({
        action: "delete",
        databaseId: deleteTarget.id,
        confirmation: deleteConfirmation,
      });
      await refreshAll();
      setDeleteTarget(null);
      setDeleteConfirmation("");
      toast.success(result?.message || "Banco excluído definitivamente.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível excluir o banco."
      );
    } finally {
      setPending(false);
    }
  };

  const orderedDatabases = useMemo(
    () =>
      [...databases].sort((a, b) => {
        if (a.id === activeDb?.id) return -1;
        if (b.id === activeDb?.id) return 1;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [databases, activeDb?.id]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meu Banco</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Gerencie somente os bancos vinculados à sua conta. Você pode alterar o
            nome, limpar os dados operacionais ou excluir definitivamente um banco
            que seja exclusivo da sua conta.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Regra de segurança de 48 horas</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">
                Ao limpar a memória do banco, clientes, contratos, pagamentos,
                veículos, produtos, financiamentos e caixa são removidos da área
                operacional. Uma cópia fica disponível para restauração por até 48
                horas. Depois disso ela expira e a limpeza se torna definitiva. Uma
                nova limpeza só pode ser feita após completar 48 horas da anterior.
              </p>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Como administrador, você continua tendo a área completa em
            <a href="/admin/bancos" className="ml-1 font-medium text-primary underline">
              Bancos de Dados
            </a>
            , incluindo criação e duplicação.
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Carregando bancos...</div>
        ) : orderedDatabases.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {orderedDatabases.map(database => {
              const status = statusById[database.id];
              const recovery = status?.recovery;
              const shared = Boolean(status?.sharedWithOtherUsers);
              const isActive = database.id === activeDb?.id;
              return (
                <Card key={database.id} className={isActive ? "border-2 border-primary" : ""}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3">
                      <span className="truncate">{database.name}</span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          <Check className="h-3.5 w-3.5" /> Ativo
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      {database.description || "Sem descrição"}
                    </div>

                    {shared && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        Este banco também está vinculado a outro usuário. A exclusão
                        definitiva fica bloqueada para proteger os demais acessos.
                      </div>
                    )}

                    {recovery?.canRestore && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
                        <p className="font-medium text-blue-900 dark:text-blue-200">
                          Memória anterior disponível
                        </p>
                        <p className="mt-1 text-xs text-blue-800 dark:text-blue-300">
                          Pode ser restaurada até {formatDateTime(recovery.recoveryUntil)}.
                        </p>
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          onClick={() => restoreMemory(database as DatabaseRecord)}
                          disabled={pending}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Restaurar memória
                        </Button>
                      </div>
                    )}

                    {!recovery?.canClearAgain && recovery?.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        Próxima redefinição de memória disponível 48 horas após
                        {" "}{formatDateTime(recovery.createdAt)}.
                      </p>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        onClick={() => openEdit(database as DatabaseRecord)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar nome
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setClearTarget(database as DatabaseRecord);
                          setClearConfirmation("");
                        }}
                        disabled={pending || recovery?.canClearAgain === false}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Limpar memória
                      </Button>
                    </div>

                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        setDeleteTarget(database as DatabaseRecord);
                        setDeleteConfirmation("");
                      }}
                      disabled={pending || shared}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir meu banco definitivamente
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium">Nenhum banco vinculado à sua conta.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Solicite ao Super Admin a definição do seu banco de dados.
              </p>
            </CardContent>
          </Card>
        )}

        <Dialog open={Boolean(editTarget)} onOpenChange={open => !open && setEditTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar meu banco</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveEdit}>
              <div>
                <Label htmlFor="my-db-name">Nome *</Label>
                <Input
                  id="my-db-name"
                  value={editName}
                  onChange={event => setEditName(event.target.value)}
                  maxLength={255}
                  required
                />
              </div>
              <div>
                <Label htmlFor="my-db-description">Descrição</Label>
                <Textarea
                  id="my-db-description"
                  value={editDescription}
                  onChange={event => setEditDescription(event.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(clearTarget)} onOpenChange={open => !open && setClearTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Limpar memória do banco</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={clearMemory}>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Isso apagará os dados operacionais de <strong>{clearTarget?.name}</strong>.
                    Você poderá restaurar a memória anterior por até 48 horas.
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="clear-confirmation">Digite LIMPAR para confirmar</Label>
                <Input
                  id="clear-confirmation"
                  value={clearConfirmation}
                  onChange={event => setClearConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setClearTarget(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || clearConfirmation.trim().toUpperCase() !== "LIMPAR"}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Limpar memória
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir banco definitivamente</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={deleteDatabase}>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Esta ação exclui o banco <strong>{deleteTarget?.name}</strong>, seus
                    dados e qualquer cópia de recuperação. Não existe restauração de
                    48 horas para a exclusão do banco inteiro.
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="delete-confirmation">
                  Digite exatamente: {deleteTarget?.name}
                </Label>
                <Input
                  id="delete-confirmation"
                  value={deleteConfirmation}
                  onChange={event => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={pending || deleteConfirmation !== deleteTarget?.name}>
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Excluir definitivamente
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
