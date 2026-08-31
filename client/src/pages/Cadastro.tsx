import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Copy, Eye, EyeOff, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

const plans = {
  basic: {
    name: "Basic",
    monthly: "R$ 29,90/mês",
    annualPix: "R$ 199,90/ano",
    savings: "R$ 158,90",
    databaseAccess: "1 banco de dados",
  },
  plus: {
    name: "Plus",
    monthly: "R$ 49,90/mês",
    annualPix: "R$ 399,90/ano",
    savings: "R$ 198,90",
    databaseAccess: "até 3 bancos de dados",
  },
} as const;

type PlanId = keyof typeof plans;
type BillingMethod = "card_monthly" | "pix_annual";
type PixInfo = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
};

function readSelectedPlan(): PlanId | null {
  const query = new URLSearchParams(window.location.search).get("plano")?.toLowerCase();
  if (query === "basic" || query === "plus") return query;
  try {
    const stored = window.sessionStorage.getItem("notenote:selected-plan");
    if (stored === "basic" || stored === "plus") return stored;
  } catch {}
  return null;
}

function readBillingMethod(): BillingMethod {
  const query = new URLSearchParams(window.location.search).get("cobranca")?.toLowerCase();
  if (query === "pix_annual") return "pix_annual";
  if (query === "card_monthly") return "card_monthly";
  try {
    if (window.sessionStorage.getItem("notenote:selected-billing") === "pix_annual") return "pix_annual";
  } catch {}
  return "card_monthly";
}

function formatWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function validCpf(value: string) {
  const cpf = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    return digit === 10 ? 0 : digit;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function validFullName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function validWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits[2] === "9" && digits[0] !== "0";
}

export default function Cadastro() {
  const plan = useMemo(readSelectedPlan, []);
  const [billingMethod, setBillingMethod] = useState<BillingMethod>(() => readBillingMethod());
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [pixInfo, setPixInfo] = useState<PixInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notRobot, setNotRobot] = useState(false);
  const [captcha, setCaptcha] = useState({ question: "", token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const refreshCaptcha = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/captcha", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result?.success) setCaptcha({ question: result.question, token: result.token });
    } catch {}
  }, []);

  useEffect(() => { void refreshCaptcha(); }, [refreshCaptcha]);

  const passwordRules = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const fullNameValid = validFullName(name);
  const whatsappValid = validWhatsapp(whatsapp);
  const cpfValid = validCpf(cpf);
  const selectedPrice = plan ? (billingMethod === "pix_annual" ? plans[plan].annualPix : plans[plan].monthly) : "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!plan) return setError("Escolha um plano antes de criar o cadastro.");
    if (!fullNameValid) return setError("Informe seu nome e sobrenome completos.");
    if (!whatsappValid) return setError("Informe um WhatsApp brasileiro válido com DDD e número iniciado por 9.");
    if (billingMethod === "pix_annual" && !cpfValid) return setError("Informe um CPF válido para gerar o Pix do Asaas.");
    if (!passwordValid) return setError("A senha ainda não atende aos requisitos obrigatórios.");
    if (!passwordsMatch) return setError("As duas senhas precisam ser iguais.");
    if (!notRobot || !captchaAnswer.trim()) return setError("Confirme que você não é um robô e resolva a verificação.");

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register-commercial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), username: username.trim(), email: email.trim(), whatsapp, cpf, password,
          plan, billingMethod, captchaToken: captcha.token, captchaAnswer,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível concluir o cadastro.");

      const paymentUrl = String(result?.subscription?.checkoutUrl ?? "").trim();
      if (billingMethod === "pix_annual") {
        const pix = result?.subscription?.pix as PixInfo | undefined;
        if (!pix?.qrCode) throw new Error("Cadastro criado, mas o Asaas não retornou o QR Code Pix.");
        setCheckoutUrl(paymentUrl);
        setPixInfo(pix);
        setSuccess(true);
        return;
      }

      if (!paymentUrl.startsWith("https://")) throw new Error("Cadastro criado, mas o Asaas não retornou o link de pagamento.");
      setCheckoutUrl(paymentUrl);
      setSuccess(true);
      window.location.assign(paymentUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
      setCaptchaAnswer("");
      void refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const copyPix = async () => {
    if (!pixInfo?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixInfo.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código Pix abaixo e copie manualmente.");
    }
  };

  if (success && plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-sky-100 px-4 py-10">
        <div className="mx-auto max-w-lg">
          <img src="/brand/note-note-logo-official.png" alt="Note Note" className="mx-auto mb-8 h-14 w-auto" />
          <Card className="border-emerald-200 shadow-xl">
            <CardContent className="p-8 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
              <h1 className="mt-5 text-2xl font-black text-slate-950">Cadastro realizado</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600"><strong>{name.trim()}</strong>, você escolheu o plano <strong>{plans[plan].name}</strong> — {selectedPrice}.</p>

              {billingMethod === "pix_annual" && pixInfo ? (
                <div className="mt-6 text-left">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                    <strong>Seu Pix anual foi gerado pelo Asaas.</strong> Você continua com os 7 dias grátis. Se pagar durante o teste, os 12 meses começam após o fim dos 7 dias.
                  </div>

                  <div className="mt-5 rounded-2xl border bg-white p-5 text-center shadow-sm">
                    <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700"><QrCode className="h-4 w-4" />Pix Asaas</div>
                    <p className="mt-3 text-3xl font-black text-slate-950">{plans[plan].annualPix}</p>
                    <p className="mt-1 text-xs text-slate-500">Pagamento anual à vista</p>

                    {pixInfo.qrCodeBase64 ? (
                      <img src={`data:image/png;base64,${pixInfo.qrCodeBase64}`} alt="QR Code Pix Asaas" className="mx-auto mt-5 h-56 w-56 rounded-xl border bg-white p-2" />
                    ) : null}

                    <Label htmlFor="pix-copy" className="mt-5 block text-left">Pix Copia e Cola</Label>
                    <textarea id="pix-copy" readOnly value={pixInfo.qrCode} className="mt-2 h-24 w-full resize-none rounded-xl border bg-slate-50 p-3 text-xs text-slate-700" />
                    <Button type="button" onClick={copyPix} className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700">
                      <Copy className="mr-2 h-4 w-4" />{copied ? "Código copiado" : "Copiar Pix"}
                    </Button>

                    {checkoutUrl.startsWith("https://") ? <a href={checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl border border-emerald-200 px-5 font-bold text-emerald-700 transition hover:bg-emerald-50">Abrir cobrança no Asaas</a> : null}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-left text-sm text-blue-950">
                  Você tem 7 dias grátis. Cadastre seu cartão no checkout seguro do Asaas; a primeira cobrança mensal está programada para depois do período de teste.
                </div>
              )}

              {billingMethod === "card_monthly" && checkoutUrl && <a href={checkoutUrl} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 font-bold text-white transition hover:bg-blue-700">Continuar no Asaas</a>}
              <Link href="/login"><a className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl border border-blue-200 px-5 font-bold text-blue-700 transition hover:bg-blue-50">Ir para o login</a></Link>
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
          <Link href="/planos"><a className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4" />Voltar aos planos</a></Link>
          <img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-10 w-auto" />
        </div>

        <Card className="border-blue-100 shadow-2xl shadow-blue-900/10">
          <CardHeader>
            <CardTitle className="text-2xl">Crie sua conta e teste por 7 dias</CardTitle>
            <CardDescription>Cadastre-se, escolha cartão mensal ou Pix anual e use o Note Note gratuitamente durante o período de teste.</CardDescription>
          </CardHeader>
          <CardContent>
            {plan ? (
              <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Plano escolhido</p><p className="mt-1 text-lg font-black text-slate-950">{plans[plan].name}</p></div><p className="font-extrabold text-blue-700">{selectedPrice}</p></div>
                <p className="mt-3 border-t border-blue-200 pt-3 text-sm font-semibold text-blue-950">Inclui {plans[plan].databaseAccess}. 7 dias grátis para novos usuários.</p>
              </div>
            ) : <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Nenhum plano foi selecionado. <Link href="/planos"><a className="font-bold underline">Escolha Basic ou Plus</a></Link>.</div>}

            {plan && (
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setBillingMethod("card_monthly")} className={`rounded-2xl border p-4 text-left transition ${billingMethod === "card_monthly" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white"}`}>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-blue-600">Cartão mensal</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{plans[plan].monthly}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">Primeira cobrança após os 7 dias grátis.</p>
                </button>
                <button type="button" onClick={() => setBillingMethod("pix_annual")} className={`rounded-2xl border p-4 text-left transition ${billingMethod === "pix_annual" ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white"}`}>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">Pix anual</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{plans[plan].annualPix}</p>
                  <p className="mt-2 text-xs font-bold text-emerald-700">Economize {plans[plan].savings} no ano</p>
                  <p className="mt-1 text-xs text-slate-600">QR Code gerado pelo Asaas.</p>
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div><Label htmlFor="signup-name">Nome e Sobrenome</Label><Input id="signup-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="ex.: João da Silva" maxLength={200} required disabled={loading} className="mt-2" />{name && !fullNameValid && <p className="mt-1 text-xs text-rose-600">Informe pelo menos nome e sobrenome.</p>}</div>
              <div><Label htmlFor="signup-username">Nome de usuário</Label><Input id="signup-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="ex.: joaosilva" minLength={3} maxLength={40} required disabled={loading} className="mt-2" /></div>
              <div><Label htmlFor="signup-email">E-mail</Label><Input id="signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="voce@email.com" required disabled={loading} className="mt-2" /></div>
              <div><Label htmlFor="signup-whatsapp">WhatsApp</Label><Input id="signup-whatsapp" type="tel" value={whatsapp} onChange={e => setWhatsapp(formatWhatsapp(e.target.value))} autoComplete="tel" placeholder="(24) 99999-9999" required disabled={loading} className="mt-2" />{whatsapp && !whatsappValid && <p className="mt-1 text-xs text-rose-600">Informe DDD + celular iniciado por 9.</p>}</div>

              {billingMethod === "pix_annual" && (
                <div>
                  <Label htmlFor="signup-cpf">CPF do pagador</Label>
                  <Input id="signup-cpf" value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required disabled={loading} className="mt-2" />
                  <p className={`mt-1 text-xs ${cpf && !cpfValid ? "text-rose-600" : "text-muted-foreground"}`}>O Asaas usa o CPF para criar o pagador e gerar o Pix. O Note Note não salva esse CPF no cadastro local.</p>
                </div>
              )}

              <div><Label htmlFor="signup-password">Senha</Label><div className="relative mt-2"><Input id="signup-password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required disabled={loading} className="pr-11" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><div className="mt-3 grid gap-2 text-xs sm:grid-cols-3"><div className={passwordRules.length ? "text-emerald-700" : "text-slate-500"}>✓ Mínimo 8 caracteres</div><div className={passwordRules.uppercase ? "text-emerald-700" : "text-slate-500"}>✓ 1 letra maiúscula</div><div className={passwordRules.number ? "text-emerald-700" : "text-slate-500"}>✓ 1 número</div></div></div>
              <div><Label htmlFor="signup-confirm-password">Confirmar senha</Label><Input id="signup-confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required disabled={loading} className="mt-2" />{confirmPassword && <p className={`mt-1 text-xs ${passwordsMatch ? "text-emerald-700" : "text-rose-600"}`}>{passwordsMatch ? "As senhas são iguais." : "As senhas ainda não são iguais."}</p>}</div>

              <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={notRobot} onChange={e => setNotRobot(e.target.checked)} disabled={loading} className="h-5 w-5" />Não sou um robô</label>
                {notRobot && <div><Label htmlFor="signup-captcha">Verificação: {captcha.question}</Label><Input id="signup-captcha" inputMode="numeric" autoComplete="off" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} required disabled={loading} className="mt-2" /></div>}
              </div>

              {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>}

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />7 dias grátis</div><p className="mt-1">No cartão, a primeira cobrança é após o teste. No Pix anual, o QR Code fica disponível durante os 7 dias e o período anual começa depois do teste quando o pagamento for confirmado.</p></div>

              <Button type="submit" className="h-12 w-full text-base font-bold" disabled={loading || !plan}>{loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Criando sua conta...</> : billingMethod === "pix_annual" ? "Começar teste e gerar Pix" : "Começar 7 dias grátis"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
