import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  CreditCard,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Profile = {
  id: number;
  name: string;
  username: string;
  email: string;
  whatsapp: string;
  role: string;
  loginMethod: string;
  createdAt: string | null;
  commercial: boolean;
  commercialOwner: boolean;
  editable: boolean;
  canDeleteAccount: boolean;
  plan: "basic" | "plus" | null;
  subscriptionStatus: string | null;
  priceCents: number | null;
};

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function Perfil() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/profile", {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível carregar seu perfil.");
      }
      const next = result.profile as Profile;
      setProfile(next);
      setName(next.name || "");
      setUsername(next.username || "");
      setEmail(next.email || "");
      setWhatsapp(formatWhatsapp(next.whatsapp || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar seu perfil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sensitiveChanged = useMemo(() => {
    if (!profile) return false;
    return (
      username.trim().toLowerCase() !== profile.username.toLowerCase() ||
      email.trim().toLowerCase() !== profile.email.toLowerCase() ||
      Boolean(newPassword)
    );
  }, [email, newPassword, profile, username]);

  const save = async () => {
    if (!profile?.editable) return;
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("A confirmação da nova senha não confere.");
      return;
    }
    if (sensitiveChanged && !currentPassword) {
      toast.error("Informe sua senha atual para alterar usuário, e-mail ou senha.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          username,
          email,
          whatsapp,
          currentPassword,
          newPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível atualizar seu perfil.");
      }
      toast.success(result.message || "Perfil atualizado.");
      const next = result.profile as Profile;
      setProfile(next);
      setName(next.name || "");
      setUsername(next.username || "");
      setEmail(next.email || "");
      setWhatsapp(formatWhatsapp(next.whatsapp || ""));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar seu perfil.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!profile?.canDeleteAccount) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível excluir sua conta.");
      }
      toast.success(result.message || "Conta excluída.");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir sua conta.");
    } finally {
      setDeleting(false);
    }
  };

  const planName = profile?.plan === "plus" ? "Plus" : profile?.plan === "basic" ? "Basic" : null;
  const activeSubscription = profile?.subscriptionStatus === "active" || profile?.subscriptionStatus === "paid";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <UserRound className="h-4 w-4" />
            Minha conta
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Meu Perfil</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Consulte os dados da sua conta e, quando permitido, mantenha suas informações de cadastro atualizadas.
          </p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-14 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Carregando seu perfil...
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : profile ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Conta</p>
                    <p className="truncate font-bold">{profile.name || profile.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-bold">{planName || "Conta interna"}</p>
                      {planName && (
                        <Badge variant={activeSubscription ? "default" : "outline"}>
                          {activeSubscription ? "Ativo" : "Aguardando pagamento"}
                        </Badge>
                      )}
                    </div>
                    {profile.priceCents != null && (
                      <p className="text-xs text-muted-foreground">
                        {money.format(Number(profile.priceCents) / 100)}/mês
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Cadastro</p>
                    <p className="font-bold">
                      {profile.createdAt
                        ? new Intl.DateTimeFormat("pt-BR").format(new Date(profile.createdAt))
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profile.commercialOwner ? "Contratante principal" : profile.commercial ? "Usuário vinculado" : "Usuário interno"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {!profile.editable && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                <strong>Perfil administrado:</strong> esta conta não foi criada pelo cadastro comercial principal do site. Alterações sensíveis continuam sob responsabilidade de quem administra a conta.
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Informações do cadastro</CardTitle>
                <CardDescription>
                  Os mesmos dados informados na criação da conta ficam salvos aqui.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="profile-name">Nome e sobrenome</Label>
                    <Input
                      id="profile-name"
                      className="mt-2"
                      value={name}
                      onChange={event => setName(event.target.value)}
                      disabled={!profile.editable || saving}
                    />
                  </div>
                  <div>
                    <Label htmlFor="profile-username">Nome de usuário</Label>
                    <Input
                      id="profile-username"
                      className="mt-2"
                      value={username}
                      onChange={event => setUsername(event.target.value)}
                      disabled={!profile.editable || saving}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Usado para entrar no Note Note.</p>
                  </div>
                  <div>
                    <Label htmlFor="profile-email">E-mail</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      className="mt-2"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      disabled={!profile.editable || saving}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Usado também para recuperação de senha.</p>
                  </div>
                  <div>
                    <Label htmlFor="profile-whatsapp">WhatsApp</Label>
                    <Input
                      id="profile-whatsapp"
                      className="mt-2"
                      inputMode="tel"
                      value={whatsapp}
                      onChange={event => setWhatsapp(formatWhatsapp(event.target.value))}
                      placeholder="(24) 99999-9999"
                      disabled={!profile.editable || saving}
                    />
                  </div>
                </div>

                {profile.editable && (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-semibold">Segurança da conta</p>
                        <p className="text-xs text-muted-foreground">
                          Para trocar usuário, e-mail ou senha, confirme primeiro sua senha atual.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label htmlFor="current-password">Senha atual</Label>
                        <Input
                          id="current-password"
                          type="password"
                          className="mt-2"
                          value={currentPassword}
                          onChange={event => setCurrentPassword(event.target.value)}
                          disabled={saving}
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-password">Nova senha</Label>
                        <Input
                          id="new-password"
                          type="password"
                          className="mt-2"
                          value={newPassword}
                          onChange={event => setNewPassword(event.target.value)}
                          disabled={saving}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Mínimo 8 caracteres, uma maiúscula e um número.</p>
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          className="mt-2"
                          value={confirmPassword}
                          onChange={event => setConfirmPassword(event.target.value)}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {profile.editable && (
                  <div className="flex justify-end">
                    <Button onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar alterações
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {profile.canDeleteAccount && (
              <Card className="border-destructive/40">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-destructive">Excluir minha conta</CardTitle>
                      <CardDescription className="mt-1">
                        A exclusão remove o acesso comercial, os bancos pertencentes à conta e os dados operacionais. No Plus, usuários adicionais vinculados também perdem o acesso.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir conta definitivamente
                  </Button>
                </CardContent>
              </Card>
            )}

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Excluir conta definitivamente?</DialogTitle>
                  <DialogDescription>
                    Esta ação não pode ser desfeita. Confirme sua senha e digite EXCLUIR CONTA para continuar.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="delete-password">Senha atual</Label>
                    <Input
                      id="delete-password"
                      type="password"
                      className="mt-2"
                      value={deletePassword}
                      onChange={event => setDeletePassword(event.target.value)}
                      disabled={deleting}
                    />
                  </div>
                  <div>
                    <Label htmlFor="delete-confirmation">Digite EXCLUIR CONTA</Label>
                    <Input
                      id="delete-confirmation"
                      className="mt-2"
                      value={deleteConfirmation}
                      onChange={event => setDeleteConfirmation(event.target.value)}
                      disabled={deleting}
                    />
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    <p>O sistema exige duas confirmações para impedir exclusões acidentais.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={deleteAccount}
                    disabled={deleting || !deletePassword || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR CONTA"}
                  >
                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Confirmar exclusão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
