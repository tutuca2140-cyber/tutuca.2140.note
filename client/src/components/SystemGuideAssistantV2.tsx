import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Minimize2,
  Orbit,
  Send,
  Sparkles,
  Zap,
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
    title: "Começar no Note Note",
    area: "Primeiros passos",
    keywords: ["inicio", "começar", "comecar", "primeiro acesso", "como usar", "ajuda"],
    intro: "O Note Note é dividido por áreas. O fluxo mais comum é cadastrar o cliente, criar a operação e depois acompanhar os recebimentos.",
    steps: [
      "Confira no topo do menu qual banco está em operação.",
      "Abra Dashboard para ver o resumo financeiro.",
      "Cadastre o cliente antes de criar contratos ou vendas.",
      "Depois use Empréstimos, Veículos, Produtos ou Financiamentos conforme o negócio.",
      "Registre valores recebidos em Pagamentos.",
      "Use Contas a receber, Caixa e Relatórios para acompanhar a operação.",
    ],
  },
  {
    id: "clientes",
    title: "Cadastrar um cliente",
    area: "Clientes",
    keywords: ["cliente", "cadastrar cliente", "criar cliente", "novo cliente"],
    intro: "O cliente é a base das operações do sistema.",
    steps: ["Abra Clientes.", "Clique para adicionar um novo cliente.", "Preencha os dados solicitados.", "Revise as informações.", "Salve o cadastro."],
  },
  {
    id: "emprestimos",
    title: "Criar um empréstimo",
    area: "Empréstimos",
    keywords: ["emprestimo", "empréstimo", "criar empréstimo", "cadastrar empréstimo"],
    intro: "Empréstimos registra o valor liberado ao cliente, juros, parcelas e vencimentos.",
    steps: ["Abra Empréstimos.", "Clique em novo empréstimo.", "Selecione o cliente.", "Informe valor, juros, parcelas e datas.", "Confira o cálculo.", "Salve a operação."],
    tip: "Quando o cliente pagar, registre o recebimento em Pagamentos.",
  },
  {
    id: "criar-produto",
    title: "Criar um produto",
    area: "Produtos",
    keywords: ["produto", "criar produto", "cadastrar produto", "novo produto", "celular"],
    intro: "Produtos registra itens que você comercializa, como celulares e outros bens.",
    steps: ["Abra Produtos.", "Clique para adicionar um produto.", "Informe nome ou identificação.", "Preencha características e valor.", "Informe condições de parcelamento quando houver.", "Revise e salve."],
  },
  {
    id: "criar-veiculo",
    title: "Criar um veículo",
    area: "Veículos",
    keywords: ["veiculo", "veículo", "criar veículo", "cadastrar veículo", "novo veículo", "carro"],
    intro: "O cadastro de veículo cria o bem que pode ser usado em operações e financiamentos.",
    steps: ["Abra Veículos.", "Clique para adicionar um veículo.", "Informe marca e modelo.", "Preencha ano, placa, cor e demais campos.", "Adicione imagens quando desejar.", "Revise e salve."],
    tip: "Cadastrar o veículo não cria um financiamento; ele apenas registra o bem.",
  },
  {
    id: "criar-financiamento",
    title: "Criar um financiamento",
    area: "Financiamentos",
    keywords: ["financiamento", "criar financiamento", "cadastrar financiamento", "novo financiamento", "venda financiada"],
    intro: "O financiamento cria o contrato da venda parcelada: cliente, veículo, entrada, juros, parcelas e vencimentos.",
    steps: ["Cadastre primeiro o cliente e o veículo.", "Abra Financiamentos.", "Clique em novo financiamento.", "Selecione cliente e veículo.", "Informe valor total, entrada, juros, prazo e parcelas.", "Confira os valores calculados.", "Salve a operação."],
    tip: "Depois, cada valor efetivamente recebido deve ser lançado em Pagamentos.",
  },
  {
    id: "diferenca-financiamento-pagamento",
    title: "Financiamento x Pagamento",
    area: "Entenda a diferença",
    keywords: ["diferença financiamento pagamento", "diferenca financiamento pagamento", "financiamento ou pagamento", "financiamento x pagamento"],
    intro: "Financiamento cria a dívida e o cronograma. Pagamento registra o dinheiro que realmente entrou.",
    steps: ["Use Financiamentos quando estiver criando a venda parcelada.", "Ali você define cliente, veículo, entrada, juros e parcelas.", "Use Pagamentos apenas quando o cliente efetivamente pagar.", "Ao registrar o pagamento, a parcela e o Caixa são atualizados."],
    tip: "Exemplo: venda um carro hoje em 24 parcelas = Financiamento. Recebeu a primeira parcela no mês seguinte = Pagamento.",
  },
  {
    id: "pagamentos",
    title: "Registrar um pagamento",
    area: "Pagamentos",
    keywords: ["pagamento", "registrar pagamento", "receber parcela", "pagar parcela"],
    intro: "Pagamentos registra valores efetivamente recebidos.",
    steps: ["Abra Pagamentos.", "Localize a parcela.", "Confira cliente, vencimento e valor.", "Use a ação de pagamento.", "Confirme os dados.", "Confira a atualização da parcela e do Caixa."],
  },
  {
    id: "agentes",
    title: "Para que serve o Agente",
    area: "Agentes comissionados",
    keywords: ["agente", "agentes", "para que serve agente", "comissão", "comissao", "comissionado", "vendedor"],
    intro: "Agentes serve para controlar pessoas comissionadas ligadas aos pagamentos, como vendedores, captadores ou responsáveis por negócios. Você define um percentual padrão e o sistema acompanha quanto cada agente movimentou e quanto gerou de comissão.",
    steps: [
      "Abra Agentes no menu lateral.",
      "Clique em Novo agente para cadastrar a pessoa.",
      "Informe o nome e a comissão padrão em porcentagem.",
      "Quando um pagamento for associado ao agente, o sistema calcula e guarda a comissão correspondente.",
      "Em Ver histórico, acompanhe quantidade de pagamentos, volume movimentado, total de comissões, média por pagamento e valor líquido.",
      "Você pode alterar o percentual padrão para operações futuras sem apagar o histórico anterior.",
      "Se o agente deixar de trabalhar com você, use Desativar: ele não entra em novos pagamentos, mas todo o histórico permanece salvo.",
    ],
    tip: "Exemplo: um vendedor recebe 5% de comissão. Cadastre-o como Agente com 5%. Nos pagamentos relacionados a ele, o Note Note mantém o histórico da comissão e do valor líquido.",
  },
  {
    id: "caixa",
    title: "Usar o Caixa",
    area: "Caixa",
    keywords: ["caixa", "fluxo de caixa", "entrada", "saída", "saida"],
    intro: "O Caixa mostra as movimentações financeiras do banco selecionado.",
    steps: ["Abra Caixa.", "Confira entradas e saídas.", "Use filtros para localizar movimentos.", "Faça lançamentos quando necessário e permitido.", "Revise o saldo após pagamentos e lançamentos."],
  },
  {
    id: "contas-receber",
    title: "Consultar contas a receber",
    area: "Contas a receber",
    keywords: ["contas a receber", "vencimento", "atrasado", "a receber"],
    intro: "Esta área ajuda a acompanhar parcelas futuras, próximas do vencimento e atrasadas.",
    steps: ["Abra Contas a receber.", "Localize o cliente ou vencimento.", "Confira a situação da parcela.", "Quando receber, registre o valor em Pagamentos."],
  },
  {
    id: "relatorios",
    title: "Usar Relatórios",
    area: "Relatórios",
    keywords: ["relatório", "relatorio", "relatórios", "relatorios"],
    intro: "Relatórios reúne análises e documentos gerados a partir dos dados do banco em operação.",
    steps: ["Abra Relatórios.", "Escolha a análise desejada.", "Defina filtros ou período quando disponível.", "Confira os dados.", "Use a opção de geração ou exportação quando liberada."],
  },
  {
    id: "banco",
    title: "Trocar e administrar bancos",
    area: "Bancos",
    keywords: ["banco", "trocar banco", "meu banco", "banco em operação"],
    intro: "Cada banco mantém sua própria operação. O banco selecionado define quais dados aparecem nas telas.",
    steps: ["Localize Banco em operação no menu.", "Escolha o banco desejado.", "Aguarde a atualização.", "Use Meu Banco para renomear, limpar, restaurar ou excluir quando sua permissão permitir."],
  },
  {
    id: "equipe",
    title: "Gerenciar equipe no Plus",
    area: "Equipe e Permissões",
    keywords: ["equipe", "usuário adicional", "usuario adicional", "permissão", "permissao"],
    intro: "No Plus, o contratante pode adicionar usuários e definir exatamente quais bancos e ações cada um pode acessar.",
    steps: ["Abra Equipe e Permissões.", "Adicione o usuário.", "Informe os dados de acesso.", "Escolha os bancos.", "Marque apenas as permissões desejadas.", "Salve."],
  },
  {
    id: "perfil",
    title: "Atualizar Meu Perfil",
    area: "Perfil",
    keywords: ["perfil", "meu perfil", "alterar senha", "whatsapp", "email", "e-mail"],
    intro: "Meu Perfil guarda os dados da conta comercial.",
    steps: ["Clique no seu nome no topo do menu.", "Revise nome, usuário, e-mail e WhatsApp.", "Edite os campos necessários.", "Informe a senha atual quando solicitado.", "Salve as alterações."],
  },
  {
    id: "admin-assinaturas",
    title: "Administrar assinaturas",
    area: "Super Admin",
    keywords: ["assinaturas", "aprovar conta", "pagamento plano", "excel assinaturas"],
    intro: "A área de Assinaturas reúne clientes comerciais, plano, pagamento, contato e uso do sistema.",
    steps: ["Abra Administração > Assinaturas.", "Consulte os dados do cliente.", "Aprove novos cadastros após confirmar pagamento.", "Marque inadimplência quando necessário.", "Use Baixar Excel para exportar a lista."],
    adminOnly: true,
  },
];

const quickTopics = ["Para que serve Agente?", "Criar produto", "Criar veículo", "Criar financiamento", "Financiamento x pagamento", "Registrar pagamento"];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findGuide(query: string, available: Guide[]) {
  const q = normalize(query);
  if (!q) return null;
  const direct: Array<[RegExp, string]> = [
    [/para que serve.*agente|agente.*serve|comiss/, "agentes"],
    [/diferenca.*financiamento.*pagamento|financiamento.*(x|ou).*pagamento/, "diferenca-financiamento-pagamento"],
    [/(criar|cadastrar|novo).*produto/, "criar-produto"],
    [/(criar|cadastrar|novo).*veiculo/, "criar-veiculo"],
    [/(criar|cadastrar|novo|fazer).*financiamento/, "criar-financiamento"],
  ];
  for (const [pattern, id] of direct) {
    if (pattern.test(q)) return available.find(item => item.id === id) ?? null;
  }
  let best: { guide: Guide; score: number } | null = null;
  for (const guide of available) {
    const hay = normalize([guide.title, guide.area, ...guide.keywords].join(" "));
    let score = hay.includes(q) ? 12 : 0;
    for (const word of q.split(" ").filter(w => w.length > 2)) if (hay.includes(word)) score += 2;
    for (const keyword of guide.keywords) if (q.includes(normalize(keyword))) score += 7;
    if (!best || score > best.score) best = { guide, score };
  }
  return best && best.score >= 2 ? best.guide : null;
}

function responseFor(query: string, available: Guide[]) {
  const q = normalize(query);
  if (["oi", "ola", "bom dia", "boa tarde", "boa noite"].includes(q)) return { text: "Olá! Sou o Guia Note Note. Pergunte como funciona qualquer área e eu explico o passo a passo." };
  const guide = findGuide(query, available);
  if (guide) return { text: `Certo. Vou te mostrar ${guide.title.toLowerCase()}.`, guide };
  return { text: "Ainda não encontrei um guia exato para essa pergunta. Tente usar o nome da função, por exemplo: agente, produto, veículo, financiamento, pagamento, cliente, caixa ou relatório." };
}

export default function SystemGuideAssistantV2() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const availableGuides = useMemo(() => guides.filter(g => !g.adminOnly || user?.role === "super_admin"), [user?.role]);

  useEffect(() => {
    if (loading || !user) return;
    const key = `notenote:guide-v2-welcomed:${user.id}`;
    if (!localStorage.getItem(key)) {
      setOpen(true);
      setMessages([{ id: nextId.current++, role: "assistant", text: `Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}! Eu sou o Guia Note Note. Escolha um atalho ou me pergunte como usar qualquer função do sistema.`, guide: availableGuides.find(g => g.id === "inicio") }]);
      localStorage.setItem(key, "1");
    }
  }, [availableGuides, loading, user]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, thinking]);

  if (loading || !user) return null;

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    setMessages(current => [...current, { id: nextId.current++, role: "user", text: clean }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      const answer = responseFor(clean, availableGuides);
      setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: answer.text, guide: answer.guide }]);
      setThinking(false);
    }, 320);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); ask(input); };

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="group fixed bottom-5 right-5 z-[70] flex items-center gap-3 rounded-2xl border border-cyan-300/30 bg-slate-950/95 px-4 py-3 text-white shadow-[0_0_35px_rgba(34,211,238,0.28)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_50px_rgba(59,130,246,0.42)]" aria-label="Abrir Guia Note Note">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-blue-500/25">
            <span className="absolute inset-0 animate-pulse rounded-xl border border-cyan-300/30" />
            <GraduationCap className="relative h-5 w-5 text-cyan-200" />
          </span>
          <span className="hidden text-left sm:block"><span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Guia online</span><span className="block text-sm font-bold">Precisa de ajuda?</span></span>
        </button>
      )}

      {open && (
        <section className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[86vh] flex-col overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950/95 text-slate-100 shadow-[0_0_70px_rgba(14,165,233,0.22)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[700px] sm:w-[460px]">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-blue-500/10 blur-3xl" />

          <header className="relative border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 shadow-[inset_0_0_24px_rgba(34,211,238,0.08)]">
                <Orbit className="h-6 w-6 text-cyan-300" />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><h2 className="font-black tracking-tight">Guia Note Note</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Online</span></div>
                <p className="mt-0.5 text-xs text-slate-400">Treinamento interativo • somente orientação</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Minimizar assistente"><Minimize2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Zap className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Modo</p><p className="text-[11px] font-bold">Tutorial</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Bot className="mx-auto mb-1 h-3.5 w-3.5 text-blue-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Acesso</p><p className="text-[11px] font-bold">Só leitura</p></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Sparkles className="mx-auto mb-1 h-3.5 w-3.5 text-violet-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Dados</p><p className="text-[11px] font-bold">Não altera</p></div>
            </div>
          </header>

          <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">
            {!messages.length && <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4"><p className="font-bold text-cyan-200">O que você quer aprender?</p><p className="mt-1 text-sm text-slate-400">Digite uma dúvida ou use um dos atalhos abaixo.</p></div>}

            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "user" ? (
                  <div className="max-w-[84%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{message.text}</div>
                ) : (
                  <div className="max-w-[94%] space-y-2">
                    <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm shadow-xl">
                      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><Bot className="h-3.5 w-3.5"/> Guia Note Note</div>
                      <p className="leading-relaxed text-slate-200">{message.text}</p>
                    </div>
                    {message.guide && (
                      <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-b from-cyan-400/[0.055] to-white/[0.025]">
                        <div className="border-b border-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{message.guide.area}</p><h3 className="mt-1 text-base font-black text-white">{message.guide.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{message.guide.intro}</p></div>
                        <ol className="space-y-3 p-4">{message.guide.steps.map((step, index) => <li key={`${message.guide?.id}-${index}`} className="group flex gap-3 text-sm leading-relaxed text-slate-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-xs font-black text-cyan-300 transition group-hover:bg-cyan-400/20">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>
                        {message.guide.tip && <div className="mx-4 mb-4 flex gap-2 rounded-xl border border-violet-300/10 bg-violet-400/[0.06] p-3 text-xs leading-relaxed text-slate-400"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"/><span><strong className="text-violet-200">Exemplo/Dica:</strong> {message.guide.tip}</span></div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {thinking && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.2s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.1s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"/></div></div>}
          </div>

          <div className="relative border-t border-white/10 bg-slate-950/90 p-3">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{quickTopics.map(topic => <button key={topic} type="button" onClick={() => ask(topic)} className="whitespace-nowrap rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] px-3 py-2 text-[11px] font-bold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-400/10">{topic}</button>)}</div>
            <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-1.5 focus-within:border-cyan-300/30 focus-within:shadow-[0_0_24px_rgba(34,211,238,0.08)]">
              <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte como usar uma função..." autoComplete="off" className="border-0 bg-transparent text-slate-100 placeholder:text-slate-500 focus-visible:ring-0" />
              <Button type="submit" size="icon" disabled={!input.trim() || thinking} className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg hover:opacity-90"><Send className="h-4 w-4"/></Button>
            </form>
            <p className="mt-2 flex items-center justify-center gap-1 text-[9px] uppercase tracking-[0.12em] text-slate-600"><ChevronRight className="h-3 w-3"/> Nenhuma ação é executada pelo guia</p>
          </div>
        </section>
      )}
    </>
  );
}
