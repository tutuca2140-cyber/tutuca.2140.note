import DashboardLayout from "@/components/DashboardLayout";
import { BookOpen, CalendarDays, Car, ClipboardList, CreditCard, Database, FileText, Package, ShieldCheck, Users, Wallet } from "lucide-react";
import { Link } from "wouter";

const lessons = [
  { title: "Primeiros passos", icon: BookOpen, href: "/dashboard", text: "Escolha o banco em operação, conheça o Dashboard e entenda o fluxo: cliente → operação → recebimento → acompanhamento.", steps: ["Confira o banco selecionado", "Veja os indicadores do Dashboard", "Cadastre seu primeiro cliente"] },
  { title: "Clientes", icon: Users, href: "/clientes", text: "Aprenda a cadastrar e organizar os clientes que serão vinculados às operações.", steps: ["Abra Clientes", "Adicione um novo cliente", "Preencha e revise os dados", "Salve o cadastro"] },
  { title: "Empréstimos", icon: CreditCard, href: "/emprestimos", text: "Crie empréstimos com valor, juros, parcelas e vencimentos.", steps: ["Selecione o cliente", "Informe valor e juros", "Defina parcelas e datas", "Confira o cálculo e salve"] },
  { title: "Veículos", icon: Car, href: "/veiculos", text: "Cadastre veículos com os dados necessários antes de vinculá-los a financiamentos.", steps: ["Adicione o veículo", "Informe marca, modelo, ano e placa", "Inclua imagens quando necessário", "Revise e salve"] },
  { title: "Produtos", icon: Package, href: "/produtos", text: "Cadastre celulares e outros produtos comercializados pelo seu negócio.", steps: ["Crie o produto", "Informe características e valor", "Defina condições de parcelamento", "Salve"] },
  { title: "Financiamentos", icon: ClipboardList, href: "/financiamentos", text: "Monte vendas financiadas ligando cliente, veículo, entrada, juros e parcelas.", steps: ["Cadastre cliente e veículo", "Crie o financiamento", "Informe entrada, juros e prazo", "Confira parcelas e salve"] },
  { title: "Pagamentos", icon: Wallet, href: "/pagamentos", text: "Registre o dinheiro efetivamente recebido e mantenha parcelas e caixa atualizados.", steps: ["Localize a parcela", "Confira cliente e valor", "Registre o pagamento", "Confirme a atualização"] },
  { title: "Contas a receber", icon: CalendarDays, href: "/contas-a-receber", text: "Acompanhe vencimentos futuros, próximos e atrasados.", steps: ["Abra Contas a receber", "Use os filtros", "Identifique parcelas pendentes", "Ao receber, registre em Pagamentos"] },
  { title: "Caixa", icon: Wallet, href: "/caixa", text: "Acompanhe entradas, saídas, movimentações e saldo do banco selecionado.", steps: ["Confira as movimentações", "Use filtros", "Faça lançamentos permitidos", "Revise o saldo"] },
  { title: "Agentes", icon: Users, href: "/agentes", text: "Controle vendedores ou agentes comissionados e acompanhe o histórico das comissões.", steps: ["Cadastre o agente", "Defina a comissão", "Associe-o às operações aplicáveis", "Acompanhe o histórico"] },
  { title: "Relatórios", icon: FileText, href: "/relatorios", text: "Use os dados do sistema para analisar sua operação e gerar relatórios.", steps: ["Escolha o relatório", "Defina período e filtros", "Confira os resultados", "Exporte quando disponível"] },
  { title: "Banco de dados", icon: Database, href: "/meu-banco", text: "Entenda como os bancos separam as operações e como trocar o banco em uso.", steps: ["Veja Banco em operação", "Selecione o banco correto", "Confirme os dados exibidos", "Administre em Meu Banco quando permitido"] },
  { title: "Equipe e permissões", icon: ShieldCheck, href: "/equipe", text: "No plano com equipe, adicione usuários e limite exatamente o que cada pessoa pode acessar.", steps: ["Adicione o usuário", "Escolha os bancos", "Marque as permissões", "Salve e teste o acesso"] },
];

export default function Tutorial() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-background to-cyan-500/10 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground"><BookOpen className="h-7 w-7" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Central de aprendizado</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Tutorial Note Note</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">Aprenda a usar as principais funcionalidades do seu plano. Siga os módulos na ordem ou abra diretamente a área que deseja aprender.</p></div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lessons.map((lesson, index) => {
            const Icon = lesson.icon;
            return <article key={lesson.title} className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Módulo {index + 1}</p><h2 className="font-bold">{lesson.title}</h2></div></div>
              <p className="mt-3 text-sm text-muted-foreground">{lesson.text}</p>
              <ol className="mt-4 space-y-2">{lesson.steps.map((step, i) => <li key={step} className="flex gap-2 text-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span><span>{step}</span></li>)}</ol>
              <Link href={lesson.href}><a className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Ir para esta área →</a></Link>
            </article>;
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}