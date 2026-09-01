import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Cloud,
  HandCoins,
  Home as HomeIcon,
  KeyRound,
  Package,
  PlayCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

const features = [
  { title: "Clientes", description: "Cadastre clientes e acompanhe contatos, negociações e histórico.", icon: Users, iconClass: "bg-blue-50 text-blue-600" },
  { title: "Empréstimos", description: "Controle valores emprestados, juros, parcelas, pagamentos e saldo.", icon: HandCoins, iconClass: "bg-emerald-50 text-emerald-600" },
  { title: "Veículos", description: "Cadastre veículos, acompanhe negociações, vendas e financiamentos.", icon: CarFront, iconClass: "bg-violet-50 text-violet-600" },
  { title: "Produtos", description: "Organize produtos vendidos, valores, parcelamentos e recebimentos.", icon: Package, iconClass: "bg-orange-50 text-orange-600" },
  { title: "Imóveis", description: "Cadastre casas, apartamentos, terrenos e lojas, com endereço, área, cômodos, garagem, preço e outras informações.", icon: Building2, iconClass: "bg-indigo-50 text-indigo-600" },
  { title: "Aluguéis", description: "Selecione o imóvel e o cliente, defina aluguel, vencimento e acompanhe os recebimentos mensais.", icon: KeyRound, iconClass: "bg-teal-50 text-teal-600" },
  { title: "Pagamentos", description: "Registre pagamentos recebidos e acompanhe o que já foi quitado.", icon: WalletCards, iconClass: "bg-cyan-50 text-cyan-600" },
  { title: "Financiamentos", description: "Acompanhe vendas financiadas de veículos, produtos e imóveis, com parcelas, saldos e vencimentos.", icon: ClipboardList, iconClass: "bg-rose-50 text-rose-600" },
  { title: "Contas a receber", description: "Veja o que falta receber, o que venceu e o que está atrasado.", icon: CalendarClock, iconClass: "bg-sky-50 text-sky-600" },
  { title: "Caixa", description: "Tenha controle das entradas, saídas e do dinheiro disponível em toda a operação.", icon: Wallet, iconClass: "bg-amber-50 text-amber-600" },
  { title: "Relatórios", description: "Consulte indicadores e relatórios para entender melhor o seu negócio.", icon: BarChart3, iconClass: "bg-purple-50 text-purple-600" },
];

const benefits = [
  { title: "Organize seus rolos e negociações", description: "Tenha clientes, vendas, empréstimos, imóveis e acordos registrados e fáceis de encontrar.", icon: CheckCircle2 },
  { title: "Controle parcelas e recebimentos", description: "Saiba o que já recebeu, o que ainda falta e o que está vencido.", icon: CalendarClock },
  { title: "Acompanhe o dinheiro investido", description: "Veja quanto você colocou no negócio, quanto voltou e o que ainda está na rua.", icon: HandCoins },
  { title: "Administre imóveis e aluguéis", description: "Controle imóveis disponíveis, alugados, financiados, vendidos e os recebimentos de cada contrato.", icon: Building2 },
  { title: "Tenha visão do caixa", description: "Veja entradas, saídas e relatórios para tomar decisões com mais informação.", icon: TrendingUp },
];

const ads = [
  {
    eyebrow: "Empréstimos",
    title: "Emprestou? Saiba exatamente quanto falta voltar.",
    description: "Controle juros, parcelas, vencimentos, pagamentos e saldo de cada cliente sem depender de caderno.",
    icon: HandCoins,
    accent: "from-emerald-700 via-emerald-600 to-teal-500",
    visualTitle: "Empréstimo em dia",
    visualCaption: "Parcelas, juros e saldo sempre visíveis",
    metric: "R$ 18.450",
    metricLabel: "a receber",
  },
  {
    eyebrow: "Aluguel de imóveis",
    title: "Aluga casas, apartamentos ou lojas? O Note Note também é para você.",
    description: "Cadastre o imóvel e o inquilino, defina o valor e o vencimento e acompanhe aluguel pago, pendente ou atrasado mês a mês.",
    icon: KeyRound,
    accent: "from-teal-700 via-cyan-600 to-sky-500",
    visualTitle: "Gestão de aluguel",
    visualCaption: "Imóvel + inquilino + vencimento + recebimento",
    metric: "R$ 8.420",
    metricLabel: "aluguéis no mês",
  },
  {
    eyebrow: "Veículos",
    title: "Vendeu ou financiou um veículo? Acompanhe tudo.",
    description: "Cadastre o veículo, registre entrada, parcelas, recebimentos e acompanhe o financiamento até a quitação.",
    icon: CarFront,
    accent: "from-violet-700 via-indigo-600 to-blue-500",
    visualTitle: "Financiamento de veículo",
    visualCaption: "Entrada, parcelas, vencimentos e saldo",
    metric: "12x",
    metricLabel: "parcelas controladas",
  },
  {
    eyebrow: "Venda e financiamento de imóveis",
    title: "Casa, apartamento, terreno ou loja: venda e financie.",
    description: "Gerencie imóveis, compradores, entrada, juros, parcelas e recebimentos com integração ao caixa.",
    icon: Building2,
    accent: "from-blue-800 via-blue-700 to-sky-500",
    visualTitle: "Negócio imobiliário",
    visualCaption: "Venda à vista ou financiamento completo",
    metric: "100%",
    metricLabel: "integrado ao caixa",
  },
  {
    eyebrow: "Produtos",
    title: "Vendeu parcelado? Controle cada recebimento.",
    description: "Cadastre produtos, clientes, parcelas e pagamentos e veja tudo refletido no seu caixa.",
    icon: Package,
    accent: "from-orange-700 via-orange-600 to-amber-500",
    visualTitle: "Venda parcelada",
    visualCaption: "Produto, cliente e recebimentos organizados",
    metric: "24",
    metricLabel: "parcelas acompanhadas",
  },
  {
    eyebrow: "Caixa Geral",
    title: "Tudo que entra e sai do seu negócio em um só lugar.",
    description: "Empréstimos, vendas, financiamentos e aluguéis movimentam seu caixa para você enxergar a operação inteira.",
    icon: Wallet,
    accent: "from-slate-950 via-slate-900 to-blue-700",
    visualTitle: "Visão do caixa",
    visualCaption: "Entradas, saídas e recebimentos da operação",
    metric: "R$ 42.870",
    metricLabel: "movimentado",
  },
];

function AdVisual({ ad }: { ad: (typeof ads)[number] }) {
  const Icon = ad.icon;
  const isRental = ad.eyebrow === "Aluguel de imóveis";
  const isProperty = ad.eyebrow === "Venda e financiamento de imóveis";

  return (
    <div className="relative mx-auto w-full max-w-[430px]">
      <div className="absolute -inset-6 rounded-[2.4rem] bg-white/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/25 bg-white/15 p-5 shadow-2xl backdrop-blur-md sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg"><Icon className="h-6 w-6" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">Note Note</p><p className="font-extrabold text-white">{ad.visualTitle}</p></div>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white/80">Ao vivo</div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/20 bg-slate-950/25">
          <div className="relative h-40 sm:h-48">
            <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-slate-950/20" />
            {(isRental || isProperty) ? (
              <div className="absolute inset-0 flex items-end justify-center">
                <div className="relative mb-4 flex h-28 w-[78%] items-end justify-center rounded-t-[2rem] border border-white/30 bg-white/15 backdrop-blur-sm">
                  <div className="absolute -top-7 left-1/2 h-16 w-16 -translate-x-1/2 rotate-45 rounded-lg border-l border-t border-white/30 bg-white/15" />
                  <HomeIcon className="relative mb-4 h-16 w-16 text-white" />
                  {isRental && <div className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-teal-700 shadow-lg"><KeyRound className="h-6 w-6" /></div>}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center"><div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/25 bg-white/15 shadow-xl"><Icon className="h-16 w-16 text-white" /></div></div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4 rounded-2xl bg-white p-4 text-slate-900 shadow-xl">
          <div><p className="text-xs font-semibold text-slate-500">{ad.visualCaption}</p><p className="mt-1 text-lg font-black">Controle centralizado</p></div>
          <div className="text-right"><p className="text-xl font-black text-blue-700">{ad.metric}</p><p className="text-[10px] font-semibold text-slate-500">{ad.metricLabel}</p></div>
        </div>
      </div>
    </div>
  );
}

function RotatingAds() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive(index => (index + 1) % ads.length), 4800);
    return () => window.clearInterval(id);
  }, []);

  const ad = ads[active];
  const Icon = ad.icon;

  return (
    <section aria-label="Destaques do Note Note" className="bg-white px-5 py-8 lg:px-8">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 shadow-xl">
        <div className={`relative min-h-[390px] overflow-hidden bg-gradient-to-br ${ad.accent} px-7 py-9 text-white sm:px-10 lg:px-14 lg:py-12`}>
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-slate-950/15 blur-3xl" />
          <div className="relative grid items-center gap-9 lg:grid-cols-[.95fr_1.05fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em]"><Icon className="h-4 w-4" /> {ad.eyebrow}</div>
              <h2 className="mt-5 max-w-3xl text-3xl font-black leading-tight sm:text-4xl">{ad.title}</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/85">{ad.description}</p>
              {ad.eyebrow === "Aluguel de imóveis" && <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold"><HomeIcon className="h-5 w-5" /> Ideal para quem possui imóveis e recebe aluguel.</div>}
              <Link href="/planos"><a className="mt-7 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-extrabold text-slate-900 shadow-lg transition hover:-translate-y-0.5">Conhecer o Note Note <ArrowRight className="h-4 w-4" /></a></Link>
            </div>
            <AdVisual ad={ad} />
          </div>
          <div className="relative mt-8 flex flex-wrap items-center gap-2">
            {ads.map((item, index) => <button key={item.eyebrow} type="button" aria-label={`Ver anúncio ${index + 1}: ${item.eyebrow}`} onClick={() => setActive(index)} className={`h-2.5 rounded-full transition-all ${index === active ? "w-9 bg-white" : "w-2.5 bg-white/40 hover:bg-white/70"}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoPanel() {
  return (
    <div className="relative mx-auto w-full max-w-[720px]">
      <div className="absolute -inset-8 rounded-[3rem] bg-blue-400/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-950 p-2 shadow-[0_35px_90px_-35px_rgba(15,23,42,0.45)]">
        <div className="overflow-hidden rounded-[1.3rem] bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><div className="flex items-center gap-2"><img src="/brand/note-note-icon.png" alt="" className="h-7 w-7" /><span className="font-semibold text-slate-900">Note Note</span></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">Demonstração do painel</span></div>
          <div className="grid min-h-[390px] grid-cols-[130px_1fr] sm:grid-cols-[155px_1fr]">
            <aside className="border-r border-slate-100 bg-slate-50 p-3"><div className="mb-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Painel</div>{["Clientes", "Empréstimos", "Veículos", "Produtos", "Imóveis", "Aluguéis", "Financiamentos", "Caixa", "Relatórios"].map(item => <div key={item} className="px-2 py-1.5 text-[10px] font-medium text-slate-500 sm:text-[11px]">{item}</div>)}</aside>
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-medium text-slate-400">Visão geral</p><h3 className="text-lg font-bold text-slate-900">Painel financeiro</h3></div><div className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] text-slate-500">Mês atual</div></div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[["A receber", "R$ 48.750", "24 parcelas"], ["Aluguéis", "R$ 8.420", "no mês"], ["Recebido", "R$ 22.180", "no mês"], ["Caixa", "R$ 12.450", "disponível"]].map(([label, value, note]) => <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><p className="text-[9px] font-medium text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p><p className="mt-1 text-[9px] text-slate-400">{note}</p></div>)}</div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
                <div className="rounded-xl border border-slate-100 p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] font-bold text-slate-800">Próximos recebimentos</p><span className="text-[9px] font-semibold text-blue-600">Ver todos</span></div>{[["Carlos Silva", "Empréstimo", "R$ 850"], ["Maria Oliveira", "Aluguel", "R$ 1.800"], ["João Santos", "Financiamento de imóvel", "R$ 2.250"], ["Ana Paula", "Venda financiada", "R$ 980"]].map(([name, type, value]) => <div key={name} className="flex items-center justify-between border-t border-slate-50 py-2 first:border-0"><div><p className="text-[10px] font-semibold text-slate-700">{name}</p><p className="text-[8px] text-slate-400">{type}</p></div><p className="text-[10px] font-bold text-slate-700">{value}</p></div>)}</div>
                <div className="rounded-xl border border-slate-100 p-3 shadow-sm"><p className="text-[11px] font-bold text-slate-800">Resumo financeiro</p><div className="mx-auto my-4 flex h-28 w-28 items-center justify-center rounded-full bg-[conic-gradient(#2563eb_0_35%,#22c55e_35%_68%,#f97316_68%_82%,#e2e8f0_82%_100%)]"><div className="h-16 w-16 rounded-full bg-white" /></div><div className="space-y-1.5 text-[9px] text-slate-500"><div className="flex justify-between"><span>Recebido</span><strong className="text-slate-700">R$ 22.180</strong></div><div className="flex justify-between"><span>A receber</span><strong className="text-slate-700">R$ 48.750</strong></div><div className="flex justify-between"><span>Aluguéis</span><strong className="text-slate-700">R$ 8.420</strong></div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="bg-slate-950 px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-[0.16em] text-white sm:text-sm">Fez um rolo? Deu negócio? <span className="text-sky-300">Controle seus recebimentos.</span></div>
      <header className="sticky top-0 z-50 border-b border-blue-100/70 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <a href="#inicio" className="flex items-center"><img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-11 w-auto max-w-[190px] object-contain" /></a>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-700 md:flex"><a href="#recursos" className="transition hover:text-blue-600">Recursos</a><a href="#imoveis" className="transition hover:text-blue-600">Imóveis</a><a href="#funcionalidades" className="transition hover:text-blue-600">Funcionalidades</a><a href="#sobre" className="transition hover:text-blue-600">Sobre</a><Link href="/planos"><a className="transition hover:text-blue-600">Planos</a></Link><a href="#suporte" className="transition hover:text-blue-600">Suporte</a></nav>
          <Link href="/login"><a className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">Login <ArrowRight className="h-4 w-4" /></a></Link>
        </div>
      </header>

      <main>
        <section id="inicio" className="relative overflow-hidden bg-gradient-to-br from-white via-blue-50/80 to-sky-100/80">
          <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" /><div className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-24">
            <div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm"><span className="text-blue-600">★</span>Feito para quem vende, empresta, aluga e negocia no dia a dia</div><h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-tight text-slate-950 sm:text-5xl lg:text-[64px]">Organize tudo o que movimenta o seu negócio <span className="text-blue-600">em um só lugar.</span></h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">O Note Note reúne clientes, empréstimos, veículos, produtos, imóveis, aluguéis, vendas financiadas, pagamentos, contas a receber, caixa e relatórios em uma única plataforma.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/planos"><a className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 text-base font-bold text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700">Ver planos <ArrowRight className="h-5 w-5" /></a></Link><a href="#recursos" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-7 text-base font-bold text-blue-700 shadow-sm transition hover:bg-blue-50"><PlayCircle className="h-5 w-5" />Ver como funciona</a></div><div className="mt-9 grid gap-3 text-sm font-medium text-slate-600 sm:grid-cols-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" /> Acesso por usuário</div><div className="flex items-center gap-2"><Cloud className="h-5 w-5 text-blue-600" /> Acesse pela internet</div><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-600" /> Simples de usar</div></div></div>
            <DemoPanel />
          </div>
        </section>

        <RotatingAds />

        <section id="recursos" className="scroll-mt-24 bg-white py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Seu negócio organizado</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Tudo o que você precisa para acompanhar seus negócios</h2><p className="mt-4 text-base leading-7 text-slate-600">Uma visão simples do que você vendeu, emprestou, alugou, financiou, recebeu e ainda tem para receber.</p></div><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(feature => { const Icon = feature.icon; return <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"><div className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.iconClass}`}><Icon className="h-6 w-6" /></div><h3 className="mt-4 text-base font-extrabold text-slate-900">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p></article>; })}</div></div></section>

        <section id="imoveis" className="scroll-mt-24 border-y border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50/60 py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr]"><div><div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Building2 className="h-7 w-7" /></div><p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Gestão de imóveis</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Venda, financie e alugue imóveis dentro do Note Note.</h2><p className="mt-5 text-base leading-8 text-slate-600">Cadastre o patrimônio, acompanhe o cliente, registre contratos e mantenha os recebimentos ligados ao seu caixa. O Note Note também foi pensado para quem possui imóveis e recebe aluguel.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Building2 className="h-6 w-6 text-blue-600"/><h3 className="mt-4 font-extrabold text-slate-900">Cadastro completo</h3><p className="mt-2 text-sm leading-6 text-slate-500">Casa, apartamento, terreno ou loja, com endereço, tamanho, cômodos, quartos, salas, cozinha, banheiros, garagem, preço e observações.</p></div><div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 shadow-sm"><KeyRound className="h-6 w-6 text-teal-700"/><h3 className="mt-4 font-extrabold text-slate-900">Para quem aluga imóveis</h3><p className="mt-2 text-sm leading-6 text-slate-600">Vincule imóvel e inquilino, defina valor e dia de pagamento e acompanhe mensalmente o que foi pago, pendente ou atrasado.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><ClipboardList className="h-6 w-6 text-violet-600"/><h3 className="mt-4 font-extrabold text-slate-900">Venda e financiamento</h3><p className="mt-2 text-sm leading-6 text-slate-500">Venda à vista ou financie casas, apartamentos, terrenos e lojas, com entrada, juros, parcelas, saldo e acompanhamento do contrato.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Wallet className="h-6 w-6 text-amber-600"/><h3 className="mt-4 font-extrabold text-slate-900">Tudo movimenta o caixa</h3><p className="mt-2 text-sm leading-6 text-slate-500">Recebimentos de aluguel, entradas, parcelas de financiamento e vendas de imóveis entram no controle financeiro da operação.</p></div></div></div></div></section>

        <section id="funcionalidades" className="scroll-mt-24 bg-white py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Na rotina de verdade</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Mais controle. Menos dor de cabeça.</h2></div><div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">{benefits.map(benefit => { const Icon = benefit.icon; return <div key={benefit.title} className="text-center lg:text-left"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700 lg:mx-0"><Icon className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-extrabold leading-5 text-slate-900">{benefit.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{benefit.description}</p></div>; })}</div></div></section>

        <section id="sobre" className="scroll-mt-24 border-t border-blue-100 bg-slate-50/70 py-20"><div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Para quem é o Note Note?</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Para quem trabalha fazendo negócio e precisa saber onde o dinheiro está.</h2></div><div className="space-y-5 text-base leading-8 text-slate-600"><p>O Note Note foi pensado para quem vende produtos, negocia veículos e imóveis, administra aluguéis, faz empréstimos pessoais ou trabalha com vendas parceladas e precisa enxergar quanto tem investido, quanto já recebeu e quanto ainda falta voltar.</p><p>Em vez de espalhar informação em caderno, conversa de WhatsApp e planilhas diferentes, você concentra a operação em um único sistema e acompanha cada cliente e negociação de forma organizada.</p></div></div></section>

        <section id="suporte" className="scroll-mt-24 px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-700 to-blue-600 px-7 py-10 text-white shadow-2xl shadow-blue-700/20 sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">Escolha seu acesso</p><h2 className="mt-2 text-3xl font-black">Comece com Basic ou Plus.</h2><p className="mt-3 max-w-2xl text-blue-100">Controle clientes, vendas, imóveis, aluguéis, financiamentos e caixa no mesmo sistema.</p></div><Link href="/planos"><a className="mt-7 inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-white px-7 font-extrabold text-blue-700 shadow-lg transition hover:-translate-y-0.5 lg:mt-0">Ver planos <ArrowRight className="h-5 w-5" /></a></Link></div></section>
      </main>

      <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><img src="/brand/note-note-logo-official.png" alt="Note Note" className="h-9 w-auto object-contain" /><p>Note Note — gestão simples para quem vende, empresta, aluga e negocia.</p></div></footer>
    </div>
  );
}
