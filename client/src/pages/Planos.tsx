import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Crown,
  Gift,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";

const plans = [
  {
    id: "barber",
    name: "Barbearia Essencial",
    monthlyPrice: "16,90",
    annualPixPrice: "141,96",
    annualSavings: "60,84",
    description:
      "Agenda online e gestão exclusiva para barbeiros e barbearias.",
    badge: "Para barbearias",
    databaseAccess: "Interface exclusiva de barbearia",
    automaticCreation:
      "Cadastre sua barbearia e compartilhe seu link de agendamento",
    userAccess: "Cadastro de até 3 barbeiros",
    permissionBenefit: "Caixa, pagamentos e taxas de cartão",
    featured: false,
    icon: Sparkles,
  },
  {
    id: "barber8",
    name: "Barbearia Equipe",
    monthlyPrice: "25,90",
    annualPixPrice: "217,56",
    annualSavings: "93,24",
    description:
      "Para barbearias com uma equipe maior, mantendo agenda, comandas e faturamento organizados.",
    badge: "Até 8 barbeiros",
    databaseAccess: "Interface exclusiva de barbearia",
    automaticCreation:
      "Página personalizada e link público para agendamentos",
    userAccess: "Cadastro de até 8 barbeiros",
    permissionBenefit: "Caixa, pagamentos, comandas e taxas de cartão",
    featured: false,
    icon: Crown,
  },
  {
    id: "free",
    name: "Grátis",
    monthlyPrice: "0",
    annualPixPrice: null,
    annualSavings: null,
    description: "Para começar a organizar sua operação sem informar cartão.",
    badge: "Comece agora",
    databaseAccess: "1 banco de dados exclusivo",
    automaticCreation: "Criado automaticamente no primeiro acesso",
    userAccess: "Uso individual",
    permissionBenefit: "Comece agora e organize sua operação",
    featured: false,
    icon: Gift,
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: "29,90",
    annualPixPrice: "199,90",
    annualSavings: "158,90",
    description:
      "Para quem quer organizar sua própria operação no Note Note com acesso individual.",
    badge: "Plano individual",
    databaseAccess: "1 banco de dados exclusivo",
    automaticCreation:
      "Criado automaticamente no primeiro login após a aprovação da conta como Principal - seu usuário",
    userAccess: "Uso individual: somente o próprio contratante",
    permissionBenefit:
      "Ideal para quem não precisa dividir o sistema com outra pessoa",
    featured: false,
    icon: Sparkles,
  },
  {
    id: "plus",
    name: "Plus",
    monthlyPrice: "49,90",
    annualPixPrice: "399,90",
    annualSavings: "198,90",
    description:
      "Para quem precisa separar operações e também dividir o trabalho com uma equipe de confiança.",
    badge: "Mais completo",
    databaseAccess: "3 bancos de dados exclusivos",
    automaticCreation:
      "Criados automaticamente no primeiro login após a aprovação: Principal - seu usuário, #2 e #3",
    userAccess: "Até 5 usuários adicionais cadastrados pelo contratante",
    permissionBenefit:
      "Defina bancos e permissões diferentes para cada usuário",
    featured: true,
    icon: Crown,
  },
] as const;
const BARBER_PLAN_SALES_ENABLED = true;
type PlanId = "barber" | "barber8" | "free" | "basic" | "plus";
type BillingMethod = "free" | "card_monthly" | "pix_annual";
function choosePlan(planId: PlanId, billingMethod: BillingMethod) {
  const selectedPlan = planId === "barber8" ? "barber" : planId;
  const barberLimit = planId === "barber8" ? 8 : 3;
  try {
    window.sessionStorage.setItem("notenote:selected-plan", selectedPlan);
    window.sessionStorage.setItem("notenote:selected-billing", billingMethod);
  } catch {}
  window.location.href = `/cadastro?plano=${selectedPlan}&cobranca=${billingMethod}${selectedPlan === "barber" ? `&barbeiros=${barberLimit}` : ""}`;
}
export default function Planos() {
  const barberMode =
    new URLSearchParams(window.location.search).get("modo") === "barbearia";
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/70 to-sky-100/70 text-slate-950">
      <header className="border-b border-blue-100/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/">
            <a>
              <img
                src="/brand/note-note-logo-official.png"
                alt="Note Note"
                className="h-11 w-auto max-w-[190px] object-contain"
              />
            </a>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/">
              <a className="hidden items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </a>
            </Link>
            <Link href="/login">
              <a className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white">
                Login <ArrowRight className="h-4 w-4" />
              </a>
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-bold text-blue-700">
              {barberMode ? "Planos para Barbearias" : "Planos Note Note"}
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
              {barberMode
                ? "Gestão completa para sua barbearia"
                : "Escolha o plano ideal para sua operação"}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              {barberMode ? (
                <>Agenda, equipe, clientes, comandas e pagamentos em uma interface feita para barbearias. Escolha pagar mensalmente no cartão ou anualmente no Pix com <strong>30% de desconto</strong>.</>
              ) : (
                <>Novos usuários elegíveis têm <strong>7 dias grátis</strong>. O plano mensal não possui fidelidade e pode ser cancelado a qualquer momento.</>
              )}
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-7xl gap-6 md:grid-cols-2 xl:grid-cols-3">
            {plans
              .filter(
                plan => {
                  const isBarber = plan.id === "barber" || plan.id === "barber8";
                  return barberMode ? isBarber : BARBER_PLAN_SALES_ENABLED || !isBarber;
                },
              )
              .map(plan => {
              const Icon = plan.icon;
              const isBarberPlan = plan.id === "barber" || plan.id === "barber8";
              return (
                <article
                  key={plan.id}
                  id={isBarberPlan ? `plano-${plan.id === "barber8" ? 8 : 3}` : undefined}
                  className={`relative overflow-hidden rounded-[2rem] border bg-white p-7 shadow-xl sm:p-8 ${plan.featured ? "border-blue-500 shadow-blue-600/15" : isBarberPlan ? "border-indigo-300 shadow-indigo-600/10" : "border-slate-200"}`}
                >
                  {plan.featured && (
                    <div className="absolute right-0 top-0 rounded-bl-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">
                      Destaque
                    </div>
                  )}
                  <div
                    className={`flex h-13 w-13 items-center justify-center rounded-2xl ${plan.featured ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-6 text-sm font-bold uppercase tracking-[.16em] text-blue-600">
                    {plan.badge}
                  </p>
                  <h2 className="mt-2 text-3xl font-black">{plan.name}</h2>
                  <div className="mt-6 flex items-end gap-2">
                    <span className="pb-1 text-lg font-bold text-slate-500">
                      R$
                    </span>
                    <span className="text-5xl font-black">
                      {plan.monthlyPrice}
                    </span>
                    <span className="pb-2 text-sm font-semibold text-slate-500">
                      /mês
                    </span>
                  </div>
                  {plan.id !== "free" && !isBarberPlan ? (
                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-extrabold uppercase text-emerald-700">
                        Pix anual
                      </p>
                      <p className="mt-1 text-2xl font-black text-emerald-950">
                        R$ {plan.annualPixPrice}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-emerald-800">
                        12 meses de acesso · economia de R$ {plan.annualSavings}
                      </p>
                    </div>
                  ) : isBarberPlan ? (
                    <div className="mt-5 space-y-3">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="flex items-center gap-2 text-xs font-extrabold uppercase text-blue-700">
                          <CreditCard className="h-4 w-4" /> Cartão mensal
                        </p>
                        <p className="mt-1 text-xl font-black text-blue-950">R$ {plan.monthlyPrice}/mês</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-extrabold uppercase text-emerald-700">Pix anual · 30% de desconto</p>
                        <p className="mt-1 text-2xl font-black text-emerald-950">R$ {plan.annualPixPrice}</p>
                        <p className="mt-2 text-xs font-bold text-emerald-800">Você economiza R$ {plan.annualSavings}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-extrabold uppercase text-blue-700">
                        Sem cobrança
                      </p>
                      <p className="mt-1 text-2xl font-black text-blue-950">
                        Sem cartão
                      </p>
                      <p className="mt-2 text-xs font-semibold text-blue-800">
                        Comece a usar o Note Note agora
                      </p>
                    </div>
                  )}
                  <p className="mt-5 min-h-14 text-sm leading-6 text-slate-600">
                    {plan.description}
                  </p>
                  <div className="mt-7 space-y-3 border-y border-slate-100 py-6 text-sm text-slate-700">
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-emerald-600" />
                      <div>
                        <strong>{plan.databaseAccess}</strong>
                        <p className="text-xs text-slate-500">
                          {plan.automaticCreation}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-emerald-600" />
                      <div>
                        <strong>{plan.userAccess}</strong>
                        <p className="text-xs text-slate-500">
                          {plan.permissionBenefit}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Check className="h-5 w-5 text-emerald-600" />
                      {plan.id === "free"
                        ? "Acesso grátis contínuo"
                        : "7 dias de teste grátis"}
                    </div>
                    <div className="flex gap-3">
                      <Check className="h-5 w-5 text-emerald-600" />
                      {plan.id === "free"
                        ? "Sem cartão e sem cobrança"
                        : isBarberPlan
                          ? "Mensal no cartão ou anual no Pix"
                          : "Mensal no cartão ou anual no Pix"}
                    </div>
                    {plan.id !== "free" && (
                      <div className="flex gap-3">
                        <Check className="h-5 w-5 text-emerald-600" />
                        Sem anúncios
                      </div>
                    )}
                  </div>
                  <div className="mt-7 grid gap-3">
                    {plan.id === "free" ? (
                      <button
                        onClick={() => choosePlan("free", "free")}
                        className="h-14 rounded-xl border border-blue-200 bg-blue-50 font-extrabold text-blue-700"
                      >
                        Criar conta grátis
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => choosePlan(plan.id, "card_monthly")}
                          className={`h-14 rounded-xl font-extrabold ${plan.featured ? "bg-blue-600 text-white" : "border border-blue-200 bg-blue-50 text-blue-700"}`}
                        >
                          {isBarberPlan
                            ? `Assinar no cartão — R$ ${plan.monthlyPrice}/mês`
                            : "Assinar mensal"}
                        </button>
                        <button
                          onClick={() => choosePlan(plan.id, "pix_annual")}
                          className="h-14 rounded-xl border border-emerald-300 bg-emerald-50 font-extrabold text-emerald-800"
                        >
                          Pagar no Pix — R$ {plan.annualPixPrice}
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-4 text-[11px] leading-4 text-slate-500">
                    {plan.id === "free"
                      ? "* O plano grátis não exige forma de pagamento."
                      : "* Novos usuários elegíveis têm 7 dias grátis. O plano mensal "}
                    {isBarberPlan ? (
                      <>
                        No cartão, a cobrança de R$ {plan.monthlyPrice} é mensal. No Pix anual, são 12 meses antecipados com 30% de desconto.
                      </>
                    ) : plan.id !== "free" && (
                      <>
                        não possui fidelidade e pode ser cancelado a qualquer
                        momento, ressalvados valores já vencidos e ciclos de
                        cobrança já iniciados. O plano anual via Pix corresponde
                        a 12 meses pagos antecipadamente.
                      </>
                    )}
                  </p>
                </article>
              );
              })}
          </div>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-blue-100 bg-white/80 p-5 text-center text-sm leading-6 text-slate-600">
            <strong className="text-slate-900">Condição de contratação:</strong>{" "}
            {barberMode
              ? "O pagamento anual no Pix libera 12 meses de acesso e já inclui 30% de desconto sobre o total mensal."
              : "7 dias de teste grátis para elegíveis. O plano mensal não possui fidelidade e pode ser cancelado a qualquer momento. Direitos obrigatórios do consumidor permanecem preservados."}
          </div>
        </section>
      </main>
    </div>
  );
}
