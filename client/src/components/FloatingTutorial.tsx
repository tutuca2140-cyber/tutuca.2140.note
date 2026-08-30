import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  GripHorizontal,
  Minimize2,
  Orbit,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

type Position = { x: number; y: number };
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

const POSITION_KEY = "note-note:tutorial-position-v3";
const MINIMIZED_KEY = "note-note:tutorial-minimized-v3";

const guides: Guide[] = [
  {
    id: "inicio",
    title: "Começar no Note Note",
    area: "Primeiros passos",
    keywords: ["inicio", "começar", "comecar", "primeiro acesso", "como usar", "ajuda"],
    intro: "O Note Note é dividido por áreas. O fluxo mais comum é cadastrar o cliente, criar a operação e depois acompanhar os recebimentos.",
    steps: [
      "Confira no menu qual banco está em operação.",
      "Abra Dashboard para ver o resumo financeiro.",
      "Cadastre o cliente antes de criar contratos ou vendas.",
      "Use Empréstimos, Veículos, Produtos ou Financiamentos conforme o negócio.",
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
    steps: ["Use Financiamentos quando estiver criando a venda parcelada.", "Defina cliente, veículo, entrada, juros e parcelas.", "Use Pagamentos quando o cliente efetivamente pagar.", "Ao registrar o pagamento, a parcela e o Caixa são atualizados."],
    tip: "Exemplo: venda um carro hoje em 24 parcelas = Financiamento. Recebeu uma parcela = Pagamento.",
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
    intro: "Agentes controla pessoas comissionadas ligadas aos pagamentos, como vendedores, captadores ou responsáveis por negócios.",
    steps: ["Abra Agentes.", "Clique em Novo agente.", "Informe nome e comissão padrão.", "Associe o agente aos pagamentos correspondentes.", "Use Ver histórico para acompanhar volume, comissões e valor líquido.", "Altere o percentual para operações futuras sem apagar o histórico.", "Use Desativar quando ele não atuar mais."],
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
    steps: ["Abra Relatórios.", "Escolha a análise desejada.", "Defina filtros ou período quando disponível.", "Confira os dados.", "Use geração ou exportação quando liberada."],
  },
  {
    id: "banco",
    title: "Trocar e administrar bancos",
    area: "Bancos",
    keywords: ["banco", "trocar banco", "meu banco", "banco em operação"],
    intro: "Cada banco mantém sua própria operação. O banco selecionado define quais dados aparecem nas telas.",
    steps: ["Localize Banco em operação no menu.", "Escolha o banco desejado.", "Aguarde a atualização.", "Use a administração de bancos conforme sua permissão."],
  },
  {
    id: "equipe",
    title: "Gerenciar equipe e permissões",
    area: "Equipe e Permissões",
    keywords: ["equipe", "usuário adicional", "usuario adicional", "permissão", "permissao", "usuário"],
    intro: "Usuários adicionais podem ter acesso controlado por banco e por ação.",
    steps: ["Abra Usuários.", "Adicione ou edite o usuário.", "Informe os dados de acesso.", "Escolha os bancos.", "Marque apenas as permissões desejadas.", "Salve."],
    adminOnly: true,
  },
  {
    id: "sugestoes",
    title: "Consultar sugestões",
    area: "Super Admin",
    keywords: ["sugestões", "sugestoes", "avaliações", "avaliacoes", "feedback"],
    intro: "A área Sugestões reúne avaliações e comentários enviados pelos usuários.",
    steps: ["Abra Administração > Sugestões.", "Consulte a quantidade e a média de estrelas.", "Veja nome, e-mail, nota, comentário e data.", "Use as avaliações como retorno de melhoria do sistema."],
    adminOnly: true,
  },
];

const quickTopics = ["Como começar?", "Cadastrar cliente", "Criar empréstimo", "Criar produto", "Criar veículo", "Criar financiamento", "Financiamento x pagamento", "Registrar pagamento", "Para que serve Agente?", "Contas a receber"];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findGuide(query: string, available: Guide[]) {
  const q = normalize(query);
  if (!q) return null;
  const direct: Array<[RegExp, string]> = [
    [/como.*come|inicio|primeiro acesso/, "inicio"],
    [/para que serve.*agente|agente.*serve|comiss/, "agentes"],
    [/diferenca.*financiamento.*pagamento|financiamento.*(x|ou).*pagamento/, "diferenca-financiamento-pagamento"],
    [/(criar|cadastrar|novo).*produto/, "criar-produto"],
    [/(criar|cadastrar|novo).*veiculo/, "criar-veiculo"],
    [/(criar|cadastrar|novo|fazer).*financiamento/, "criar-financiamento"],
  ];
  for (const [pattern, id] of direct) if (pattern.test(q)) return available.find(item => item.id === id) ?? null;

  let best: { guide: Guide; score: number } | null = null;
  for (const guide of available) {
    const hay = normalize([guide.title, guide.area, ...guide.keywords].join(" "));
    let score = hay.includes(q) ? 12 : 0;
    for (const word of q.split(" ").filter(word => word.length > 2)) if (hay.includes(word)) score += 2;
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
  return { text: "Ainda não encontrei um guia exato para essa pergunta. Tente usar o nome da função, como cliente, empréstimo, agente, produto, veículo, financiamento, pagamento, caixa ou relatório." };
}

function routeGuide(path: string, available: Guide[]) {
  const routeMap: Array<[string, string]> = [
    ["/clientes", "clientes"], ["/emprestimos", "emprestimos"], ["/pagamentos", "pagamentos"],
    ["/agentes", "agentes"], ["/veiculos", "criar-veiculo"], ["/produtos", "criar-produto"],
    ["/financiamentos", "criar-financiamento"], ["/caixa", "caixa"], ["/contas-a-receber", "contas-receber"],
    ["/relatorios", "relatorios"], ["/admin/usuarios", "equipe"], ["/admin/bancos", "banco"], ["/admin/sugestoes", "sugestoes"],
  ];
  const match = routeMap.find(([prefix]) => path.startsWith(prefix));
  return available.find(item => item.id === (match?.[1] ?? "inicio")) ?? available[0];
}

function clampPosition(position: Position, width: number, height: number): Position {
  if (typeof window === "undefined") return position;
  const margin = 10;
  return {
    x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - height - margin)),
  };
}

export default function FloatingTutorial() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 24, y: 90 });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const dragging = useRef<{ pointerId: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const dragJustMoved = useRef(false);

  const availableGuides = useMemo(() => guides.filter(guide => !guide.adminOnly || user?.role === "super_admin"), [user?.role]);
  const contextualGuide = useMemo(() => routeGuide(location, availableGuides), [location, availableGuides]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Position;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setPosition(parsed);
      } else if (typeof window !== "undefined") {
        setPosition({ x: Math.max(12, window.innerWidth - 490), y: Math.max(72, window.innerHeight - 730) });
      }
      setMinimized(localStorage.getItem(MINIMIZED_KEY) === "1");
    } catch {
      // O guia continua funcionando mesmo sem armazenamento local.
    }
  }, []);

  useEffect(() => {
    if (loading || !user || messages.length) return;
    setMessages([{ id: nextId.current++, role: "assistant", text: `Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}! Sou o Guia Note Note. Você pode me mover pela tela aberto ou minimizado.`, guide: contextualGuide }]);
  }, [contextualGuide, loading, messages.length, user]);

  useEffect(() => {
    if (!minimized && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, minimized, thinking]);

  useEffect(() => {
    const resize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      const width = rect?.width ?? (minimized ? 72 : 460);
      const height = rect?.height ?? (minimized ? 72 : 700);
      setPosition(current => clampPosition(current, width, height));
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [minimized]);

  if (loading || !user) return null;

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean || thinking) return;
    setMessages(current => [...current, { id: nextId.current++, role: "user", text: clean }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      const answer = responseFor(clean, availableGuides);
      setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: answer.text, guide: answer.guide }]);
      setThinking(false);
    }, 300);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!minimized && (event.target as HTMLElement).closest("button,input")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 1) drag.moved = true;
    const rect = panelRef.current?.getBoundingClientRect();
    setPosition(clampPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, rect?.width ?? 72, rect?.height ?? 72));
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragJustMoved.current = drag.moved;
    dragging.current = null;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* sem bloqueio */ }
    window.setTimeout(() => { dragJustMoved.current = false; }, 120);
  };

  const toggleMinimized = () => {
    setMinimized(value => {
      const next = !value;
      try { localStorage.setItem(MINIMIZED_KEY, next ? "1" : "0"); } catch { /* sem bloqueio */ }
      requestAnimationFrame(() => {
        const rect = panelRef.current?.getBoundingClientRect();
        if (rect) setPosition(current => clampPosition(current, rect.width, rect.height));
      });
      return next;
    });
  };

  if (minimized) {
    return (
      <div
        ref={panelRef}
        className="fixed z-[90] select-none"
        style={{ left: position.x, top: position.y, touchAction: "none" }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <button
          type="button"
          onClick={() => { if (!dragJustMoved.current) toggleMinimized(); }}
          className="group relative flex h-[70px] w-[70px] cursor-move items-center justify-center rounded-[24px] border border-cyan-300/40 bg-slate-950/95 text-white shadow-[0_0_45px_rgba(34,211,238,0.42)] backdrop-blur-2xl transition hover:scale-105"
          aria-label="Abrir Guia Note Note"
        >
          <span className="absolute inset-1 animate-pulse rounded-[20px] border border-cyan-300/20" />
          <span className="absolute -inset-2 -z-10 rounded-[28px] bg-cyan-400/10 blur-xl" />
          <GraduationCap className="relative h-8 w-8 text-cyan-200 drop-shadow-[0_0_10px_rgba(103,232,249,.8)]" />
          <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
        </button>
      </div>
    );
  }

  return (
    <section
      ref={panelRef}
      className="fixed z-[90] flex h-[min(700px,calc(100vh-24px))] w-[min(460px,calc(100vw-20px))] flex-col overflow-hidden rounded-[30px] border border-cyan-300/25 bg-slate-950/95 text-slate-100 shadow-[0_0_75px_rgba(14,165,233,0.28)] backdrop-blur-2xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-blue-600/10 blur-3xl" />

      <header
        className="relative cursor-move select-none border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4"
        style={{ touchAction: "none" }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="mb-2 flex items-center justify-center text-cyan-300/50"><GripHorizontal className="h-4 w-4" /></div>
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 shadow-[inset_0_0_26px_rgba(34,211,238,0.1),0_0_22px_rgba(34,211,238,0.12)]">
            <Orbit className="h-6 w-6 text-cyan-300" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="font-black tracking-tight">Guia Note Note</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Online</span></div>
            <p className="mt-0.5 text-xs text-slate-400">Tutorial interativo • arraste para mover</p>
          </div>
          <button type="button" onClick={toggleMinimized} className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-2.5 text-cyan-200 transition hover:bg-cyan-400/10" aria-label="Minimizar tutorial"><Minimize2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Zap className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Modo</p><p className="text-[11px] font-bold">Tutorial</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Bot className="mx-auto mb-1 h-3.5 w-3.5 text-blue-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Acesso</p><p className="text-[11px] font-bold">Só leitura</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Sparkles className="mx-auto mb-1 h-3.5 w-3.5 text-violet-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Dados</p><p className="text-[11px] font-bold">Não altera</p></div>
        </div>
      </header>

      <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-cyan-300">Você está em</p>
          <p className="mt-1 font-bold text-white">{contextualGuide.area} • {contextualGuide.title}</p>
        </div>

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
                    <ol className="space-y-3 p-4">{message.guide.steps.map((step, index) => <li key={`${message.guide?.id}-${index}`} className="flex gap-3 text-sm leading-relaxed text-slate-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-xs font-black text-cyan-300">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>
                    {message.guide.tip && <div className="mx-4 mb-4 flex gap-2 rounded-xl border border-violet-300/10 bg-violet-400/[0.06] p-3 text-xs leading-relaxed text-slate-400"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"/><span><strong className="text-violet-200">Dica:</strong> {message.guide.tip}</span></div>}
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
          <Input value={input} onChange={event => setInput(event.target.value)} placeholder="Pergunte como usar uma função..." autoComplete="off" className="border-0 bg-transparent text-slate-100 placeholder:text-slate-500 focus-visible:ring-0" />
          <Button type="submit" size="icon" disabled={!input.trim() || thinking} className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg hover:opacity-90"><Send className="h-4 w-4"/></Button>
        </form>
        <p className="mt-2 flex items-center justify-center gap-1 text-[9px] uppercase tracking-[0.12em] text-slate-600"><ChevronRight className="h-3 w-3"/> O guia orienta; não executa ações</p>
      </div>
    </section>
  );
}
