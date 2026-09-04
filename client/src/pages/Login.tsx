import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const resetToken =
    new URLSearchParams(window.location.search).get("reset")?.trim() || "";
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [notRobot, setNotRobot] = useState(false);
  const [captcha, setCaptcha] = useState({ question: "", token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [pendingPayment, setPendingPayment] = useState<any>(null);

  const refreshCaptcha = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/captcha", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result?.success) {
        setCaptcha({ question: result.question, token: result.token });
      }
    } catch {
      // A tentativa exibirá o erro caso o serviço de verificação esteja indisponível.
    }
  }, []);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  const resetRules = {
    length: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
  };
  const resetPasswordValid = Object.values(resetRules).every(Boolean);
  const resetPasswordsMatch =
    newPassword.length > 0 && newPassword === confirmNewPassword;

  const resetCaptcha = () => {
    setNotRobot(false);
    setCaptchaAnswer("");
    void refreshCaptcha();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notRobot || !captchaAnswer.trim()) {
      toast.error("Marque “Não sou um robô” e resolva a verificação.");
      return;
    }
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "login",
          username,
          password,
          rememberMe,
          captchaToken: captcha.token,
          captchaAnswer,
        }),
      });

      const result = await response.json();
      if (result?.paymentPending) {
        setPendingPayment(result.payment || {});
        toast.info(
          result?.message ||
            "Conclua o pagamento para liberar o primeiro acesso."
        );
        return;
      }
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Usuário ou senha inválidos.");
      }

      toast.success("Login realizado com sucesso!");
      setLocation("/dashboard");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível realizar o login.");
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const requestRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notRobot || !captchaAnswer.trim()) {
      toast.error("Marque “Não sou um robô” e resolva a verificação.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_reset",
          email: recoveryEmail,
          captchaToken: captcha.token,
          captchaAnswer,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || "Não foi possível solicitar a recuperação."
        );
      }
      setRecoverySent(true);
      toast.success(result.message || "Verifique seu e-mail.");
    } catch (error: any) {
      toast.error(
        error?.message || "Não foi possível solicitar a recuperação."
      );
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const resetCommercialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordValid) {
      toast.error("A nova senha ainda não atende aos requisitos.");
      return;
    }
    if (!resetPasswordsMatch) {
      toast.error("As duas senhas precisam ser iguais.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset_password",
          token: resetToken,
          password: newPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível alterar a senha.");
      }
      setResetDone(true);
      toast.success(result.message || "Senha alterada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível alterar a senha.");
    } finally {
      setIsLoading(false);
    }
  };

  const captchaBox = (
    <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={notRobot}
          onChange={e => setNotRobot(e.target.checked)}
          disabled={isLoading}
          className="h-5 w-5"
        />
        Não sou um robô
      </label>
      {notRobot ? (
        <div>
          <Label htmlFor="captcha">Verificação: {captcha.question}</Label>
          <Input
            id="captcha"
            inputMode="numeric"
            autoComplete="off"
            value={captchaAnswer}
            onChange={e => setCaptchaAnswer(e.target.value)}
            disabled={isLoading}
            className="mt-2"
            required
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/brand/note-note-logo-official.png"
            alt="Note Note"
            className="mx-auto mb-4 w-full max-w-sm object-contain"
          />
          <p className="text-gray-600 mt-2">Sistema de Gestão Financeira</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>
              {resetToken
                ? "Criar nova senha"
                : showRecovery
                  ? "Recuperar senha"
                  : "Bem-vindo"}
            </CardTitle>
            <CardDescription>
              {resetToken
                ? "Defina uma nova senha para sua conta comercial do Note Note."
                : showRecovery
                  ? "Clientes que contrataram pelo site podem recuperar a senha pelo e-mail cadastrado."
                  : "Entre com seu usuário e senha do Note Note."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {resetToken ? (
              resetDone ? (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Senha alterada</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sua nova senha já pode ser usada para entrar no Note Note.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => setLocation("/login")}
                  >
                    Ir para o login
                  </Button>
                </div>
              ) : (
                <form onSubmit={resetCommercialPassword} className="space-y-4">
                  <div>
                    <Label htmlFor="new-password">Nova senha</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      className="mt-2"
                    />
                    <div className="mt-3 grid gap-1 text-xs">
                      <span
                        className={
                          resetRules.length
                            ? "text-emerald-700"
                            : "text-slate-500"
                        }
                      >
                        ✓ Mínimo 8 caracteres
                      </span>
                      <span
                        className={
                          resetRules.uppercase
                            ? "text-emerald-700"
                            : "text-slate-500"
                        }
                      >
                        ✓ Pelo menos 1 letra maiúscula
                      </span>
                      <span
                        className={
                          resetRules.number
                            ? "text-emerald-700"
                            : "text-slate-500"
                        }
                      >
                        ✓ Pelo menos 1 número
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirm-new-password">
                      Confirmar nova senha
                    </Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={e => setConfirmNewPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      className="mt-2"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Alterar senha"
                    )}
                  </Button>
                </form>
              )
            ) : showRecovery ? (
              recoverySent ? (
                <div className="space-y-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <Mail className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      Confira seu e-mail
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Se o endereço estiver vinculado a uma conta comercial,
                      você receberá um link válido por 30 minutos para criar uma
                      nova senha.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowRecovery(false);
                      setRecoverySent(false);
                      resetCaptcha();
                    }}
                  >
                    Voltar para login
                  </Button>
                </div>
              ) : (
                <form onSubmit={requestRecovery} className="space-y-4">
                  <div>
                    <Label htmlFor="recovery-email">E-mail cadastrado</Label>
                    <Input
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      value={recoveryEmail}
                      onChange={e => setRecoveryEmail(e.target.value)}
                      placeholder="voce@email.com"
                      disabled={isLoading}
                      required
                      className="mt-2"
                    />
                  </div>
                  {captchaBox}
                  <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      A recuperação por e-mail é destinada às contas contratadas
                      pelo site. O link expira em 30 minutos e só pode ser usado
                      uma vez.
                    </span>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar link de recuperação"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowRecovery(false);
                      resetCaptcha();
                    }}
                  >
                    Voltar para login
                  </Button>
                </form>
              )
            ) : pendingPayment ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    {pendingPayment.billingMethod === "pix_annual" ? (
                      <QrCode className="h-7 w-7" />
                    ) : (
                      <CreditCard className="h-7 w-7" />
                    )}
                  </div>
                  <p className="mt-4 text-lg font-black text-slate-900">
                    Continue de onde parou
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Seu cadastro já está salvo, mas o primeiro acesso só será
                    liberado depois que todas as etapas de pagamento forem
                    concluídas.
                  </p>
                </div>
                <div className="rounded-xl border bg-white p-4 text-sm">
                  <p>
                    <strong>Plano:</strong>{" "}
                    {String(pendingPayment.plan || "").toUpperCase()}
                  </p>
                  <p className="mt-1">
                    <strong>Etapa:</strong>{" "}
                    {pendingPayment.billingMethod === "pix_annual"
                      ? "Pagamento anual via Pix"
                      : "Cadastro/validação do cartão"}
                  </p>
                  <p className="mt-1">
                    <strong>Status:</strong>{" "}
                    {pendingPayment.providerStatus ||
                      pendingPayment.status ||
                      "Pendente"}
                  </p>
                </div>
                {pendingPayment.billingMethod === "pix_annual" &&
                pendingPayment.pixQrCodeBase64 ? (
                  <img
                    src={`data:image/png;base64,${pendingPayment.pixQrCodeBase64}`}
                    alt="QR Code Pix"
                    className="mx-auto h-56 w-56 rounded-xl border bg-white p-2"
                  />
                ) : null}
                {pendingPayment.billingMethod === "pix_annual" &&
                pendingPayment.pixQrCode ? (
                  <div className="space-y-2">
                    <Label>Código Pix copia e cola</Label>
                    <Input
                      readOnly
                      value={pendingPayment.pixQrCode}
                      onFocus={e => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        navigator.clipboard.writeText(pendingPayment.pixQrCode)
                      }
                    >
                      Copiar código Pix
                    </Button>
                  </div>
                ) : null}
                {pendingPayment.checkoutUrl ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() =>
                      (window.location.href = pendingPayment.checkoutUrl)
                    }
                  >
                    {pendingPayment.billingMethod === "pix_annual"
                      ? "Abrir cobrança no Asaas"
                      : "Continuar cadastro do cartão"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPendingPayment(null);
                    resetCaptcha();
                  }}
                >
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="username">Usuário</Label>
                    <Input
                      id="username"
                      autoComplete="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                    />
                    Lembrar-me neste dispositivo por 30 dias
                  </label>

                  {captchaBox}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="link"
                  className="w-full text-blue-600"
                  onClick={() => {
                    setShowRecovery(true);
                    resetCaptcha();
                  }}
                >
                  Esqueci minha senha
                </Button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Novo cliente
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-center">
                  <p className="text-sm font-semibold text-slate-800">
                    Novo no Note Note?
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Crie uma conta grátis com 1 banco de dados ou escolha um
                    plano sem anúncios.
                  </p>
                  <Link href="/planos">
                    <a className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                      Cadastre-se grátis
                    </a>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
