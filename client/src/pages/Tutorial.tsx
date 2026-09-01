import DashboardLayout from "@/components/DashboardLayout";
import SupportChat from "@/components/SupportChat";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Car,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  KeyRound,
  Mail,
  Package,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "wouter";

type Lesson = {
  title: string;
  icon: typeof BookOpen;
  href: string;
  text: string;
  steps: string[];
  tip?: string;
  adminOnly?: boolean;
};

const lessons: Lesson[] = [
  {
    title: "Primeiros passos e Dashboard",
    icon: BarChart3,
    href: "/dashboard",
    text: "Entenda o fluxo do Note Note e personalize o Dashboard para acompanhar apenas os módulos importantes para sua operação.",
    steps: [
      "Confira qual banco está em operação.",
      "Veja os blocos de Caixa, Empréstimos, Aluguéis, Imóveis, Veículos, Produtos e Agentes.",
      "Mostre ou oculte blocos conforme sua necessidade.",
      "Abra um bloco em foco para analisar os gráficos daquele módulo.",
    ],
  },
  {
    title: "Clientes",
    icon: Users,
    href: "/clientes",
    text: "Cadastre e organize as pessoas vinculadas a empréstimos, vendas, financiamentos e aluguéis.",
    steps: ["Abra Clientes.", "Adicione um novo cliente.", "Preencha os dados de contato e endereço.", "Revise e salve."],
  },
  {
    title: "Empréstimos",
    icon: CreditCard,
    href: "/emprestimos",
    text: "Crie empréstimos com juros, parcelas, vencimentos e acompanhamento de pagamentos.",
    steps: ["Selecione o cliente.", "Informe valor, juros e modalidade de cálculo.", "Defina parcelas e datas.", "Confira o cálculo.", "Salve e acompanhe os recebimentos."],
  },
  {
    title: "Veículos",
    icon: Car,
    href: "/veiculos",
    text: "Cadastre veículos usados nas vendas e financiamentos.",
    steps: ["Adicione o veículo.", "Informe marca, modelo, ano, placa, cor e demais dados.", "Inclua imagens quando necessário.", "Revise e salve."],
  },
  {
    title: "Produtos e estoque",
    icon: Package,
    href: "/produtos",
    text: "Cadastre celulares e outros produtos, incluindo cor, preço e controle de estoque por unidade, peso ou litro.",
    steps: ["Crie o produto.", "Informe identificação, características e cor.", "Informe a quantidade existente em estoque.", "Escolha se o estoque é controlado por unidade, peso (kg) ou litro (L).", "Preencha preços e condições aplicáveis.", "Salve e acompanhe o estoque."],
  },
  {
    title: "Financiamentos de veículos e produtos",
    icon: ClipboardList,
    href: "/financiamentos",
    text: "Monte vendas financiadas ligando cliente, bem, entrada, juros, prazo e parcelas.",
    steps: ["Cadastre primeiro o cliente e o bem.", "Abra Financiamentos.", "Crie a nova operação.", "Informe entrada, juros, prazo e parcelas.", "Confira os valores calculados.", "Salve e acompanhe os pagamentos."],
  },
  {
    title: "Imóveis",
    icon: Building2,
    href: "/imoveis",
    text: "Cadastre casas, apartamentos, terrenos e lojas para venda à vista, financiamento ou aluguel.",
    steps: ["Clique em Novo imóvel.", "Escolha a categoria: casa, apartamento, terreno ou loja.", "Informe endereço, características e valor de venda.", "Salve o imóvel.", "Depois escolha Financiar, Vender à vista ou use o módulo de Aluguéis."],
  },
  {
    title: "Financiamento de imóveis",
    icon: Building2,
    href: "/imoveis",
    text: "Faça financiamento imobiliário com entrada, parcelas, agente comissionado e cálculo flexível de juros.",
    steps: ["No imóvel disponível, clique em Financiar.", "Escolha o cliente e, se desejar, o agente comissionado.", "Informe valor de entrada e quantidade de parcelas.", "Informe a taxa mensal para calcular a parcela ou deixe a taxa vazia e informe a parcela desejada para o sistema calcular os juros.", "Confira valor financiado, taxa, total e parcela.", "Salve o financiamento.", "Use Cancelar para encerrar ou Excluir quando a permissão permitir."],
    tip: "Pagamentos já realizados são preservados quando a operação é cancelada. A exclusão definitiva segue as regras de segurança do sistema.",
  },
  {
    title: "Aluguéis de imóveis",
    icon: KeyRound,
    href: "/alugueis",
    text: "Crie contratos de aluguel e registre recebimentos mensais, inclusive com agente e comissão.",
    steps: ["Abra Aluguéis.", "Escolha um imóvel disponível e o cliente.", "Informe valor mensal, vencimento, início e demais condições.", "Selecione um agente e percentual de comissão quando houver.", "Salve o aluguel.", "Registre os recebimentos mensais e encerre o contrato quando terminar."],
  },
  {
    title: "Venda de imóvel à vista",
    icon: Building2,
    href: "/imoveis",
    text: "Registre a venda à vista de um imóvel e envie automaticamente o recebimento para o Caixa.",
    steps: ["No imóvel disponível, clique em Vender à vista.", "Escolha o cliente.", "Informe o valor recebido.", "Associe agente e comissão quando houver.", "Confirme a venda e confira a entrada no Caixa."],
  },
  {
    title: "Pagamentos",
    icon: Wallet,
    href: "/pagamentos",
    text: "Registre o dinheiro efetivamente recebido de empréstimos e demais operações disponíveis nesta área.",
    steps: ["Abra Pagamentos.", "Localize a parcela ou operação.", "Confira cliente, vencimento e valor.", "Registre o pagamento.", "Confirme a atualização da parcela e do Caixa."],
  },
  {
    title: "Contas a receber",
    icon: CalendarDays,
    href: "/contas-a-receber",
    text: "Acompanhe valores futuros, próximos do vencimento e atrasados.",
    steps: ["Abra Contas a receber.", "Use filtros e períodos.", "Identifique clientes e parcelas pendentes.", "Ao receber, registre o pagamento na área correspondente."],
  },
  {
    title: "Caixa",
    icon: Wallet,
    href: "/caixa",
    text: "Acompanhe entradas, saídas e saldo do banco em operação.",
    steps: ["Abra Caixa.", "Confira movimentações automáticas de pagamentos, vendas, aluguéis e financiamentos.", "Use filtros para localizar lançamentos.", "Faça lançamentos manuais quando permitido.", "Revise o saldo."],
  },
  {
    title: "Agentes e comissões",
    icon: Users,
    href: "/agentes",
    text: "Controle vendedores, captadores e outros agentes comissionados.",
    steps: ["Cadastre o agente.", "Defina a comissão padrão.", "Associe-o às operações que aceitam agente.", "Confira comissão e valor líquido.", "Abra o histórico para acompanhar desempenho.", "Desative sem apagar o histórico quando ele não atuar mais."],
  },
  {
    title: "Relatórios e exportações",
    icon: FileText,
    href: "/relatorios",
    text: "Analise dados e gere relatórios e exportações disponíveis no sistema.",
    steps: ["Escolha o relatório.", "Defina período e filtros.", "Confira os resultados.", "Exporte quando a opção estiver disponível."],
  },
  {
    title: "Meu Banco e bancos em operação",
    icon: Database,
    href: "/meu-banco",
    text: "Cada banco separa clientes e operações. O banco em operação define quais dados aparecem nas telas.",
    steps: ["Confira o seletor Banco em operação.", "Escolha apenas um banco ao qual sua conta tenha acesso.", "Use Meu Banco para as opções permitidas ao contratante.", "No plano Plus, distribua acessos aos bancos para os usuários da equipe."],
  },
  {
    title: "Equipe e permissões",
    icon: ShieldCheck,
    href: "/equipe",
    text: "Adicione usuários e controle exatamente quais bancos e ações cada pessoa pode acessar.",
    steps: ["Abra Equipe.", "Adicione ou edite o usuário.", "Escolha os bancos liberados.", "Marque apenas as permissões necessárias.", "Salve e teste o acesso com o perfil criado."],
  },
  {
    title: "Meu Perfil e assinatura",
    icon: UserRound,
    href: "/perfil",
    text: "Atualize seus dados e consulte plano, situação da assinatura, teste, validade e opções disponíveis para a conta.",
    steps: ["Abra Meu Perfil.", "Revise nome, usuário, e-mail e WhatsApp.", "Consulte plano, status e validade.", "Altere dados ou senha quando necessário.", "Use as opções de assinatura disponíveis com confirmação de senha."],
  },
  {
    title: "Cadastro, pagamento e primeiro acesso",
    icon: CreditCard,
    href: "/perfil",
    text: "Novos assinantes concluem o pagamento antes do primeiro acesso. Se interromperem o processo, o login retorna à etapa pendente.",
    steps: ["Escolha o plano e a forma de pagamento.", "Preencha o cadastro e aceite os termos.", "Conclua o cartão ou Pix no fluxo do Asaas.", "Enquanto estiver pendente, o sistema não libera a operação.", "Ao voltar ao login, continue da etapa em que parou.", "Depois da confirmação exigida pelo fluxo contratado, o acesso é liberado."],
  },
  {
    title: "Super Admin: Painel de Controle",
    icon: Settings,
    href: "/admin/controle",
    text: "Acompanhe a operação administrativa geral do Note Note.",
    steps: ["Abra Administração > Painel de Controle.", "Confira os indicadores gerais.", "Use as áreas administrativas específicas para assinaturas, usuários, bancos, marketing e auditoria."],
    adminOnly: true,
  },
  {
    title: "Super Admin: Assinaturas",
    icon: CreditCard,
    href: "/admin/assinaturas",
    text: "Gerencie contas comerciais, plano, status, pagamento, cancelamento e exportação detalhada.",
    steps: ["Abra Assinaturas.", "Localize o assinante.", "Confira plano, cobrança e situação.", "Use as ações administrativas com confirmação quando solicitado.", "Exporte os dados em Excel quando necessário."],
    adminOnly: true,
  },
  {
    title: "Super Admin: Bancos de clientes",
    icon: Database,
    href: "/admin/bancos",
    text: "Os bancos dos clientes comerciais ficam fora do seletor Banco em operação do Super Admin e só podem ser consultados na área protegida.",
    steps: ["Abra Administração > Bancos de Dados.", "Entre em Bancos de Clientes — Área Protegida.", "Informe a senha do Super Admin.", "Escolha o banco do cliente.", "Confirme a senha para entrar quando solicitado.", "Use esse caminho protegido sempre que precisar consultar dados de um assinante."],
    adminOnly: true,
  },
  {
    title: "Super Admin: Usuários",
    icon: Users,
    href: "/admin/usuarios",
    text: "Crie, edite e controle permissões dos usuários administrativos do sistema.",
    steps: ["Abra Usuários.", "Crie ou edite a conta.", "Defina perfil e permissões.", "Vincule bancos quando aplicável.", "Salve e confira o acesso."],
    adminOnly: true,
  },
  {
    title: "Super Admin: Marketing",
    icon: Mail,
    href: "/admin/marketing",
    text: "Envie campanhas para clientes que autorizaram comunicações de marketing.",
    steps: ["Abra Marketing.", "Escolha o público disponível.", "Crie assunto e mensagem.", "Adicione imagem quando desejar.", "Revise e envie a campanha."],
    adminOnly: true,
  },
  {
    title: "Super Admin: Auditoria",
    icon: FileText,
    href: "/admin/auditoria",
    text: "Consulte ações administrativas e registros importantes de segurança e consentimento.",
    steps: ["Abra Auditoria.", "Use os filtros para localizar a ação.", "Confira usuário, data, entidade e detalhes.", "Use o histórico para rastrear alterações e acessos protegidos."],
    adminOnly: true,
  },
];

export default function Tutorial() {
  const { user } = useAuth();
  const visibleLessons = lessons.filter(lesson => !lesson.adminOnly || user?.role === "super_admin");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-background to-cyan-500/10 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground"><BookOpen className="h-7 w-7" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Central de aprendizado</p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Tutorial completo Note Note</h1>
              <p className="mt-2 max-w-4xl text-sm text-muted-foreground sm:text-base">Aqui estão as funcionalidades antigas e novas do sistema, organizadas por módulo. Use esta página para aprender o fluxo completo e o Guia flutuante para tirar dúvidas dentro de cada tela.</p>
            </div>
          </div>
        </section>

        <SupportChat />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleLessons.map((lesson, index) => {
            const Icon = lesson.icon;
            return <article key={lesson.title} className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Módulo {index + 1}</p><h2 className="font-bold">{lesson.title}</h2></div></div>
              <p className="mt-3 text-sm text-muted-foreground">{lesson.text}</p>
              <ol className="mt-4 space-y-2">{lesson.steps.map((step, i) => <li key={`${lesson.title}-${i}`} className="flex gap-2 text-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span><span>{step}</span></li>)}</ol>
              {lesson.tip ? <p className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground"><strong>Dica:</strong> {lesson.tip}</p> : null}
              <Link href={lesson.href}><a className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Ir para esta área →</a></Link>
            </article>;
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
