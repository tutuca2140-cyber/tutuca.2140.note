import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, ChevronRight, CircleHelp, GraduationCap, GripHorizontal, MessageCircle, Minimize2, Orbit, Send, Sparkles, Zap } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

type Position = { x: number; y: number };
type Guide = { id: string; title: string; area: string; keywords: string[]; intro: string; steps: string[]; tip?: string; adminOnly?: boolean };
type ChatMessage = { id: number; role: "assistant" | "user"; text: string; guide?: Guide };
type DragState = { pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean };

const POSITION_KEY = "note-note:tutorial-position-v5";
const MINIMIZED_KEY = "note-note:tutorial-minimized-v5";

const guides: Guide[] = [
  { id: "inicio", title: "Começar no Note Note", area: "Primeiros passos", keywords: ["inicio", "começar", "comecar", "primeiro acesso", "como usar", "ajuda", "dashboard"], intro: "O fluxo do Note Note começa escolhendo o banco em operação, cadastrando clientes e depois criando as operações que você deseja controlar.", steps: ["Confira o banco em operação.", "Abra o Dashboard e personalize os blocos que deseja acompanhar.", "Cadastre o cliente.", "Crie empréstimo, veículo, produto, imóvel, aluguel ou financiamento.", "Registre recebimentos nas áreas correspondentes.", "Acompanhe Contas a receber, Caixa, Agentes e Relatórios."] },
  { id: "dashboard", title: "Usar e personalizar o Dashboard", area: "Dashboard", keywords: ["dashboard", "painel", "blocos", "grafico", "gráfico", "personalizar dashboard"], intro: "O Dashboard reúne os principais indicadores e pode ser ajustado para mostrar apenas os módulos que você quer acompanhar.", steps: ["Abra Dashboard.", "Confira Caixa Geral, Empréstimos, Aluguéis, Imóveis, Veículos, Produtos e Agentes.", "Mostre ou oculte os blocos desejados.", "Abra um bloco em foco para analisar os gráficos daquele módulo."] },
  { id: "clientes", title: "Cadastrar um cliente", area: "Clientes", keywords: ["cliente", "cadastrar cliente", "criar cliente", "novo cliente"], intro: "Clientes são vinculados às operações financeiras, vendas, financiamentos e aluguéis.", steps: ["Abra Clientes.", "Clique para adicionar um cliente.", "Preencha nome, telefone, endereço e demais dados.", "Revise e salve."] },
  { id: "emprestimos", title: "Criar e acompanhar empréstimos", area: "Empréstimos", keywords: ["emprestimo", "empréstimo", "juros", "parcela emprestimo"], intro: "Empréstimos registra valores liberados, juros, parcelas e vencimentos.", steps: ["Abra Empréstimos.", "Selecione o cliente.", "Informe valor, juros, parcelas e datas.", "Confira o cálculo.", "Salve.", "Registre os recebimentos conforme o cliente pagar."] },
  { id: "produtos", title: "Cadastrar produtos e controlar estoque", area: "Produtos", keywords: ["produto", "estoque", "cor produto", "peso", "litro", "unidade", "celular"], intro: "Produtos permite cadastrar itens comercializados e controlar quantidade em estoque.", steps: ["Abra Produtos e crie um produto.", "Informe identificação, características e cor.", "Informe a quantidade em estoque.", "Escolha Unidade, Peso (kg) ou Litro (L).", "Informe preços e demais condições.", "Salve o produto."] },
  { id: "veiculos", title: "Cadastrar veículos", area: "Veículos", keywords: ["veiculo", "veículo", "carro", "placa", "modelo"], intro: "Veículos registra os bens usados nas vendas e financiamentos.", steps: ["Abra Veículos.", "Adicione o veículo.", "Informe marca, modelo, ano, placa, cor e demais dados.", "Adicione imagens quando desejar.", "Revise e salve."] },
  { id: "financiamentos", title: "Financiar veículos e produtos", area: "Financiamentos", keywords: ["financiamento", "veiculo financiado", "produto financiado", "venda financiada"], intro: "Financiamentos cria o contrato parcelado com cliente, bem, entrada, juros e prazo.", steps: ["Cadastre cliente e bem primeiro.", "Abra Financiamentos.", "Crie a operação.", "Informe entrada, juros, prazo e parcelas.", "Confira o cálculo.", "Salve e acompanhe os pagamentos."] },
  { id: "imoveis", title: "Cadastrar e administrar imóveis", area: "Imóveis", keywords: ["imovel", "imóvel", "casa", "apartamento", "terreno", "loja"], intro: "Imóveis reúne casas, apartamentos, terrenos e lojas para venda, financiamento ou aluguel.", steps: ["Abra Imóveis.", "Clique em Novo imóvel.", "Escolha casa, apartamento, terreno ou loja.", "Informe endereço, características e valor.", "Salve.", "Depois escolha Financiar, Vender à vista ou use Aluguéis."] },
  { id: "financiamento-imovel", title: "Criar financiamento de imóvel", area: "Imóveis", keywords: ["financiamento de imovel", "financiamento imóvel", "juros imovel", "parcela imovel", "cancelar financiamento imovel", "excluir financiamento imovel"], intro: "O financiamento imobiliário permite calcular a parcela pela taxa ou descobrir a taxa a partir da parcela desejada.", steps: ["No imóvel disponível, clique em Financiar.", "Escolha o cliente e, se desejar, um agente comissionado.", "Informe entrada e número de parcelas.", "Informe a taxa mensal para calcular a parcela ou deixe a taxa vazia e informe a parcela desejada para calcular os juros.", "Confira valor financiado, taxa, total e parcela.", "Salve.", "Use Cancelar para encerrar a operação ou Excluir quando sua permissão permitir."], tip: "Cancelar preserva o histórico. Exclusões definitivas obedecem às proteções financeiras do sistema." },
  { id: "alugueis", title: "Criar e receber aluguéis", area: "Aluguéis", keywords: ["aluguel", "alugueis", "alugueis", "renda", "mensalidade aluguel"], intro: "Aluguéis cria contratos mensais para imóveis disponíveis.", steps: ["Abra Aluguéis.", "Escolha imóvel e cliente.", "Informe valor mensal, vencimento e início.", "Associe agente e comissão quando houver.", "Salve o contrato.", "Registre os recebimentos mensais.", "Encerre o aluguel quando terminar."] },
  { id: "venda-imovel", title: "Vender imóvel à vista", area: "Imóveis", keywords: ["vender imovel", "venda imovel", "venda à vista imóvel", "vender casa"], intro: "A venda à vista registra o negócio e envia o recebimento para o Caixa.", steps: ["No imóvel disponível, clique em Vender à vista.", "Selecione o cliente.", "Informe o valor recebido.", "Associe agente e comissão quando houver.", "Confirme e confira a entrada no Caixa."] },
  { id: "pagamentos", title: "Registrar pagamentos", area: "Pagamentos", keywords: ["pagamento", "registrar pagamento", "receber parcela", "pagar parcela"], intro: "Pagamentos registra dinheiro efetivamente recebido nas operações disponíveis nesta área.", steps: ["Abra Pagamentos.", "Localize a operação ou parcela.", "Confira cliente, vencimento e valor.", "Registre o pagamento.", "Confira a atualização no Caixa."] },
  { id: "contas-receber", title: "Consultar contas a receber", area: "Contas a receber", keywords: ["contas a receber", "vencimento", "atrasado", "a receber"], intro: "Use esta área para acompanhar valores futuros, próximos e atrasados.", steps: ["Abra Contas a receber.", "Use filtros e períodos.", "Localize cliente e parcela.", "Quando receber, registre o pagamento na área correspondente."] },
  { id: "caixa", title: "Usar o Caixa", area: "Caixa", keywords: ["caixa", "fluxo de caixa", "entrada", "saída", "saida"], intro: "O Caixa reúne movimentações automáticas e manuais do banco selecionado.", steps: ["Abra Caixa.", "Confira entradas e saídas.", "Use filtros.", "Faça lançamentos manuais quando permitido.", "Confira pagamentos, vendas, aluguéis e financiamentos lançados automaticamente."] },
  { id: "agentes", title: "Controlar agentes e comissões", area: "Agentes", keywords: ["agente", "comissão", "comissao", "vendedor", "captador"], intro: "Agentes controla pessoas comissionadas ligadas às operações.", steps: ["Cadastre o agente.", "Defina a comissão padrão.", "Associe-o às operações compatíveis.", "Confira comissão e valor líquido.", "Use o histórico para acompanhar desempenho.", "Desative sem apagar o histórico quando necessário."] },
  { id: "relatorios", title: "Usar relatórios e exportações", area: "Relatórios", keywords: ["relatório", "relatorio", "excel", "exportar"], intro: "Relatórios reúne análises e exportações dos dados da operação.", steps: ["Abra Relatórios.", "Escolha a análise.", "Defina período e filtros.", "Confira os resultados.", "Exporte quando disponível."] },
  { id: "banco", title: "Usar bancos de dados", area: "Bancos", keywords: ["banco", "banco em operação", "meu banco", "trocar banco"], intro: "Cada banco separa clientes e operações. O banco em operação define os dados exibidos.", steps: ["Confira Banco em operação.", "Selecione apenas um banco liberado para sua conta.", "Use Meu Banco para administrar as opções permitidas.", "No Plus, distribua acesso aos bancos para os usuários da equipe."] },
  { id: "equipe", title: "Gerenciar equipe e permissões", area: "Equipe", keywords: ["equipe", "usuario adicional", "usuário adicional", "permissão", "permissao"], intro: "A equipe permite controlar quais bancos e ações cada usuário pode acessar.", steps: ["Abra Equipe.", "Crie ou edite o usuário.", "Escolha os bancos.", "Marque apenas as permissões necessárias.", "Salve e teste o acesso."] },
  { id: "perfil", title: "Usar Meu Perfil e assinatura", area: "Perfil", keywords: ["perfil", "assinatura", "plano", "alterar senha", "validade"], intro: "Meu Perfil reúne seus dados e informações da assinatura.", steps: ["Abra Meu Perfil.", "Revise nome, usuário, e-mail e WhatsApp.", "Confira plano, status, teste e validade.", "Altere dados ou senha quando necessário.", "Use as opções de assinatura disponíveis com confirmação de senha."] },
  { id: "primeiro-acesso", title: "Concluir pagamento e primeiro acesso", area: "Cadastro e assinatura", keywords: ["primeiro acesso", "pagamento pendente", "continuar pagamento", "pix", "cartão", "cartao", "asaas"], intro: "Novos assinantes só entram na operação depois de concluir as etapas exigidas no pagamento.", steps: ["Escolha o plano e a forma de pagamento.", "Preencha o cadastro e aceite os termos.", "Conclua cartão ou Pix no fluxo do Asaas.", "Se sair antes de terminar, volte ao login com o mesmo usuário.", "O Note Note mostra a etapa em que você parou.", "Depois da confirmação exigida, o primeiro acesso é liberado."] },
  { id: "suporte", title: "Falar com o suporte", area: "Suporte", keywords: ["suporte", "falar com suporte", "atendimento", "ajuda humana", "mensagem suporte"], intro: "Você pode falar diretamente com o suporte do Note Note dentro do Tutorial.", steps: ["Abra o Tutorial.", "Entre na seção Fale com o suporte.", "Digite sua mensagem e envie.", "A mensagem chega ao painel do Super Admin com seu nome e ID de 9 dígitos.", "Acompanhe as respostas no mesmo chat."], tip: "Use o botão Falar com suporte abaixo para abrir o atendimento agora." },
  { id: "admin-controle", title: "Usar o Painel de Controle", area: "Super Admin", keywords: ["painel de controle", "super admin", "controle"], intro: "O Painel de Controle reúne a visão administrativa geral do Note Note.", steps: ["Abra Administração > Painel de Controle.", "Confira os indicadores gerais.", "Use Assinaturas, Usuários, Bancos, Marketing e Auditoria para tarefas específicas."], adminOnly: true },
  { id: "admin-assinaturas", title: "Administrar assinaturas", area: "Super Admin", keywords: ["assinaturas", "assinante", "cancelar assinatura", "excel assinaturas"], intro: "Assinaturas reúne clientes comerciais, plano, cobrança, status e ações administrativas.", steps: ["Abra Assinaturas.", "Localize o cliente.", "Confira plano e pagamento.", "Use as ações disponíveis com confirmação quando exigida.", "Exporte a lista detalhada quando necessário."], adminOnly: true },
  { id: "admin-bancos-clientes", title: "Acessar bancos de clientes com segurança", area: "Super Admin", keywords: ["banco cliente", "bancos de clientes", "senha super admin", "area protegida"], intro: "Bancos de clientes comerciais não aparecem no seletor Banco em operação do Super Admin.", steps: ["Abra Administração > Bancos de Dados.", "Entre em Bancos de Clientes — Área Protegida.", "Digite a senha do Super Admin.", "Escolha o banco do cliente.", "Confirme a senha novamente quando solicitado.", "Use somente esse caminho protegido para consultar dados de clientes."], adminOnly: true },
  { id: "admin-marketing", title: "Enviar campanhas de marketing", area: "Super Admin", keywords: ["marketing", "campanha", "email marketing", "e-mail marketing"], intro: "Marketing permite enviar campanhas aos clientes elegíveis que autorizaram comunicações.", steps: ["Abra Marketing.", "Escolha o público.", "Crie assunto e mensagem.", "Adicione imagem quando desejar.", "Revise e envie."], adminOnly: true },
  { id: "admin-auditoria", title: "Consultar auditoria", area: "Super Admin", keywords: ["auditoria", "log", "consentimento", "historico admin"], intro: "Auditoria registra ações administrativas e eventos importantes de segurança.", steps: ["Abra Auditoria.", "Use filtros.", "Confira usuário, data, entidade e detalhes.", "Use o histórico para rastrear alterações e acessos protegidos."], adminOnly: true },
];

const quickTopics = ["Falar com suporte", "Como começar?", "Dashboard", "Cadastrar cliente", "Empréstimos", "Produtos e estoque", "Veículos", "Financiamento", "Imóveis", "Financiar imóvel", "Aluguéis", "Pagamentos", "Agentes", "Caixa", "Contas a receber", "Meu Perfil"];

function normalize(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function findGuide(query: string, available: Guide[]) {
  const q = normalize(query); if (!q) return null;
  const direct: Array<[RegExp, string]> = [[/como.*come|inicio|primeiro acesso/, "inicio"], [/para que serve.*agente|agente.*serve|comiss/, "agentes"], [/diferenca.*financiamento.*pagamento|financiamento.*(x|ou).*pagamento/, "diferenca-financiamento-pagamento"], [/(criar|cadastrar|novo).*produto/, "criar-produto"], [/(criar|cadastrar|novo).*veiculo/, "criar-veiculo"], [/(criar|cadastrar|novo|fazer).*financiamento/, "criar-financiamento"]];
  for (const [pattern, id] of direct) if (pattern.test(q)) return available.find(item => item.id === id) ?? null;
  let best: { guide: Guide; score: number } | null = null;
  for (const guide of available) { const hay = normalize([guide.title, guide.area, ...guide.keywords].join(" ")); let score = hay.includes(q) ? 12 : 0; for (const word of q.split(" ").filter(word => word.length > 2)) if (hay.includes(word)) score += 2; for (const keyword of guide.keywords) if (q.includes(normalize(keyword))) score += 7; if (!best || score > best.score) best = { guide, score }; }
  return best && best.score >= 2 ? best.guide : null;
}
function responseFor(query: string, available: Guide[]) { const q = normalize(query); if (["oi", "ola", "bom dia", "boa tarde", "boa noite"].includes(q)) return { text: "Olá! Sou o Guia Note Note. Pergunte como funciona qualquer área e eu explico o passo a passo." }; const guide = findGuide(query, available); if (guide) return { text: `Certo. Vou te mostrar ${guide.title.toLowerCase()}.`, guide }; return { text: "Ainda não encontrei um guia exato para essa pergunta. Tente usar o nome da função, como dashboard, cliente, empréstimo, produto, estoque, veículo, imóvel, aluguel, financiamento, pagamento, agente, caixa, relatório, perfil ou banco." }; }
function routeGuide(path: string, available: Guide[]) { const routeMap: Array<[string, string]> = [["/dashboard", "dashboard"], ["/clientes", "clientes"], ["/emprestimos", "emprestimos"], ["/pagamentos", "pagamentos"], ["/agentes", "agentes"], ["/veiculos", "veiculos"], ["/produtos", "produtos"], ["/imoveis", "imoveis"], ["/alugueis", "alugueis"], ["/financiamentos", "financiamentos"], ["/caixa", "caixa"], ["/contas-a-receber", "contas-receber"], ["/relatorios", "relatorios"], ["/perfil", "perfil"], ["/equipe", "equipe"], ["/meu-banco", "banco"], ["/admin/controle", "admin-controle"], ["/admin/usuarios", "equipe"], ["/admin/bancos", "admin-bancos-clientes"], ["/admin/assinaturas", "admin-assinaturas"], ["/admin/marketing", "admin-marketing"], ["/admin/auditoria", "admin-auditoria"]]; const match = routeMap.find(([prefix]) => path.startsWith(prefix)); return available.find(item => item.id === (match?.[1] ?? "inicio")) ?? available[0]; }
function clampPosition(position: Position, width: number, height: number): Position { if (typeof window === "undefined") return position; const margin = 10; return { x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - width - margin)), y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - height - margin)) }; }

export default function FloatingTutorial() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const [minimized, setMinimized] = useState(true);
  const [position, setPosition] = useState<Position>({ x: 24, y: 90 });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const dragging = useRef<DragState | null>(null);
  const positionRef = useRef(position);

  const availableGuides = useMemo(() => guides.filter(guide => !guide.adminOnly || user?.role === "super_admin"), [user?.role]);
  const contextualGuide = useMemo(() => routeGuide(location, availableGuides), [location, availableGuides]);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) { const parsed = JSON.parse(saved) as Position; if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setPosition(parsed); }
      else if (typeof window !== "undefined") setPosition({ x: Math.max(12, window.innerWidth - 86), y: Math.max(72, window.innerHeight - 160) });
      setMinimized(localStorage.getItem(MINIMIZED_KEY) !== "0");
    } catch { /* continua funcionando */ }
  }, []);
  useEffect(() => { if (loading || !user || messages.length) return; setMessages([{ id: nextId.current++, role: "assistant", text: `Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}! Sou o Guia Note Note. Arraste meu ícone para qualquer canto e toque para abrir.`, guide: contextualGuide }]); }, [contextualGuide, loading, messages.length, user]);
  useEffect(() => { if (!minimized && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, minimized, thinking]);
  useEffect(() => { const resize = () => { const rect = panelRef.current?.getBoundingClientRect(); const width = rect?.width ?? (minimized ? 70 : 460); const height = rect?.height ?? (minimized ? 70 : 700); setPosition(current => clampPosition(current, width, height)); }; window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, [minimized]);

  if (loading || !user) return null;

  const ask = (question: string) => { const clean = question.trim(); if (!clean || thinking) return; setMessages(current => [...current, { id: nextId.current++, role: "user", text: clean }]); setInput(""); setThinking(true); window.setTimeout(() => { const answer = responseFor(clean, availableGuides); setMessages(current => [...current, { id: nextId.current++, role: "assistant", text: answer.text, guide: answer.guide }]); setThinking(false); }, 300); };
  const submit = (event: FormEvent) => { event.preventDefault(); ask(input); };
  const toggleMinimized = () => { setMinimized(value => { const next = !value; try { localStorage.setItem(MINIMIZED_KEY, next ? "1" : "0"); } catch { /* sem bloqueio */ } return next; }); };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!minimized && (event.target as HTMLElement).closest("button,input")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragging.current; if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) drag.moved = true;
    if (!drag.moved) return;
    const rect = panelRef.current?.getBoundingClientRect();
    const next = clampPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, rect?.width ?? 70, rect?.height ?? 70);
    positionRef.current = next; setPosition(next);
  };
  const finishDrag = (event: React.PointerEvent<HTMLElement>, openOnTap: boolean) => {
    const drag = dragging.current; if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7;
    dragging.current = null;
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current)); } catch { /* sem bloqueio */ }
    if (openOnTap && !moved) toggleMinimized();
  };

  if (minimized) return (
    <button
      ref={node => { panelRef.current = node; }}
      type="button"
      className="group fixed z-[90] flex h-[70px] w-[70px] select-none items-center justify-center rounded-[24px] border border-cyan-300/40 bg-slate-950/95 text-white shadow-[0_0_45px_rgba(34,211,238,0.42)] backdrop-blur-2xl transition hover:scale-105 active:scale-95"
      style={{ left: position.x, top: position.y, touchAction: "none", cursor: "grab" }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={event => finishDrag(event, true)}
      onPointerCancel={event => finishDrag(event, false)}
      aria-label="Abrir Guia Note Note"
    >
      <span className="absolute inset-1 animate-pulse rounded-[20px] border border-cyan-300/20" />
      <span className="absolute -inset-2 -z-10 rounded-[28px] bg-cyan-400/10 blur-xl" />
      <GraduationCap className="relative h-8 w-8 text-cyan-200 drop-shadow-[0_0_10px_rgba(103,232,249,.8)]" />
      <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
    </button>
  );

  return (
    <section ref={node => { panelRef.current = node; }} className="fixed z-[90] flex h-[min(700px,calc(100vh-24px))] w-[min(460px,calc(100vw-20px))] flex-col overflow-hidden rounded-[30px] border border-cyan-300/25 bg-slate-950/95 text-slate-100 shadow-[0_0_75px_rgba(14,165,233,0.28)] backdrop-blur-2xl" style={{ left: position.x, top: position.y }}>
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-blue-600/10 blur-3xl" />
      <header className="relative cursor-move select-none border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4" style={{ touchAction: "none" }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={event => finishDrag(event, false)} onPointerCancel={event => finishDrag(event, false)}>
        <div className="mb-2 flex items-center justify-center text-cyan-300/50"><GripHorizontal className="h-4 w-4" /></div>
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10"><Orbit className="h-6 w-6 text-cyan-300" /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" /></div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-black tracking-tight">Guia Note Note</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Online</span></div><p className="mt-0.5 text-xs text-slate-400">Tutorial interativo • arraste para mover</p></div>
          <button type="button" onClick={toggleMinimized} className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-2.5 text-cyan-200 transition hover:bg-cyan-400/10" aria-label="Minimizar tutorial"><Minimize2 className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Zap className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Modo</p><p className="text-[11px] font-bold">Tutorial</p></div><div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Bot className="mx-auto mb-1 h-3.5 w-3.5 text-blue-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Acesso</p><p className="text-[11px] font-bold">Só leitura</p></div><div className="rounded-xl border border-white/10 bg-white/[0.035] p-2 text-center"><Sparkles className="mx-auto mb-1 h-3.5 w-3.5 text-violet-300"/><p className="text-[9px] uppercase tracking-wider text-slate-500">Dados</p><p className="text-[11px] font-bold">Não altera</p></div></div>
      </header>
      <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3"><p className="text-[10px] font-black uppercase tracking-[0.17em] text-cyan-300">Você está em</p><p className="mt-1 font-bold text-white">{contextualGuide.area} • {contextualGuide.title}</p></div>
        {messages.map(message => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "user" ? <div className="max-w-[84%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg">{message.text}</div> : <div className="max-w-[94%] space-y-2"><div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-sm shadow-xl"><div className="mb-1.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><Bot className="h-3.5 w-3.5"/> Guia Note Note</div><p className="leading-relaxed text-slate-200">{message.text}</p></div>{message.guide && <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-b from-cyan-400/[0.055] to-white/[0.025]"><div className="border-b border-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{message.guide.area}</p><h3 className="mt-1 text-base font-black text-white">{message.guide.title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{message.guide.intro}</p></div><ol className="space-y-3 p-4">{message.guide.steps.map((step, index) => <li key={`${message.guide?.id}-${index}`} className="flex gap-3 text-sm leading-relaxed text-slate-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-xs font-black text-cyan-300">{String(index + 1).padStart(2, "0")}</span><span>{step}</span></li>)}</ol>{message.guide.tip && <div className="mx-4 mb-4 flex gap-2 rounded-xl border border-violet-300/10 bg-violet-400/[0.06] p-3 text-xs leading-relaxed text-slate-400"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-violet-300"/><span><strong className="text-violet-200">Dica:</strong> {message.guide.tip}</span></div>}</div>}</div>}</div>)}
        {thinking && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.2s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.1s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"/></div></div>}
      </div>
      <div className="relative border-t border-white/10 bg-slate-950/90 p-3"><button type="button" onClick={() => { window.location.href = "/tutorial#suporte"; }} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/15"><MessageCircle className="h-4 w-4" />Falar com o suporte</button><div className="mb-3 flex gap-2 overflow-x-auto pb-1">{quickTopics.map(topic => <button key={topic} type="button" onClick={() => ask(topic)} className="whitespace-nowrap rounded-xl border border-cyan-300/15 bg-cyan-400/[0.04] px-3 py-2 text-[11px] font-bold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-400/10">{topic}</button>)}</div><form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] p-1.5 focus-within:border-cyan-300/30"><Input value={input} onChange={event => setInput(event.target.value)} placeholder="Pergunte como usar uma função..." autoComplete="off" className="border-0 bg-transparent text-slate-100 placeholder:text-slate-500 focus-visible:ring-0" /><Button type="submit" size="icon" disabled={!input.trim() || thinking} className="rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg hover:opacity-90"><Send className="h-4 w-4"/></Button></form><p className="mt-2 flex items-center justify-center gap-1 text-[9px] uppercase tracking-[0.12em] text-slate-600"><ChevronRight className="h-3 w-3"/> O guia orienta; não executa ações</p></div>
    </section>
  );
}
