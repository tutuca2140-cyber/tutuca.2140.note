import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

const plans = {
  basic: { name: "Basic", price: "R$ 29,90/mês" },
  plus: { name: "Plus", price: "R$ 49,90/mês" },
} as const;

type PlanId = keyof typeof plans;

function readSelectedPlan(): PlanId | null {
  const query = new URLSearchParams(window.location.search).get("plano")?.toLowerCase();
  if (query === "basic" || query === "plus") return query;
  try {
    const stored = window.sessionStorage.getItem("notenote:selected-plan");
    if (stored === "basic" || stored === "plus") return stored;
  } catch {
    // segue sem seleção quando o storage não estiver disponível
  }
  return null;
}

export default function Cadastro() {
  const plan = useMemo(readSelectedPlan, []);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [captcha, setCaptcha] = useState({ question: "", token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const refreshCaptcha = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/captcha", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result?.success) {
        setCaptcha({ question: result.question, token: result.token });
      }
    } catch {
      // a mensagem de erro será exibida ao enviar caso a validação não esteja disponível
    }
  }, []);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  const passwordRules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!plan) {
      setError("Escolha um plano antes de criar o cadastro.");
      return;
    }
    if (!passwordValid) {
      setError("A senha ainda não atende aos requisitos obrigatórios.");
      return;
    }
    if (!passwordsMatch) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }
    if (!notRobot || !captchaAnswer.trim()) {
      setError("Confirme que você não é um robô e resolva a verificação.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register-commercial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
          plan,
          captchaToken: captcha.token,
          captchaAnswer,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Não foi possível concluir o cadastro.");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
      setCaptchaAnswer("");
      void refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (success && plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-sky-100 px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <img src="/brand/note-note-logo-official.png" alt="Note Note" className="mx-auto h-14 w-auto" />
          </div>
          <Card className="border-emerald-200 shadow-xl">
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-2xl font-black text-slate-950">Cadastro realizado</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Sua conta comercial foi criada para o plano <strong>{plans[plan].name}</strong> — {plans[plan].price}.
              </p>
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left text-sm text-blue-950">
                O acesso ao sistema permanece pendente até a confirmação da assinatura. Isso evita que o cadastro comercial libere o Note Note gratuitamente antes do pagamento.
              </div>
              <Link href="/planos">
                <a className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-blue-200 px-5 font-bold text-blue-700 transition hover:bg-blue-50">
                  Voltar aos planos
                </a>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/80 to-sky-100/80 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-7 flex items-center justify-between gap-4">
          <Link href="/planos">
            <a className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700">
              <ArrowLeft className="h-4 w-4" />
              Voltar aos planos
            </a>
          </Link>
          <img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-10 w-auto" />
        </div>

        <Card className="border-blue-100 shadow-2xl shadow-blue-900/10">
          <CardHeader>
            <CardTitle className="text-2xl">Criar cadastro para assinar</CardTitle>
            <CardDescription>
              Este cadastro é exclusivo para novos clientes que vão contratar um plano do Note Note.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan ? (
              <div className="mb-6 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Plano escolhido</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{plans[plan].name}</p>
                </div>
                <p className="font-extrabold text-blue-700">{plans[plan].price}</p>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Nenhum plano foi selecionado. <Link href="/planos"><a className="font-bold underline">Escolha Basic ou Plus</a></Link> antes de continuar.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="signup-username">Nome de usuário</Label>
                <Input
                  id="signup-username"
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="ex.: joaosilva"
                  minLength={3}
                  maxLength={40}
                  required
                  disabled={loading}
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">De 3 a 40 caracteres. Letras, números, ponto, hífen ou _.</p>
              </div>

              <div>
                <Label htmlFor="signup-email">E-mail</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="voce@email.com"
                  required
                  disabled={loading}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="signup-password">Senha</Label>
                <div className="relative mt-2">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={loading}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div className={passwordRules.length ? "text-emerald-700" : "text-slate-500"}>✓ Mínimo 8 caracteres</div>
                  <div className={passwordRules.uppercase ? "text-emerald-700" : "text-slate-500"}>✓ 1 letra maiúscula</div>
                  <div className={passwordRules.number ? "text-emerald-700" : "text-slate-500"}>✓ 1 número</div>
                </div>
              </div>

              <div>
                <Label htmlFor="signup-confirm-password">Confirmar senha</Label>
                <Input
                  id="signup-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={loading}
                  className="mt-2"
                />
                {confirmPassword && (
                  <p className={`mt-1 text-xs ${passwordsMatch ? "text-emerald-700" : "text-rose-600"}`}>
                    {passwordsMatch ? "As senhas são iguais." : "As senhas ainda não são iguais."}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={notRobot}
                    onChange={event => setNotRobot(event.target.checked)}
                    disabled={loading}
                    className="h-5 w-5"
                  />
                  Não sou um robô
                </label>
                {notRobot && (
                  <div>
                    <Label htmlFor="signup-captcha">Verificação: {captcha.question}</Label>
                    <Input
                      id="signup-captcha"
                      inputMode="numeric"
                      autoComplete="off"
                      value={captchaAnswer}
                      onChange={event => setCaptchaAnswer(event.target.value)}
                      disabled={loading}
                      required
                      className="mt-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p>
                  Este fluxo não altera as regras dos usuários gratuitos ou de teste criados pelo Super Admin. Ele cria somente contas comerciais vinculadas a uma futura assinatura.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-12 w-full" disabled={loading || !plan}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando cadastro...</> : "Criar cadastro"}
              </Button>

              <p className="text-center text-sm text-slate-500">
                Já possui acesso? <Link href="/login"><a className="font-bold text-blue-700 hover:underline">Entrar no Note Note</a></Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
