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
  Clock3,
  CreditCard,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
  XCircle,
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
  canCancelPlan: boolean;
  plan: "basic" | "plus" | null;
  subscriptionStatus: string | null;
  priceCents: number | null;
  provider?: string | null;
  billingMethod?: "card_monthly" | "pix_annual" | string | null;
  providerStatus?: string | null;
  lastPaymentStatus?: string | null;
  trialEndsAt?: string | null;
  trialActive?: boolean;
  trialDaysRemaining?: number;
  paidUntil?: string | null;
  lastWebhookAt?: string | null;
  subscriptionUpdatedAt?: string | null;
};

const PROFILE_API = "/api/commercial-account?scope=profile";
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function safeDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? dateTime.format(date) : dateOnly.format(date);
}

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function subscriptionLabel(profile: Profile) {
  if (profile.subscriptionStatus === "canceled") return "Cancelado";
  if (profile.subscriptionStatus === "past_due") return "Em atraso";
  if (profile.subscriptionStatus === "pending_payment") return "Aguardando pagamento";
  if (profile.trialActive) return "Teste grátis";
  if (profile.subscriptionStatus === "active" || profile.subscriptionStatus === "paid") return "Ativo";
  return profile.subscriptionStatus || "Sem status";
}

function billingLabel(profile: Profile) {
  if (profile.billingMethod === "pix_annual") return "Pix anual";
  if (profile.billingMethod === "card_monthly") return "Cartão mensal";
  return "Não informado";
}

export default function Perfil() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelingPlan, setCancelingPlan] = useState(false);
  const [error, setError] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewPublished, setReviewPublished] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const applyProfile = (next: Profile) => {
    setProfile(next);
    setName(next.name || "");
    setUsername(next.username || "");
    setEmail(next.email || "");
    setWhatsapp(formatWhatsapp(next.whatsapp || ""));
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(PROFILE_API, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível carregar seu perfil.");
      }
      applyProfile(result.profile as Profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar seu perfil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!profile?.commercial) return;
    fetch("/api/site-access?scope=reviews&action=mine", { credentials: "include", cache: "no-store" })
      .then(async response => ({ response, result: await response.json().catch(() => ({})) }))
      .then(({ response, result }) => {
        if (!response.ok || !result?.success) return;
        if (result.review) {
          setReviewRating(Number(result.review.rating || 0));
          setReviewComment(String(result.review.comment || ""));
          setReviewPublished(Boolean(result.review.published));
        }
      }).catch(() => {});
  }, [profile?.commercial]);

  const saveReview = async () => {
    if (!reviewRating) return toast.error("Escolha de 1 a 5 estrelas.");
    if (reviewComment.trim().length < 3) return toast.error("Escreva um comentário, sugestão ou elogio.");
    setReviewSaving(true);
    try {
      const response = await fetch("/api/site-access?scope=reviews&action=mine", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível enviar sua avaliação.");
      setReviewPublished(false);
      toast.success(result.message || "Avaliação enviada.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação."); }
    finally { setReviewSaving(false); }
  };

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
      const response = await fetch(PROFILE_API, {
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
      applyProfile(result.profile as Profile);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar seu perfil.");
    } finally {
      setSaving(false);
    }
  };

  const cancelPlan = async () => {
    if (!profile?.canCancelPlan) return;
    if (!cancelPassword) {
      toast.error("Informe sua senha atual.");
      return;
    }
    setCancelingPlan(true);
    try {
      const response = await fetch(PROFILE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "cancel_subscription",
          currentPassword: cancelPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível cancelar o plano.");
      }
      toast.success(result.message || "Plano cancelado.");
      if (result.profile) applyProfile(result.profile as Profile);
      setCancelPassword("");
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível cancelar o plano.");
    } finally {
      setCancelingPlan(false);
    }
  };

  const deleteAccount = async () => {
    if (!profile?.canDeleteAccount) return;
    setDeleting(true);
    try {
      const response = await fetch(PROFILE_API, {
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
  const canceledSubscription = profile?.subscriptionStatus === "canceled";
  const trialDays = Number(profile?.trialDaysRemaining || 0);

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
            Consulte seus dados, acompanhe o plano contratado, o teste grátis e gerencie sua assinatura.
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
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="font-bold">{planName || "Conta interna"}</p>
                      {planName && (
                        <Badge variant={canceledSubscription ? "secondary" : activeSubscription ? "default" : "outline"}>
                          {subscriptionLabel(profile)}
                        </Badge>
                      )}
                    </div>
                    {profile.priceCents != null && (
                      <p className="text-xs text-muted-foreground">
                        {money.format(Number(profile.priceCents) / 100)} · {billingLabel(profile)}
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

            {profile.commercialOwner && planName ? (
              <Card className={profile.trialActive ? "border-blue-200" : canceledSubscription ? "border-slate-300" : undefined}>
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle>Detalhes da assinatura</CardTitle>
                      <CardDescription className="mt-1">
                        Veja exatamente o período de teste, forma de pagamento, situação e validade do seu plano.
                      </CardDescription>
                    </div>
                    <Badge variant={canceledSubscription ? "secondary" : activeSubscription ? "default" : "outline"}>
                      {subscriptionLabel(profile)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profile.trialActive ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
                      <div className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <p className="font-black">Seu teste grátis está ativo</p>
                          <p className="mt-1 text-sm">
                            {trialDays === 1 ? "Falta 1 dia" : `Faltam ${trialDays} dias`} para o fim do teste. Ele termina em <strong>{safeDate(profile.trialEndsAt)}</strong>.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : profile.trialEndsAt ? (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                      O período de teste grátis terminou em <strong>{safeDate(profile.trialEndsAt)}</strong>.
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano e valor</p>
                      <p className="mt-1 font-bold">{planName}</p>
                      <p className="text-sm text-muted-foreground">{profile.priceCents != null ? money.format(Number(profile.priceCents) / 100) : "—"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobrança</p>
                      <p className="mt-1 font-bold">{billingLabel(profile)}</p>
                      <p className="text-sm text-muted-foreground">Provedor: {profile.provider || "—"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Teste grátis</p>
                      <p className="mt-1 font-bold">{safeDate(profile.trialEndsAt)}</p>
                      <p className="text-sm text-muted-foreground">{profile.trialActive ? `${trialDays} dia(s) restante(s)` : "Encerrado ou não aplicável"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validade / renovação</p>
                      <p className="mt-1 font-bold">{profile.billingMethod === "pix_annual" ? safeDate(profile.paidUntil) : "Mensal"}</p>
                      <p className="text-sm text-muted-foreground">{profile.billingMethod === "pix_annual" ? "Plano anual" : "Renovação recorrente"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-muted/30 p-4 text-sm">
                      <p className="font-semibold">Status do pagamento</p>
                      <p className="mt-1 text-muted-foreground">{profile.lastPaymentStatus || profile.providerStatus || subscriptionLabel(profile)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/30 p-4 text-sm">
                      <p className="font-semibold">Última atualização</p>
                      <p className="mt-1 text-muted-foreground">{safeDate(profile.lastWebhookAt || profile.subscriptionUpdatedAt, true)}</p>
                    </div>
                  </div>

                  {canceledSubscription ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                      <strong>Plano cancelado:</strong> o cancelamento já foi registrado. Você ainda pode excluir definitivamente sua conta pela seção abaixo.
                    </div>
                  ) : profile.canCancelPlan ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-amber-950">Deseja interromper o plano?</p>
                        <p className="text-sm text-amber-900">O cancelamento interrompe novas cobranças recorrentes e altera a situação da assinatura para cancelada.</p>
                      </div>
                      <Button variant="outline" onClick={() => setCancelOpen(true)}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Cancelar plano
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

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

            {profile.commercial && (
              <Card>
                <CardHeader>
                  <CardTitle>Avalie o Note Note</CardTitle>
                  <CardDescription>Sua opinião ajuda a melhorar o sistema. Dê até 5 estrelas e escreva uma sugestão ou elogio. O texto só aparece no site se for aprovado pelo Note Note.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">Sua nota</p>
                    <div className="flex gap-1.5">{[1,2,3,4,5].map(n => <button key={n} type="button" onMouseEnter={()=>setReviewHover(n)} onMouseLeave={()=>setReviewHover(0)} onClick={()=>setReviewRating(n)} aria-label={`${n} estrela${n>1?"s":""}`} className="rounded-lg p-1 transition hover:scale-110"><Star className={`h-8 w-8 ${n <= (reviewHover || reviewRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} /></button>)}</div>
                  </div>
                  <div>
                    <Label htmlFor="profile-review">Comentário, sugestão ou elogio</Label>
                    <textarea id="profile-review" value={reviewComment} onChange={e=>setReviewComment(e.target.value)} maxLength={1200} rows={5} placeholder="Conte o que você acha do Note Note ou deixe uma sugestão..." className="mt-2 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{reviewPublished ? "Este depoimento está publicado no site." : "Ao editar e reenviar, a avaliação volta para análise antes de ser publicada."}</span><span>{reviewComment.length}/1200</span></div>
                  </div>
                  <Button onClick={saveReview} disabled={reviewSaving || !reviewRating || reviewComment.trim().length < 3}>{reviewSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Star className="mr-2 h-4 w-4"/>}{reviewSaving ? "Enviando..." : "Enviar avaliação"}</Button>
                </CardContent>
              </Card>
            )}

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
                        Antes da exclusão, o Note Note cancela a assinatura/cobrança vinculada no Asaas quando houver um recurso ativo. Depois disso, remove o acesso comercial, os bancos pertencentes à conta e os dados operacionais. No Plus, usuários adicionais vinculados também perdem o acesso.
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

            <Dialog open={cancelOpen} onOpenChange={open => !cancelingPlan && setCancelOpen(open)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar seu plano?</DialogTitle>
                  <DialogDescription>
                    Confirme sua senha para cancelar a assinatura. Esta ação não exclui sua conta nem seus dados; a exclusão continua sendo uma ação separada.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {profile.trialActive ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                      Seu teste grátis termina em <strong>{safeDate(profile.trialEndsAt)}</strong> e restam <strong>{trialDays} dia(s)</strong>.
                    </div>
                  ) : null}
                  <div>
                    <Label htmlFor="cancel-plan-password">Senha atual</Label>
                    <Input
                      id="cancel-plan-password"
                      type="password"
                      className="mt-2"
                      value={cancelPassword}
                      onChange={event => setCancelPassword(event.target.value)}
                      disabled={cancelingPlan}
                    />
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>O Note Note tentará cancelar primeiro a recorrência ou cobrança pendente vinculada ao Asaas e só depois registrará o plano como cancelado.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelingPlan}>Voltar</Button>
                  <Button variant="destructive" onClick={cancelPlan} disabled={cancelingPlan || !cancelPassword}>
                    {cancelingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    Confirmar cancelamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Excluir conta definitivamente?</DialogTitle>
                  <DialogDescription>
                    Esta ação não pode ser desfeita. O plano será cancelado automaticamente antes da exclusão. Confirme sua senha e digite EXCLUIR CONTA para continuar.
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
                    <p>O sistema cancela o plano vinculado e exige duas confirmações para impedir exclusões acidentais.</p>
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
