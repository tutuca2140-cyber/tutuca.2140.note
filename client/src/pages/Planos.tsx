import { ArrowLeft, ArrowRight, Check, Crown, Sparkles } from "lucide-react";
import { Link } from "wouter";

const plans = [
  {
    id: "basic",
    name: "Basic",
    price: "29,90",
    description: "Para começar a organizar suas vendas, empréstimos e negociações no Note Note.",
    badge: "Plano de entrada",
    databaseAccess: "1 banco de dados exclusivo",
    automaticCreation: "Criado automaticamente após a aprovação da conta como Principal - seu usuário",
    featured: false,
    icon: Sparkles,
  },
  {
    id: "plus",
    name: "Plus",
    price: "49,90",
    description: "Para quem precisa separar operações e trabalhar com mais de um banco dentro do Note Note.",
    badge: "Mais completo",
    databaseAccess: "3 bancos de dados exclusivos",
    automaticCreation: "Criados automaticamente após a aprovação: Principal - seu usuário, #2 e #3",
    featured: true,
    icon: Crown,
  },
] as const;

function choosePlan(planId: "basic" | "plus") {
  try {
    window.sessionStorage.setItem("notenote:selected-plan", planId);
  } catch {
    // O parâmetro da URL continua preservando a escolha caso o storage esteja indisponível.
  }
  window.location.href = `/cadastro?plano=${planId}`;
}

export default function Planos() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/70 to-sky-100/70 text-slate-950">
      <header className="border-b border-blue-100/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/">
            <a className="flex items-center">
              <img
                src="/brand/note-note-logo-official.png"
                alt="Note Note"
                className="h-11 w-auto max-w-[190px] object-contain"
              />
            </a>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/">
              <a className="hidden items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 sm:inline-flex">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </a>
            </Link>
            <Link href="/login">
              <a className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Login
                <ArrowRight className="h-4 w-4" />
              </a>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -right-28 top-40 h-96 w-96 rounded-full bg-sky-200/50 blur-3xl" />

        <section className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
              Planos Note Note
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Escolha o plano ideal para você
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Você não precisa configurar o banco do zero. Depois da aprovação da assinatura, o Note Note cria automaticamente os bancos incluídos no seu plano e eles já ficam vinculados à sua conta.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
            {plans.map(plan => {
              const Icon = plan.icon;
              return (
                <article
                  key={plan.id}
                  className={`relative overflow-hidden rounded-[2rem] border bg-white p-7 shadow-xl transition hover:-translate-y-1 sm:p-9 ${
                    plan.featured
                      ? "border-blue-500 shadow-blue-600/15"
                      : "border-slate-200 shadow-slate-900/5"
                  }`}
                >
                  {plan.featured && (
                    <div className="absolute right-0 top-0 rounded-bl-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white">
                      Destaque
                    </div>
                  )}

                  <div className={`flex h-13 w-13 items-center justify-center rounded-2xl ${plan.featured ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
                    <Icon className="h-6 w-6" />
                  </div>

                  <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-blue-600">
                    {plan.badge}
                  </p>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">{plan.name}</h2>

                  <div className="mt-6 flex items-end gap-2">
                    <span className="pb-1 text-lg font-bold text-slate-500">R$</span>
                    <span className="text-5xl font-black tracking-tight text-slate-950">
                      {plan.price}
                    </span>
                    <span className="pb-2 text-sm font-semibold text-slate-500">/mês</span>
                  </div>

                  <p className="mt-5 min-h-14 text-sm leading-6 text-slate-600">
                    {plan.description}
                  </p>

                  <div className="mt-7 space-y-3 border-y border-slate-100 py-6 text-sm text-slate-700">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </span>
                      <div>
                        <strong>{plan.databaseAccess}</strong>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{plan.automaticCreation}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </span>
                      Bancos editáveis pela área Meu Banco
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </span>
                      Acesso ao Note Note após aprovação da assinatura
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </span>
                      Cobrança mensal
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-4 w-4" />
                      </span>
                      Cadastro com e-mail, usuário e senha
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => choosePlan(plan.id)}
                    className={`mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-extrabold transition ${
                      plan.featured
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                        : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    Escolher {plan.name}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-blue-100 bg-white/80 p-5 text-center text-sm leading-6 text-slate-600 shadow-sm">
            <strong className="text-slate-900">Criação automática incluída:</strong> o Basic recebe o banco <strong>Principal - seu usuário</strong>. No Plus, o sistema cria também <strong>Principal - seu usuário #2</strong> e <strong>Principal - seu usuário #3</strong>. Depois você pode editar os nomes normalmente.
          </div>

          <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-6 text-slate-500">
            A quantidade de bancos é aplicada somente às contas comerciais. Usuários gratuitos e de teste criados diretamente pelo Super Admin continuam separados do fluxo de assinatura.
          </p>
        </section>
      </main>
    </div>
  );
}
