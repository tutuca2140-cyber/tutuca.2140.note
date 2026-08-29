import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  Database,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShoppingBag,
  UserCog,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PermissionKey =
  | "canView"
  | "canInsert"
  | "canEdit"
  | "canDelete"
  | "canGenerateReports"
  | "canAccessSettings";
type Permissions = Record<PermissionKey, boolean>;
type Draft = Permissions & {
  id?: number;
  username: string;
  email: string;
  name: string;
  password: string;
  role: "user" | "admin";
  databaseIds: number[];
  dashboardOnly: boolean;
};
type UserTab = "super_admin" | "commercial";

const permissionOptions: Array<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: "canView",
    label: "Visualizar dados",
    description: "Consultar clientes, contratos, caixa e demais cadastros.",
  },
  {
    key: "canInsert",
    label: "Criar lançamentos",
    description: "Cadastrar clientes, empréstimos, pagamentos e registros.",
  },
  {
    key: "canEdit",
    label: "Editar registros",
    description: "Alterar informações já cadastradas no sistema.",
  },
  {
    key: "canDelete",
    label: "Excluir registros",
    description: "Remover cadastros permitidos pelas regras do sistema.",
  },
  {
    key: "canGenerateReports",
    label: "Gerar relatórios",
    description: "Acessar relatórios e exportações gerenciais.",
  },
  {
    key: "canAccessSettings",
    label: "Acessar configurações",
    description: "Consultar e alterar configurações administrativas.",
  },
];

const permissionsForRole = (role: Draft["role"]): Permissions =>
  role === "admin"
    ? {
        canView: true,
        canInsert: true,
        canEdit: true,
        canDelete: true,
        canGenerateReports: true,
        canAccessSettings: true,
      }
    : {
        canView: true,
        canInsert: false,
        canEdit: false,
        canDelete: false,
        canGenerateReports: false,
        canAccessSettings: false,
      };

const makeEmptyDraft = (): Draft => ({
  username: "",
  email: "",
  name: "",
  password: "",
  role: "user",
  databaseIds: [],
  dashboardOnly: false,
  ...permissionsForRole("user"),
});

const isCommercialAccount = (loginMethod: string | null | undefined) =>
  loginMethod === "commercial_signup" || loginMethod === "commercial_subuser";

export default function AdminUsuarios() {
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const { data: databases = [] } = trpc.databases.list.useQuery();
  const createUser = trpc.users.create.useMutation();
  const updateUser = trpc.users.update.useMutation();
  const toggleUser = trpc.users.toggleActive.useMutation();
  const resetPassword = trpc.users.adminResetPassword.useMutation();
  const [draft, setDraft] = useState<Draft>(makeEmptyDraft);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserTab>("super_admin");
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>(
    {}
  );
  const refresh = async () => utils.users.list.invalidate();
  const fail = (error: unknown) =>
    toast.error(
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a operação."
    );

  const superAdminUsers = users.filter(
    user => !isCommercialAccount(user.loginMethod)
  );
  const commercialUsers = users.filter(user =>
    isCommercialAccount(user.loginMethod)
  );
  const visibleUsers =
    activeTab === "commercial" ? commercialUsers : superAdminUsers;

  const save = async () => {
    try {
      if (draft.id) {
        const { id: userId, password: _password, ...data } = draft;
        await updateUser.mutateAsync({ userId, ...data });
        toast.success("Usuário atualizado.");
      } else {
        await createUser.mutateAsync(draft);
        toast.success("Usuário criado.");
      }
      setOpen(false);
      setDraft(makeEmptyDraft());
      await refresh();
    } catch (error) {
      fail(error);
    }
  };

  const edit = (user: (typeof users)[number]) => {
    setDraft({
      id: user.id,
      username: user.username ?? "",
      email: user.email ?? "",
      name: user.name ?? "",
      password: "",
      role: user.role === "admin" ? "admin" : "user",
      canView: user.canView,
      canInsert: user.canInsert,
      canEdit: user.canEdit,
      canDelete: user.canDelete,
      canGenerateReports: user.canGenerateReports,
      canAccessSettings: user.canAccessSettings,
      databaseIds: user.databaseIds ?? [],
      dashboardOnly: user.dashboardOnly,
    });
    setOpen(true);
  };

  const toggle = async (userId: number, isActive: boolean) => {
    try {
      await toggleUser.mutateAsync({ userId, isActive });
      await refresh();
      toast.success(
        isActive
          ? "Usuário ativado."
          : "Usuário desativado e sessões encerradas."
      );
    } catch (error) {
      fail(error);
    }
  };

  const reset = async (userId: number) => {
    const password = passwordDrafts[userId] ?? "";
    if (password.length < 6)
      return toast.error("A senha deve ter no mínimo 6 caracteres.");
    try {
      await resetPassword.mutateAsync({ userId, password });
      setPasswordDrafts(current => ({ ...current, [userId]: "" }));
      toast.success("Senha redefinida e sessões anteriores encerradas.");
    } catch (error) {
      fail(error);
    }
  };

  const busy = createUser.isPending || updateUser.isPending;
  const toggleDatabase = (databaseId: number, checked: boolean) => {
    setDraft(current => {
      if (!checked)
        return {
          ...current,
          databaseIds: current.databaseIds.filter(id => id !== databaseId),
        };
      if (current.databaseIds.length >= 3) {
        toast.error("Cada usuário pode operar em no máximo três bancos.");
        return current;
      }
      return { ...current, databaseIds: [...current.databaseIds, databaseId] };
    });
  };
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Gerenciamento de Usuários
            </h1>
            <p className="mt-2 text-muted-foreground">
              Contas gratuitas/teste do Super Admin e contas comerciais ficam separadas por origem.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={value => {
              setOpen(value);
              if (!value) setDraft(makeEmptyDraft());
            }}
          >
            {activeTab === "super_admin" && (
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo usuário
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {draft.id ? "Editar usuário" : "Criar usuário"}
                </DialogTitle>
                <DialogDescription>
                  Configure os dados de acesso e as ações autorizadas para esta
                  conta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <section className="space-y-4">
                  <div>
                    <h3 className="font-semibold">Dados de acesso</h3>
                    <p className="text-sm text-muted-foreground">
                      Informe a identificação e o perfil principal da conta.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="user-name">Nome</Label>
                      <Input
                        id="user-name"
                        className="mt-2"
                        value={draft.name}
                        onChange={e =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="user-username">Usuário</Label>
                      <Input
                        id="user-username"
                        className="mt-2"
                        autoCapitalize="none"
                        value={draft.username}
                        onChange={e =>
                          setDraft({ ...draft, username: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="user-email">E-mail</Label>
                      <Input
                        id="user-email"
                        className="mt-2"
                        type="email"
                        autoCapitalize="none"
                        value={draft.email}
                        onChange={e =>
                          setDraft({ ...draft, email: e.target.value })
                        }
                      />
                    </div>
                    {!draft.id && (
                      <div>
                        <Label htmlFor="user-password">Senha inicial</Label>
                        <Input
                          id="user-password"
                          className="mt-2"
                          type="password"
                          minLength={6}
                          value={draft.password}
                          onChange={e =>
                            setDraft({ ...draft, password: e.target.value })
                          }
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mínimo de 6 caracteres.
                        </p>
                      </div>
                    )}
                    <div className={draft.id ? "sm:col-span-2" : undefined}>
                      <Label>Perfil</Label>
                      <Select
                        value={draft.role}
                        onValueChange={(role: Draft["role"]) =>
                          setDraft({
                            ...draft,
                            role,
                            dashboardOnly: false,
                            ...permissionsForRole(role),
                          })
                        }
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ao trocar o perfil, aplicamos as permissões
                        recomendadas; você pode ajustá-las abaixo.
                      </p>
                    </div>
                  </div>
                </section>
                <section className="space-y-4 border-t pt-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Bancos permitidos</h3>
                      <p className="text-sm text-muted-foreground">
                        Vincule até três bancos em que este usuário poderá
                        consultar e lançar informações.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {databases.map(database => (
                      <label
                        key={database.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4"
                      >
                        <Checkbox
                          checked={draft.databaseIds.includes(database.id)}
                          onCheckedChange={checked =>
                            toggleDatabase(database.id, checked === true)
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {database.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {database.description ||
                              "Banco de dados operacional"}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!databases.length && (
                      <p className="text-sm text-muted-foreground sm:col-span-2">
                        Crie um banco de dados antes de vinculá-lo ao usuário.
                      </p>
                    )}
                  </div>
                  <p className="text-xs font-medium text-primary">
                    {draft.databaseIds.length}/3 bancos selecionados
                  </p>
                </section>
                <section className="space-y-4 border-t pt-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Permissões concedidas</h3>
                      <p className="text-sm text-muted-foreground">
                        Ative somente os recursos necessários para este usuário.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft(current => ({
                        ...current,
                        dashboardOnly: !current.dashboardOnly,
                        canView: true,
                        canInsert: false,
                        canEdit: false,
                        canDelete: false,
                        canGenerateReports: false,
                        canAccessSettings: false,
                      }))
                    }
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${draft.dashboardOnly ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/40"}`}
                  >
                    <span className="block font-semibold">
                      Somente Dashboard — opção mais simples
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      O usuário poderá visualizar apenas o dashboard completo do
                      banco autorizado, sem acessar cadastros, caixa ou
                      configurações.
                    </span>
                  </button>
                  {!draft.dashboardOnly && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {permissionOptions.map(permission => (
                        <div
                          key={permission.key}
                          className="flex min-w-0 items-start justify-between gap-4 rounded-xl border bg-card p-4"
                        >
                          <Label
                            htmlFor={`permission-${permission.key}`}
                            className="min-w-0 cursor-pointer leading-normal"
                          >
                            <span className="block font-medium">
                              {permission.label}
                            </span>
                            <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
                              {permission.description}
                            </span>
                          </Label>
                          <Switch
                            id={`permission-${permission.key}`}
                            checked={draft[permission.key]}
                            onCheckedChange={checked =>
                              setDraft(current => ({
                                ...current,
                                [permission.key]: checked,
                              }))
                            }
                            aria-label={permission.label}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={save}
                    disabled={
                      busy ||
                      !draft.name.trim() ||
                      !draft.username.trim() ||
                      !draft.email.trim() ||
                      (!draft.id && draft.password.length < 6)
                    }
                  >
                    {busy
                      ? "Salvando..."
                      : draft.id
                        ? "Salvar alterações"
                        : "Criar usuário"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab("super_admin")}
            className={`rounded-2xl border p-5 text-left transition ${
              activeTab === "super_admin"
                ? "border-primary bg-primary/10 shadow-sm"
                : "bg-card hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <UserCog className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">Usuários Criados Pelo Super Admin</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Contas gratuitas, de teste e administrativas criadas diretamente pelo Super Admin.
                  </p>
                </div>
              </div>
              <Badge variant={activeTab === "super_admin" ? "default" : "secondary"}>
                {superAdminUsers.length}
              </Badge>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("commercial")}
            className={`rounded-2xl border p-5 text-left transition ${
              activeTab === "commercial"
                ? "border-primary bg-primary/10 shadow-sm"
                : "bg-card hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">Usuários que Compraram Pelo Site</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Contratantes Basic/Plus e usuários adicionais vinculados às contas comerciais.
                  </p>
                </div>
              </div>
              <Badge variant={activeTab === "commercial" ? "default" : "secondary"}>
                {commercialUsers.length}
              </Badge>
            </div>
          </button>
        </div>

        {activeTab === "commercial" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Contas comerciais:</strong> os contratantes são identificados pelo cadastro feito no site. Usuários adicionais criados por um contratante Plus permanecem nesta mesma aba para que toda a estrutura comercial fique agrupada.
          </div>
        )}

        {isLoading ? (
          <p className="py-12 text-center text-muted-foreground">
            Carregando usuários...
          </p>
        ) : visibleUsers.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleUsers.map(user => {
              const protectedUser = user.username?.toLowerCase() === "draco";
              const commercialOwner = user.loginMethod === "commercial_signup";
              const commercialSubuser = user.loginMethod === "commercial_subuser";
              return (
                <Card key={user.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {user.name || user.username || user.email}
                      </span>
                      <Shield className="h-5 w-5 text-primary" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge>
                        {user.dashboardOnly ? "Somente Dashboard" : user.role}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={user.isActive ? "text-green-700" : "text-red-700"}
                      >
                        {user.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                      {commercialOwner && (
                        <Badge variant="secondary">Contratante do site</Badge>
                      )}
                      {commercialSubuser && (
                        <Badge variant="secondary">Usuário da conta</Badge>
                      )}
                      {!isCommercialAccount(user.loginMethod) && (
                        <Badge variant="secondary">Criado pelo Super Admin</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{user.username}
                      <br />
                      {user.email}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(user.databaseIds ?? []).map(databaseId => (
                        <Badge key={databaseId} variant="outline">
                          <Database className="mr-1 h-3 w-3" />
                          {databases.find(
                            database => database.id === databaseId
                          )?.name ?? `Banco #${databaseId}`}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {permissionOptions
                        .filter(permission => user[permission.key])
                        .map(permission => (
                          <Badge
                            key={permission.key}
                            variant="secondary"
                            className="font-normal"
                          >
                            {permission.label}
                          </Badge>
                        ))}
                    </div>
                    {protectedUser ? (
                      <p className="rounded-md bg-primary/5 p-3 text-xs text-primary">
                        Super administrador protegido.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => edit(user)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggle(user.id, !user.isActive)}
                          >
                            <UserRoundX className="mr-2 h-4 w-4" />
                            {user.isActive ? "Desativar" : "Ativar"}
                          </Button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="password"
                            placeholder="Nova senha"
                            value={passwordDrafts[user.id] ?? ""}
                            onChange={e =>
                              setPasswordDrafts(current => ({
                                ...current,
                                [user.id]: e.target.value,
                              }))
                            }
                          />
                          <Button
                            className="w-full sm:w-auto"
                            variant="outline"
                            onClick={() => reset(user.id)}
                          >
                            Redefinir
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {activeTab === "commercial"
                ? "Nenhum usuário comercial cadastrado até o momento."
                : "Nenhum usuário criado pelo Super Admin encontrado."}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
