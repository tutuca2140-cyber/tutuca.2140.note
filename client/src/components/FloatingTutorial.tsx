import { Button } from "@/components/ui/button";
import { BookOpen, ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

type Position = { x: number; y: number };

const STORAGE_KEY = "note-note:tutorial-position";

const tutorialByRoute: Array<{ match: (path: string) => boolean; title: string; text: string }> = [
  {
    match: path => path === "/dashboard",
    title: "Dashboard",
    text: "Aqui você acompanha os principais indicadores financeiros, recebimentos, valores em aberto e o desempenho geral do banco selecionado.",
  },
  {
    match: path => path.startsWith("/clientes"),
    title: "Clientes",
    text: "Use esta área para cadastrar, localizar e consultar clientes. Os contratos e operações ficam vinculados ao cadastro correto.",
  },
  {
    match: path => path.startsWith("/emprestimos"),
    title: "Empréstimos",
    text: "Cadastre empréstimos, defina juros e acompanhe parcelas, saldo devedor e pagamentos do cliente.",
  },
  {
    match: path => path.startsWith("/pagamentos"),
    title: "Pagamentos",
    text: "Registre e consulte pagamentos. As entradas registradas são refletidas nos controles financeiros do sistema.",
  },
  {
    match: path => path.startsWith("/caixa"),
    title: "Caixa",
    text: "Acompanhe entradas, saídas e saldo do caixa do banco de dados atualmente selecionado.",
  },
  {
    match: path => path.startsWith("/veiculos"),
    title: "Veículos",
    text: "Cadastre e gerencie veículos disponíveis para venda ou financiamento.",
  },
  {
    match: path => path.startsWith("/produtos"),
    title: "Produtos",
    text: "Cadastre produtos e acompanhe as vendas e parcelamentos vinculados aos clientes.",
  },
  {
    match: path => path.startsWith("/financiamentos"),
    title: "Financiamentos",
    text: "Crie e acompanhe financiamentos, parcelas, pagamentos e o saldo restante de cada contrato.",
  },
  {
    match: path => path.startsWith("/contas-a-receber"),
    title: "Contas a receber",
    text: "Consulte vencimentos e valores que ainda serão recebidos para organizar as cobranças.",
  },
  {
    match: path => path.startsWith("/relatorios"),
    title: "Relatórios",
    text: "Gere relatórios usando os dados do banco em operação e os filtros disponíveis nesta área.",
  },
  {
    match: path => path.startsWith("/admin/usuarios"),
    title: "Usuários",
    text: "O Super Adm pode criar e editar usuários e definir as permissões de acesso de cada conta.",
  },
  {
    match: path => path.startsWith("/admin/sugestoes"),
    title: "Sugestões",
    text: "Aqui o Super Adm acompanha avaliações, comentários e sugestões enviadas pelos usuários.",
  },
  {
    match: path => path.startsWith("/admin/bancos"),
    title: "Bancos de Dados",
    text: "Gerencie os bancos de dados disponíveis e selecione quais informações cada operação deve utilizar.",
  },
];

function clampPosition(position: Position, width = 360, height = 210): Position {
  if (typeof window === "undefined") return position;
  const margin = 12;
  return {
    x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - height - margin)),
  };
}

export default function FloatingTutorial() {
  const [location] = useLocation();
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 24, y: 88 });
  const dragging = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const tutorial = useMemo(
    () => tutorialByRoute.find(item => item.match(location)) ?? {
      title: "Tutorial Note Note",
      text: "Navegue pelo menu para acessar as áreas do sistema. Você pode arrastar esta janela para qualquer ponto da tela.",
    },
    [location]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Position;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setPosition(clampPosition(parsed));
          return;
        }
      }
    } catch {
      // Ignora posição inválida salva anteriormente.
    }

    if (typeof window !== "undefined") {
      setPosition(clampPosition({ x: window.innerWidth - 384, y: 88 }));
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      setPosition(current => clampPosition(current, rect?.width ?? 360, rect?.height ?? 210));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragging.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rect = panelRef.current?.getBoundingClientRect();
    const next = clampPosition(
      { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
      rect?.width ?? 360,
      rect?.height ?? 210
    );
    setPosition(next);
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || dragging.current.pointerId !== event.pointerId) return;
    dragging.current = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
      // O tutorial continua funcionando mesmo sem armazenamento local.
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[70] h-12 rounded-full px-4 shadow-lg"
      >
        <BookOpen className="mr-2 h-5 w-5" />
        Tutorial
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[70] w-[calc(100vw-24px)] max-w-[360px] overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur"
      style={{ left: position.x, top: position.y, touchAction: "none" }}
    >
      <div
        className="flex cursor-move select-none items-center gap-2 border-b border-border bg-muted/60 px-3 py-2"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <GripHorizontal className="h-5 w-5 shrink-0 text-muted-foreground" />
        <BookOpen className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Tutorial • {tutorial.title}</p>
          <p className="text-[11px] text-muted-foreground">Arraste para mover pela tela</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMinimized(value => !value)}
          aria-label={minimized ? "Expandir tutorial" : "Minimizar tutorial"}
        >
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(false)}
          aria-label="Fechar tutorial"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!minimized && (
        <div className="space-y-3 p-4">
          <p className="text-sm leading-relaxed text-foreground">{tutorial.text}</p>
          <div className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            A janela acompanha sua navegação e muda a orientação de acordo com a área aberta. No celular, arraste pelo cabeçalho com o dedo.
          </div>
        </div>
      )}
    </div>
  );
}
