import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { GripVertical, MessageCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const ICON_SIZE = 64;
const EDGE = 16;

type Position = { x: number; y: number };

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(
      Math.max(EDGE, position.x),
      window.innerWidth - ICON_SIZE - EDGE
    ),
    y: Math.min(
      Math.max(EDGE, position.y),
      window.innerHeight - ICON_SIZE - EDGE
    ),
  };
}

function initialPosition(): Position {
  if (typeof window === "undefined") return { x: 24, y: 120 };
  const stored = window.localStorage.getItem("olivia-button-position");
  if (stored) {
    try {
      return clampPosition(JSON.parse(stored) as Position);
    } catch {
      // Ignora posições antigas inválidas.
    }
  }
  return clampPosition({
    x: window.innerWidth - ICON_SIZE - 24,
    y: window.innerHeight - ICON_SIZE - 24,
  });
}

export default function OliviaAssistant() {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [position, setPosition] = useState<Position>(initialPosition);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Eu sou a **Olivia**. Posso localizar clientes e consultar contratos, parcelas e pagamentos do banco selecionado.",
    },
  ]);
  const drag = useRef<{
    pointerId: number;
    origin: Position;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const chat = trpc.olivia.chat.useMutation();

  useEffect(() => {
    const onResize = () => setPosition(current => clampPosition(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (open) {
      setShowHint(false);
      return;
    }
    const firstHint = window.setTimeout(() => setShowHint(true), 2_500);
    const hideHint = window.setTimeout(() => setShowHint(false), 8_500);
    const interval = window.setInterval(() => {
      setShowHint(true);
      window.setTimeout(() => setShowHint(false), 5_000);
    }, 45_000);
    return () => {
      window.clearTimeout(firstHint);
      window.clearTimeout(hideHint);
      window.clearInterval(interval);
    };
  }, [open]);

  const panelStyle = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const width = Math.min(400, window.innerWidth - 24);
    const height = Math.min(620, window.innerHeight - 32);
    return {
      width,
      height,
      left: Math.min(
        Math.max(12, position.x + ICON_SIZE - width),
        window.innerWidth - width - 12
      ),
      top: Math.min(
        Math.max(12, position.y - height - 12),
        window.innerHeight - height - 12
      ),
    };
  }, [position, open]);

  const sendMessage = async (content: string) => {
    const history = messages
      .filter(message => message.role !== "system")
      .slice(-10)
      .map(message => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));
    setMessages(current => [...current, { role: "user", content }]);
    try {
      const result = await chat.mutateAsync({
        prompt: content,
        messages: history,
      });
      setMessages(current => [
        ...current,
        { role: "assistant", content: result.answer },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A Olivia não conseguiu responder agora.";
      toast.error(message);
      setMessages(current => [
        ...current,
        {
          role: "assistant",
          content: `Não consegui concluir essa consulta. ${message}`,
        },
      ]);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      origin: position,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 6) current.moved = true;
    setPosition(
      clampPosition({
        x: current.origin.x + deltaX,
        y: current.origin.y + deltaY,
      })
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.localStorage.setItem(
      "olivia-button-position",
      JSON.stringify(position)
    );
    drag.current = null;
    if (!current.moved) setOpen(value => !value);
  };

  return (
    <>
      {open && panelStyle && (
        <section
          aria-label="Conversa com Olivia"
          className="fixed z-[70] overflow-hidden rounded-2xl border border-primary/20 bg-background shadow-2xl shadow-primary/10"
          style={panelStyle}
        >
          <header className="flex h-16 items-center gap-3 border-b bg-gradient-to-r from-slate-950 via-blue-950 to-cyan-950 px-4 text-white">
            <div className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-cyan-300/50 bg-white/10">
              <img
                src="/brand/note-note-icon.png"
                alt="Olivia"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-blue-950 bg-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-semibold">
                Olivia <Sparkles className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="truncate text-xs text-cyan-100/80">
                Assistente do Note Note · somente leitura
              </p>
            </div>
            <GripVertical className="h-5 w-5 text-white/40" />
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Fechar Olivia"
            >
              <X className="h-5 w-5" />
            </Button>
          </header>
          <AIChatBox
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={chat.isPending}
            placeholder="Pergunte sobre um cliente ou contrato..."
            emptyStateMessage="Como posso ajudar?"
            suggestedPrompts={[
              "Localize um cliente pelo nome",
              "Quais parcelas estão atrasadas?",
              "Mostre os próximos vencimentos",
            ]}
            className="rounded-none border-0 shadow-none"
            height="calc(100% - 64px)"
          />
        </section>
      )}

      <div
        className="fixed z-[80]"
        style={{ left: position.x, top: position.y, touchAction: "none" }}
      >
        {showHint && !open && (
          <div className="absolute right-[72px] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl border bg-background px-3 py-2 text-sm font-medium shadow-lg">
            Fale com a Olivia
          </div>
        )}
        <button
          type="button"
          aria-label={open ? "Fechar Olivia" : "Falar com a Olivia"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="group relative grid h-16 w-16 cursor-grab place-items-center overflow-hidden rounded-full border-2 border-cyan-300 bg-gradient-to-br from-blue-700 via-blue-900 to-slate-950 shadow-xl shadow-blue-950/30 transition-transform hover:scale-105 active:cursor-grabbing"
        >
          <img
            src="/brand/note-note-icon.png"
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <span className="absolute bottom-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-cyan-500">
            <MessageCircle className="h-3 w-3 text-white" />
          </span>
        </button>
      </div>
    </>
  );
}
