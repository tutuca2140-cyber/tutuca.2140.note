import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen,
  Bot,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Minimize2,
  Send,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Guide = {
  id: string;
  title: string;
  area: string;
  keywords: string[];
  intro: string;
  steps: string[];
  tip?: string;
  adminOnly?: boolean;
};

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  guide?: Guide;
};

const guides: Guide[] = [
  {
    id: "inicio",
    title: "Conhecer o Note Note",
    area: "Visão geral",
    keywords: ["inicio", "começar", "comecar", "usar sistema", "primeiro acesso", "como funciona", "ajuda"],
    intro: "O Note Note é organizado por áreas no menu lateral. Comece escolhendo o banco em operação e depois use cada módulo conforme a atividade que deseja registrar.",
    steps: [
      "No topo do menu, confira seu nome e o banco que está em operação.",
      "Use Dashboard para acompanhar os principais números do banco selecionado.",
      "Cadastre primeiro os Clientes que serão usados nos contratos e operações.",
      "Depois registre Empréstimos, Veículos, Produtos ou Financiamentos conforme a operação.",
      "Use Pagamentos e Contas a receber para acompanhar parcelas e recebimentos.",
      "Consulte Caixa para conferir entradas e saídas e Relatórios para analisar os resultados.",
    ],
    tip: "Se você não enxergar alguma área, ela pode não estar liberada nas permissões do seu usuário.",
  },
  {
    id: "dashboard",
    title: "Usar o Dashboard",
    area: "Dashboard",
    keywords: ["dashboard", "painel", "resumo", "indicadores", "recebido", "vencido", "saldo"],
    intro: "O Dashboard resume a situação financeira do banco que está selecionado no menu.",
    steps: [
      "Abra Dashboard no menu lateral.",
      "Confira os cartões de resumo com valores emprestados, pagos, em aberto e clientes.",
      "Observe o gráfico financeiro: recebido, a receber e vencido.",
      "Confira o saldo de caixa e os demais indicadores disponíveis.",
      "Para analisar outro banco, altere o Banco em operação no topo do menu e volte ao Dashboard.",
    ],
  },
  {
    id: "clientes",
    title: "Cadastrar um cliente",
    area: "Clientes",
    keywords: ["cliente", "clientes", "cadastrar cliente", "criar cliente", "novo cliente", "editar cliente", "telefone", "cpf", "endereço", "endereco"],
    intro: "Clientes são a base para empréstimos, vendas, financiamentos e cobranças dentro do banco selecionado.",
    steps: [
      "Abra Clientes no menu lateral.",
      "Clique no botão para adicionar um novo cliente.",
      "Preencha nome, telefone e os demais dados disponíveis no formulário.",
      "Revise os dados e confirme o cadastro.",
      "Depois de salvo, localize o cliente na lista para consultar ou editar suas informações, se sua permissão permitir.",
    ],
    tip: "Antes de criar uma operação, confirme se o cliente está cadastrado no mesmo banco em que você está trabalhando.",
  },
  {
    id: "emprestimos",
    title: "Cadastrar um empréstimo",
    area: "Empréstimos",
    keywords: ["emprestimo", "empréstimo", "criar empréstimo", "cadastrar empréstimo", "novo empréstimo", "juros", "parcela", "parcelas", "contrato"],
    intro: "A área Empréstimos registra contratos, juros, parcelas e vencimentos vinculados a um cliente.",
    steps: [
      "Abra Empréstimos no menu lateral.",
      "Escolha a opção de novo empréstimo.",
      "Selecione o cliente já cadastrado.",
      "Informe valor, modalidade de juros, taxa, quantidade de parcelas e datas solicitadas.",
      "Confira o cálculo apresentado pelo sistema antes de salvar.",
      "Salve o empréstimo. As parcelas passam a integrar o acompanhamento financeiro e de recebimentos.",
    ],
    tip: "Quando o cliente efetivamente pagar uma parcela, registre o recebimento em Pagamentos.",
  },
  {
    id: "criar-veiculo",
    title: "Criar um veículo",
    area: "Veículos",
    keywords: ["criar veículo", "criar veiculo", "cadastrar veículo", "cadastrar veiculo", "novo veículo", "novo veiculo", "adicionar veículo", "adicionar veiculo"],
    intro: "O cadastro de veículo cria o bem que poderá ser consultado e utilizado em operações como financiamentos.",
    steps: [
      "Abra Veículos no menu lateral.",
      "Clique em adicionar ou cadastrar novo veículo.",
      "Informe marca e modelo do veículo.",
      "Preencha ano, placa, cor e os demais campos apresentados pelo sistema.",
      "Adicione as imagens do veículo quando desejar e quando o campo estiver disponível.",
      "Revise as informações e salve.",
      "Confirme que o veículo aparece na listagem antes de tentar vinculá-lo a um financiamento.",
    ],
    tip: "O veículo é apenas o cadastro do bem. Para registrar uma venda financiada desse veículo, use Financiamentos.",
  },
  {
    id: "veiculos",
    title: "Administrar veículos cadastrados",
    area: "Veículos",
    keywords: ["veiculo", "veículo", "carro", "placa", "modelo", "marca", "editar veículo", "editar veiculo", "excluir veículo", "excluir veiculo"],
    intro: "Veículos concentra os automóveis cadastrados para uso nas operações do sistema.",
    steps: [
      "Abra Veículos no menu lateral.",
      "Localize o veículo desejado na lista.",
      "Abra a ação de edição para corrigir os dados quando necessário.",
      "Revise marca, modelo, ano, placa, cor e imagens.",
      "Salve as alterações.",
      "Para excluir, use a ação correspondente somente se sua permissão permitir e confirme a operação.",
    ],
  },
  {
    id: "criar-produto",
    title: "Criar um produto",
    area: "Produtos",
    keywords: ["criar produto", "cadastrar produto", "novo produto", "adicionar produto", "criar celular", "cadastrar celular"],
    intro: "O cadastro de produto registra um item que você comercializa, como um celular ou outro produto parcelado.",
    steps: [
      "Abra Produtos no menu lateral.",
      "Clique no botão para cadastrar ou adicionar um novo produto.",
      "Informe o nome ou identificação do produto.",
      "Preencha as características e informações solicitadas na tela.",
      "Informe o valor e, quando a operação permitir, as condições de parcelamento.",
      "Revise as informações e salve o produto.",
      "Confirme que ele apareceu na lista antes de registrar recebimentos relacionados à venda.",
    ],
    tip: "Criar o produto registra o item. Quando o cliente pagar uma parcela, o recebimento deve ser registrado em Pagamentos.",
  },
  {
    id: "produtos",
    title: "Administrar produtos",
    area: "Produtos",
    keywords: ["produto", "produtos", "celular", "venda produto", "parcelar produto", "editar produto", "excluir produto"],
    intro: "Produtos permite consultar e administrar os itens comercializados no banco selecionado.",
    steps: [
      "Abra Produtos no menu lateral.",
      "Localize o produto desejado.",
      "Use a ação de edição para alterar características, valores ou outros dados permitidos.",
      "Salve as mudanças.",
      "Use Pagamentos para registrar recebimentos das parcelas vinculadas às operações quando aplicável.",
    ],
  },
  {
    id: "criar-financiamento",
    title: "Criar um financiamento",
    area: "Financiamentos",
    keywords: ["criar financiamento", "cadastrar financiamento", "novo financiamento", "fazer financiamento", "financiar veículo", "financiar veiculo", "venda financiada"],
    intro: "Financiamento é o contrato da operação: ele define quanto o cliente deve, entrada, juros, prazo, parcelas e vencimentos.",
    steps: [
      "Antes de começar, cadastre o cliente em Clientes e o veículo em Veículos.",
      "Abra Financiamentos no menu lateral.",
      "Clique para criar um novo financiamento.",
      "Selecione o cliente que está comprando ou financiando.",
      "Selecione o veículo relacionado à operação.",
      "Informe valor total, entrada, tipo e taxa de juros, prazo, quantidade de parcelas e vencimentos conforme os campos apresentados.",
      "Confira o valor das parcelas e o total calculado pelo sistema.",
      "Salve o financiamento e confirme que a operação apareceu na listagem.",
      "Quando cada parcela for efetivamente recebida, registre o recebimento em Pagamentos.",
    ],
    tip: "Financiamento cria a dívida e o cronograma de parcelas. Pagamento registra o dinheiro que realmente entrou.",
  },
  {
    id: "financiamentos",
    title: "Acompanhar um financiamento",
    area: "Financiamentos",
    keywords: ["financiamento", "financiamentos", "entrada", "venda veículo", "venda veiculo", "parcelas financiamento", "consultar financiamento"],
    intro: "Depois de criado, o financiamento representa a operação parcelada vinculada ao cliente e ao veículo.",
    steps: [
      "Abra Financiamentos.",
      "Localize a operação do cliente.",
      "Confira valor financiado, entrada, juros, prazo e parcelas.",
      "Use as ações disponíveis para editar ou consultar detalhes, conforme sua permissão.",
      "Acompanhe os vencimentos em Contas a receber.",
      "Registre os valores efetivamente recebidos em Pagamentos.",
    ],
  },
  {
    id: "diferenca-financiamento-pagamento",
    title: "Diferença entre Financiamento e Pagamento",
    area: "Financiamentos e Pagamentos",
    keywords: [
      "diferença financiamento pagamento",
      "diferenca financiamento pagamento",
      "diferença entre financiamento e pagamento",
      "diferenca entre financiamento e pagamento",
      "financiamento ou pagamento",
      "qual diferença pagamento financiamento",
      "qual a diferença financiamento pagamento"
    ],
    intro: "São duas etapas diferentes da mesma operação. Financiamento cria a obrigação do cliente; Pagamento registra o que o cliente já pagou.",
    steps: [
      "Use Financiamentos quando você estiver criando a venda ou contrato parcelado.",
      "No Financiamento você define cliente, veículo, valor, entrada, juros, quantidade de parcelas e vencimentos.",
      "Depois de salvo, o sistema passa a saber quanto o cliente ainda deve e quando deve pagar.",
      "Use Pagamentos somente quando o dinheiro realmente for recebido do cliente.",
      "Em Pagamentos você localiza a parcela correspondente e confirma o recebimento.",
      "Ao registrar o pagamento, a parcela é atualizada e o valor recebido reflete no Caixa e nos indicadores financeiros.",
    ],
    tip: "Exemplo: hoje você vende um carro em 24 parcelas — crie o Financiamento. No mês que vem o cliente paga a 1ª parcela — registre esse valor em Pagamentos.",
  },
  {
    id: "pagamentos",
    title: "Registrar um pagamento",
    area: "Pagamentos",
    keywords: ["pagamento", "pagamentos", "registrar pagamento", "pagar parcela", "receber parcela", "receber", "recebimento", "quitar", "parcial"],
    intro: "Pagamentos registra um valor que foi efetivamente recebido e atualiza a situação das parcelas e o fluxo financeiro do banco.",
    steps: [
      "Abra Pagamentos no menu lateral.",
      "Localize a parcela ou operação que deseja receber.",
      "Confira cliente, vencimento e valor antes de continuar.",
      "Use a ação de pagamento disponível para a parcela.",
      "Informe os dados solicitados e confirme o recebimento.",
      "Depois da confirmação, confira a atualização da parcela e do Caixa.",
    ],
    tip: "Não crie um financiamento para registrar dinheiro recebido. Financiamento cria a obrigação; Pagamento registra o recebimento.",
  },
  {
    id: "contas-receber",
    title: "Consultar contas a receber",
    area: "Contas a receber",
    keywords: ["contas a receber", "vencimento", "vencimentos", "atrasado", "atrasados", "a receber", "cobrança", "cobranca"],
    intro: "Contas a receber ajuda a localizar valores futuros, vencimentos e parcelas que precisam de acompanhamento.",
    steps: [
      "Abra Contas a receber no menu.",
      "Consulte a listagem de valores e vencimentos do banco atual.",
      "Use cliente, data e situação para identificar o que está próximo de vencer ou em atraso.",
      "Quando o pagamento ocorrer, registre-o pela ação correspondente ou pela área Pagamentos.",
      "Volte ao Dashboard para conferir o reflexo nos totais financeiros.",
    ],
  },
  {
    id: "caixa",
    title: "Usar o Caixa",
    area: "Caixa",
    keywords: ["caixa", "fluxo de caixa", "entrada", "saida", "saída", "lançamento", "lancamento", "apagar caixa"],
    intro: "O Caixa mostra as movimentações financeiras do banco em operação, incluindo entradas geradas por pagamentos e outros lançamentos.",
    steps: [
      "Abra Caixa no menu lateral.",
      "Confira as entradas e saídas registradas para o banco selecionado.",
      "Use os filtros e informações da tela para localizar uma movimentação.",
      "Quando houver opção de novo lançamento, preencha descrição, tipo e valor conforme necessário.",
      "Para excluir um lançamento, use a ação somente se o contratante tiver liberado essa permissão para seu usuário.",
      "Revise o saldo após qualquer lançamento ou pagamento.",
    ],
    tip: "Usuários adicionais do Plus não podem apagar fluxo de caixa por padrão; o contratante precisa liberar essa permissão.",
  },
  {
    id: "relatorios",
    title: "Gerar e consultar relatórios",
    area: "Relatórios",
    keywords: ["relatorio", "relatório", "relatorios", "relatórios", "pdf", "resultado", "análise", "analise"],
    intro: "Relatórios reúne análises e documentos gerados a partir dos dados do banco atual.",
    steps: [
      "Abra Relatórios no menu lateral.",
      "Escolha o relatório ou análise que deseja consultar.",
      "Defina período, filtros ou critérios quando a tela solicitar.",
      "Confira os dados apresentados antes de gerar ou salvar um documento.",
      "Use a opção de geração ou exportação disponível na própria tela quando sua permissão permitir.",
    ],
  },
  {
    id: "agentes",
    title: "Usar a área de Agentes",
    area: "Agentes",
    keywords: ["agente", "agentes", "vendedor", "responsavel", "responsável"],
    intro: "Agentes permite organizar responsáveis ou participantes usados nas operações do banco, quando essa função estiver habilitada.",
    steps: [
      "Abra Agentes no menu lateral.",
      "Consulte os agentes já cadastrados.",
      "Para criar um novo, use o botão de cadastro disponível.",
      "Preencha os campos solicitados e salve.",
      "Use edição ou outras ações apenas quando sua permissão permitir.",
    ],
  },
  {
    id: "banco-selecionar",
    title: "Trocar o banco em operação",
    area: "Bancos de dados",
    keywords: ["trocar banco", "selecionar banco", "banco em operação", "banco ativo", "mudar banco"],
    intro: "Os dados exibidos nas áreas operacionais dependem do banco que está selecionado.",
    steps: [
      "Olhe o topo do menu lateral, abaixo do seu perfil.",
      "Localize Banco em operação.",
      "Abra a seleção e escolha um dos bancos liberados para o seu usuário.",
      "Aguarde a atualização do sistema.",
      "Dashboard, Clientes, operações e relatórios passam a trabalhar com o banco selecionado.",
    ],
  },
  {
    id: "meu-banco",
    title: "Administrar Meu Banco",
    area: "Meu Banco",
    keywords: ["meu banco", "editar banco", "renomear banco", "limpar memória", "limpar memoria", "excluir banco", "restaurar banco"],
    intro: "Meu Banco permite administrar os bancos pertencentes ao contratante, respeitando as permissões da conta.",
    steps: [
      "Abra Meu Banco no menu lateral.",
      "Escolha o banco que deseja administrar.",
      "Para mudar nome ou descrição, use a opção de edição e salve as alterações.",
      "A limpeza de memória remove os dados operacionais e cria uma janela de recuperação de até 48 horas.",
      "Se necessário, use Restaurar dentro do prazo mostrado pelo sistema.",
      "A exclusão definitiva do banco exige confirmação e não deve ser usada quando você só deseja limpar os dados.",
    ],
    tip: "Usuários adicionais do Plus só acessam essas ações se o contratante liberar a permissão de administrar bancos.",
  },
  {
    id: "equipe",
    title: "Cadastrar usuários da equipe no Plus",
    area: "Equipe e Permissões",
    keywords: ["equipe", "usuario adicional", "usuário adicional", "criar usuario", "criar usuário", "permissão", "permissoes", "permissões", "plus 5 usuarios"],
    intro: "O plano Plus permite ao contratante cadastrar até cinco usuários adicionais e definir exatamente o que cada um pode fazer.",
    steps: [
      "Abra Equipe e Permissões no menu.",
      "Clique para adicionar um usuário da conta.",
      "Informe nome, nome de usuário, e-mail e senha solicitados.",
      "Selecione quais dos seus bancos esse usuário poderá acessar.",
      "Marque somente as permissões que deseja liberar.",
      "Revise e salve. Depois você pode editar permissões, ativar, desativar ou remover o usuário.",
    ],
    tip: "Administrar usuários, administrar bancos e apagar fluxo de caixa ficam bloqueados por padrão para usuários adicionais.",
  },
  {
    id: "perfil",
    title: "Atualizar Meu Perfil",
    area: "Meu Perfil",
    keywords: ["perfil", "meu perfil", "nome", "email", "e-mail", "whatsapp", "trocar senha", "alterar senha", "excluir conta"],
    intro: "Meu Perfil reúne as informações da conta e permite ao contratante comercial manter seus próprios dados atualizados.",
    steps: [
      "Clique no seu nome no início do menu lateral.",
      "Na tela Meu Perfil, confira nome e sobrenome, usuário, e-mail e WhatsApp.",
      "Altere os campos permitidos e clique em Salvar alterações.",
      "Para mudar usuário, e-mail ou senha, informe também sua senha atual.",
      "Se trocar a senha, use no mínimo 8 caracteres, uma letra maiúscula e um número.",
      "Excluir minha conta exige senha atual e a confirmação EXCLUIR CONTA.",
    ],
    tip: "Excluir a conta comercial é definitivo e também afeta os bancos pertencentes à conta e os usuários adicionais vinculados.",
  },
  {
    id: "senha",
    title: "Recuperar a senha",
    area: "Login",
    keywords: ["esqueci senha", "recuperar senha", "senha", "não consigo entrar", "nao consigo entrar"],
    intro: "Clientes que compraram pelo site podem recuperar a senha usando o e-mail cadastrado.",
    steps: [
      "Na tela de Login, escolha Esqueci minha senha.",
      "Informe o e-mail usado no cadastro comercial.",
      "Abra o e-mail de recuperação enviado pelo Note Note.",
      "Acesse o link temporário dentro do prazo informado.",
      "Crie uma nova senha com no mínimo 8 caracteres, uma letra maiúscula e um número.",
      "Volte ao Login e entre com seu nome de usuário e a nova senha.",
    ],
  },
  {
    id: "pagamento-assinatura",
    title: "Entender o bloqueio por pagamento",
    area: "Assinatura",
    keywords: ["pagamento plano", "assinatura", "sem pagamento", "aguardando pagamento", "bloqueado", "plano não pago", "plano nao pago"],
    intro: "Quando uma assinatura comercial está aguardando pagamento, o login permanece funcionando, mas as ações operacionais ficam bloqueadas.",
    steps: [
      "Entre normalmente com seu usuário e senha.",
      "Enquanto o pagamento estiver pendente, use o Dashboard apenas para visualização.",
      "Ao tentar acessar uma função bloqueada, o sistema mostrará Sistema aguardando pagamento.",
      "Depois que o pagamento for confirmado, as funções do plano são liberadas novamente.",
    ],
  },
  {
    id: "admin-usuarios",
    title: "Administrar usuários como Super Admin",
    area: "Administração",
    keywords: ["super admin usuarios", "gerenciar usuários", "gerenciar usuarios", "usuario teste", "usuário teste"],
    intro: "O Super Admin possui uma área própria para separar usuários internos e clientes que compraram pelo site.",
    steps: [
      "Abra Administração > Usuários.",
      "Use a aba Usuários Criados Pelo Super Admin para contas internas, gratuitas e de teste.",
      "Use a aba Usuários que Compraram Pelo Site para visualizar contratantes comerciais e usuários vinculados.",
      "Ao criar ou editar um usuário interno, defina as permissões e bancos conforme necessário.",
      "A exclusão de usuário interno exige a confirmação Tem certeza que deseja realizar essa ação?.",
    ],
    adminOnly: true,
  },
  {
    id: "admin-assinaturas",
    title: "Administrar assinaturas como Super Admin",
    area: "Administração",
    keywords: ["assinaturas", "aprovar conta", "confirmar pagamento", "marcar sem pagamento", "clientes comerciais", "excel assinaturas"],
    intro: "Assinaturas e Aprovações reúne os clientes comerciais e o controle de pagamento de cada plano.",
    steps: [
      "Abra Administração > Assinaturas.",
      "Consulte contato, plano, mensalidade, status, data de cadastro, último acesso e tempo de uso.",
      "Para um cadastro novo, use Aprovar conta depois de confirmar o pagamento.",
      "Para inadimplência, use Marcar sem pagamento.",
      "Quando regularizar, use Confirmar pagamento.",
      "Use Baixar Excel para exportar a lista organizada.",
    ],
    adminOnly: true,
  },
  {
    id: "admin-bancos",
    title: "Administrar bancos como Super Admin",
    area: "Administração",
    keywords: ["admin bancos", "bancos de dados", "duplicar banco", "criar banco", "excluir banco super admin"],
    intro: "A área administrativa de bancos permite ao Super Admin criar, editar, duplicar, ativar e excluir bancos conforme as regras do sistema.",
    steps: [
      "Abra Administração > Bancos de Dados.",
      "Use Novo banco para criar um banco administrativo quando necessário.",
      "Use Editar para alterar nome e descrição.",
      "Use Duplicar quando precisar copiar a estrutura e os dados suportados.",
      "Use Ativar para mudar o banco em operação.",
      "Use exclusão permanente somente quando o banco realmente não for mais necessário.",
    ],
    adminOnly: true,
  },
];

const quickTopics = [
  "Cadastrar cliente",
  "Criar produto",
  "Criar veículo",
  "Criar financiamento",
  "Financiamento x pagamento",
  "Registrar pagamento",
  "Criar empréstimo",
  "Usar o Caixa",
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findGuide(query: string, available: Guide[]) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const directRules: Array<[RegExp, string]> = [
    [/diferenca.*financiamento.*pagamento|financiamento.*(x|ou).*pagamento|pagamento.*(x|ou).*financiamento/, "diferenca-financiamento-pagamento"],
    [/(criar|cadastrar|novo|adicionar).*produto|(criar|cadastrar).*celular/, "criar-produto"],
    [/(criar|cadastrar|novo|adicionar).*veiculo/, "criar-veiculo"],
    [/(criar|cadastrar|novo|fazer).*financiamento|financiar.*veiculo|venda financiada/, "criar-financiamento"],
    [/(registrar|lancar|receber|pagar).*pagamento|pagamento.*parcela/, "pagamentos"],
  ];

  for (const [pattern, id] of directRules) {
    if (pattern.test(normalizedQuery)) {
      const direct = available.find(guide => guide.id === id);
      if (direct) return direct;
    }
  }

  const queryWords = normalizedQuery.split(" ").filter(word => word.length >= 2);
  let best: { guide: Guide; score: number } | null = null;

  for (const guide of available) {
    const haystack = normalize([guide.title, guide.area, ...guide.keywords].join(" "));
    let score = 0;
    if (haystack.includes(normalizedQuery)) score += 12;
    for (const keyword of guide.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (normalizedQuery.includes(normalizedKeyword)) score += 8;
      if (normalizedKeyword.includes(normalizedQuery)) score += 4;
    }
    for (const word of queryWords) {
      if (haystack.includes(word)) score += 1;
    }
    if (!best || score > best.score) best = { guide, score };
  }

  return best && best.score >= 2 ? best.guide : null;
}

function responseFor(query: string, available: Guide[]) {
  const normalizedQuery = normalize(query);
  if (["oi", "ola", "bom dia", "boa tarde", "boa noite"].includes(normalizedQuery)) {
    return {
      text: "Olá! Eu sou o Guia Note Note. Posso ensinar o passo a passo das funcionalidades do sistema. Eu não faço lançamentos nem altero seus dados — apenas explico como você faz.",
    };
  }

  if (normalizedQuery === "financiamento x pagamento") {
    const guide = available.find(item => item.id === "diferenca-financiamento-pagamento");
    return { text: "Vou explicar a diferença entre Financiamento e Pagamento.", guide };
  }

  const guide = findGuide(query, available);
  if (guide) {
    return {
      text: `Encontrei o passo a passo de ${guide.title.toLowerCase()}.`,
      guide,
    };
  }

  return {
    text: "Não encontrei um passo a passo específico. Tente perguntar, por exemplo: criar produto, criar veículo, criar financiamento, diferença entre financiamento e pagamento, cadastrar cliente, registrar pagamento, usar o caixa ou atualizar meu perfil.",
  };
}

export default function SystemGuideAssistant() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const availableGuides = useMemo(
    () => guides.filter(guide => !guide.adminOnly || user?.role === "super_admin"),
    [user?.role]
  );

  useEffect(() => {
    if (loading || !user) return;
    const key = `notenote:guide-welcomed:${user.id}`;
    const welcomed = window.localStorage.getItem(key);
    if (!welcomed) {
      setOpen(true);
      setMessages([
        {
          id: nextId.current++,
          role: "assistant",
          text: `Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}! Sou o Guia Note Note. Estou aqui para ensinar como usar o sistema passo a passo. Posso explicar qualquer função, mas nunca executo ações nem altero seus dados. Por onde você quer começar?`,
          guide: availableGuides.find(guide => guide.id === "inicio"),
        },
      ]);
      window.localStorage.setItem(key, "1");
    }
  }, [availableGuides, loading, user]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  if (loading || !user) return null;

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    const answer = responseFor(clean, availableGuides);
    setMessages(current => [
      ...current,
      { id: nextId.current++, role: "user", text: clean },
      { id: nextId.current++, role: "assistant", text: answer.text, guide: answer.guide },
    ]);
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-xl transition hover:scale-[1.02] hover:shadow-2xl"
          aria-label="Abrir Guia Note Note"
        >
          <GraduationCap className="h-5 w-5" />
          <span className="hidden sm:inline">Ajuda</span>
        </button>
      )}

      {open && (
        <section className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[82vh] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[650px] sm:w-[430px]">
          <header className="flex items-center gap-3 border-b bg-primary p-4 text-primary-foreground">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-black">Guia Note Note</p>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Treinamento</span>
              </div>
              <p className="truncate text-xs text-primary-foreground/80">Ensina o passo a passo • Não executa ações</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Minimizar assistente">
              <Minimize2 className="h-5 w-5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
            {!messages.length && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-sm font-bold">Como posso ajudar?</p>
                </div>
                <p className="text-sm text-muted-foreground">Pergunte como realizar qualquer procedimento no Note Note. Eu vou indicar a área e explicar etapa por etapa.</p>
              </div>
            )}

            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] ${message.role === "user" ? "rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground" : "space-y-2"}`}>
                  {message.role === "assistant" ? (
                    <>
                      <div className="rounded-2xl rounded-bl-md border bg-background px-4 py-3 text-sm shadow-sm">
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold text-primary">
                          <Bot className="h-3.5 w-3.5" /> Guia Note Note
                        </div>
                        <p className="leading-relaxed">{message.text}</p>
                      </div>
                      {message.guide && (
                        <div className="rounded-2xl border bg-background p-4 shadow-sm">
                          <div className="mb-3 flex items-start gap-3">
                            <div className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen className="h-4 w-4" /></div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{message.guide.area}</p>
                              <h3 className="font-bold">{message.guide.title}</h3>
                            </div>
                          </div>
                          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{message.guide.intro}</p>
                          <ol className="space-y-3">
                            {message.guide.steps.map((step, index) => (
                              <li key={`${message.guide?.id}-${index}`} className="flex gap-3 text-sm leading-relaxed">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{index + 1}</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                          {message.guide.tip && (
                            <div className="mt-4 flex gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <span><strong className="text-foreground">Dica:</strong> {message.guide.tip}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : message.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t bg-background p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickTopics.map(topic => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => ask(topic)}
                  className="whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
                >
                  {topic}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ex.: Como criar um financiamento?"
                autoComplete="off"
              />
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Enviar pergunta">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
              <ChevronRight className="h-3 w-3" /> O Guia apenas explica. Nenhum dado é alterado por ele.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
