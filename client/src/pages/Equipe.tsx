import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
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
import {
  Edit3,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Permissions = {
  canView: boolean;
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canGenerateReports: boolean;
  canManageUsers: boolean;
  canManageDatabases: boolean;
  canDeleteCashFlow: boolean;
};

type Member = Permissions & {
  id: number;
  username: string;
  name: string;
  email: string;
  isActive: boolean;
  databases: Array<{ id: number; name: string }>;
};

type TeamData = {
  success: boolean;
  plan: "free" | "basic" | "plus";
  status: string;
  isOwner: boolean;
  canManageTeam: boolean;
  teamLimit: number;
  members: Member[];
  databases: Array<{ id: number; name: string; description?: string | null }>;
  viewerPermissions: Permissions;
  message?: string;
};

type FormState = {
  id?: number;
  name: string;
  username: string;
  email: string;
  password: string;
  databaseIds: number[];
  permissions: Permissions;
};

const defaultPermissions: Permissions = {
  canView: true,
  canInsert: false,
  canEdit: false,
  canDelete: false,
  canGenerateReports: false,
  canManageUsers: false,
  canManageDatabases: false,
  canDeleteCashFlow: false,
};

const emptyForm = (): FormState => ({
  name: "",
  username: "",
  email: "",
  password: "",
  databaseIds: [],
  permissions: { ...defaultPermissions },
});

const permissionOptions: Array<{
  key: keyof Permissions;
  title: string;
  description: string;
  sensitive?: boolean;
}> = [
  {
    key: "canView",
    title: "Visualizar",
    description:
      "Consultar clientes, contratos, produtos, veículos e demais informações.",
  },
  {
    key: "canInsert",
    title: "Fazer lançamentos e cadastros",
    description:
      "Cadastrar clientes, empréstimos, produtos, veículos, pagamentos e movimentações permitidas.",
  },
  {
    key: "canEdit",
    title: "Editar registros",
    description: "Alterar informações operacionais já cadastradas.",
  },
  {
    key: "canDelete",
    title: "Excluir registros operacionais",
    description: "Excluir registros quando a área correspondente permitir.",
  },
  {
    key: "canGenerateReports",
    title: "Gerar relatórios",
    description: "Acessar e gerar relatórios dos bancos liberados.",
  },
  {
    key: "canManageUsers",
    title: "Administrar usuários da conta",
    description:
      "Criar e editar usuários da própria conta Plus, respeitando o limite do plano.",
    sensitive: true,
  },
  {
    key: "canManageDatabases",
    title: "Editar ou apagar bancos",
    description:
      "Renomear, limpar memória, restaurar ou excluir bancos do contratante.",
    sensitive: true,
  },
  {
    key: "canDeleteCashFlow",
    title: "Apagar lançamentos do caixa",
    description:
      "Excluir movimentações do fluxo de caixa com registro em auditoria.",
    sensitive: true,
  },
];

const TEAM_ENDPOINT = "/api/commercial-account?scope=team";

export default function Equipe() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(TEAM_ENDPOINT, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Não foi possível carregar os usuários da conta."
        );
      }
      setData(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a equipe."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remaining = useMemo(
    () =>
      Math.max(
        0,
        Number(data?.teamLimit || 0) - Number(data?.members.length || 0)
      ),
    [data]
  );

  const openCreate = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (member: Member) => {
    setForm({
      id: member.id,
      name: member.name || "",
      username: member.username || "",
      email: member.email || "",
      password: "",
      databaseIds: member.databases.map(database => database.id),
      permissions: Object.fromEntries(
        Object.keys(defaultPermissions).map(key => [
          key,
          Boolean(member[key as keyof Permissions]),
        ])
      ) as Permissions,
    });
    setOpen(true);
  };

  const setPermission = (key: keyof Permissions, value: boolean) => {
    setForm(current => ({
      ...current,
      permissions: { ...current.permissions, [key]: value },
    }));
  };

  const toggleDatabase = (id: number) => {
    setForm(current => ({
      ...current,
      databaseIds: current.databaseIds.includes(id)
        ? current.databaseIds.filter(databaseId => databaseId !== id)
        : [...current.databaseIds, id],
    }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data?.canManageTeam) return;
    if (!form.id && !form.password) {
      toast.error("Informe uma senha para o novo usuário.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(TEAM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: form.id ? "update" : "create",
          userId: form.id,
          name: form.name,
          username: form.username,
          email: form.email,
          password: form.password,
          databaseIds: form.databaseIds,
          permissions: form.permissions,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Não foi possível salvar o usuário."
        );
      }
      toast.success(result.message || "Usuário salvo.");
      setOpen(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o usuário."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (member: Member) => {
    try {
      const response = await fetch(TEAM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "toggle",
          userId: member.id,
          isActive: !member.isActive,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Não foi possível alterar o usuário."
        );
      }
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o usuário."
      );
    }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`Excluir o usuário “${member.username}” da sua conta?`))
      return;
    try {
      const response = await fetch(TEAM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "delete", userId: member.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Não foi possível excluir o usuário."
        );
      }
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o usuário."
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              Usuários da sua conta
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Equipe e Permissões
            </h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              No Plus, o contratante pode cadastrar até cinco usuários
              adicionais e escolher exatamente quais bancos e operações cada
              pessoa poderá usar.
            </p>
          </div>
          {data?.canManageTeam && (
            <Button onClick={openCreate} disabled={remaining <= 0}>
              <Plus className="mr-2 h-4 w-4" />
              Novo usuário
            </Button>
          )}
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-14 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando equipe...
            </CardContent>
          </Card>
        ) : data?.plan === "basic" || data?.plan === "free" ? (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold">
                Plano {data.plan === "free" ? "Grátis" : "Basic"}: uso
                individual
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Este plano permite somente o próprio titular utilizando o
                sistema. O cadastro de até cinco usuários adicionais e a divisão
                de permissões entre bancos são benefícios do plano Plus.
              </p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Usuários cadastrados
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {data.members.length}/{data.teamLimit}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Vagas disponíveis
                  </p>
                  <p className="mt-1 text-3xl font-black">{remaining}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">
                    Bancos disponíveis para compartilhar
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {data.databases.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {!data.canManageTeam && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Você pode consultar esta área, mas não possui permissão do
                contratante para cadastrar ou editar usuários.
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <strong>Proteção padrão:</strong> usuários criados pelo
              contratante não podem administrar usuários, editar/apagar bancos
              nem apagar lançamentos do caixa. Essas três permissões precisam
              ser liberadas explicitamente pelo contratante.
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {data.members.map(member => (
                <Card key={member.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {member.name || member.username}
                      </span>
                      <Badge
                        variant={member.isActive ? "default" : "secondary"}
                      >
                        {member.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      <p>@{member.username}</p>
                      <p>{member.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Bancos liberados
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {member.databases.length ? (
                          member.databases.map(database => (
                            <Badge key={database.id} variant="outline">
                              {database.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Nenhum banco liberado
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {permissionOptions
                        .filter(option => member[option.key])
                        .map(option => (
                          <div
                            key={option.key}
                            className="flex items-center gap-2 text-xs"
                          >
                            <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                            {option.title}
                          </div>
                        ))}
                    </div>
                    {data.canManageTeam && (
                      <div className="flex flex-wrap gap-2 border-t pt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(member)}
                        >
                          <Edit3 className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(member)}
                        >
                          {member.isActive ? "Desativar" : "Ativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeMember(member)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {!data.members.length && (
                <Card className="lg:col-span-2">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="font-semibold">
                      Nenhum usuário adicional cadastrado.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Você pode cadastrar até cinco pessoas no plano Plus.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? "Editar usuário e permissões"
                : "Cadastrar usuário da conta"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <Label>Nome de usuário *</Label>
                <Input
                  value={form.username}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <Label>{form.id ? "Nova senha (opcional)" : "Senha *"}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  required={!form.id}
                  placeholder="8+ caracteres, maiúscula e número"
                />
              </div>
            </div>

            <div>
              <p className="font-semibold">Bancos liberados</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O usuário só poderá operar nos bancos marcados abaixo.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(data?.databases ?? []).map(database => (
                  <label
                    key={database.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.databaseIds.includes(database.id)}
                      onChange={() => toggleDatabase(database.id)}
                      className="h-4 w-4"
                    />
                    <span>{database.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold">Permissões</p>
              <p className="mt-1 text-sm text-muted-foreground">
                As três permissões sensíveis ficam desligadas por padrão.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {permissionOptions.map(option => {
                  const viewerCanGrant =
                    data?.isOwner ||
                    Boolean(data?.viewerPermissions?.[option.key]);
                  return (
                    <label
                      key={option.key}
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        option.sensitive
                          ? "border-amber-200 bg-amber-50/40"
                          : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={form.permissions[option.key]}
                        onChange={event =>
                          setPermission(option.key, event.target.checked)
                        }
                        disabled={!viewerCanGrant}
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.id ? "Salvar permissões" : "Criar usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
