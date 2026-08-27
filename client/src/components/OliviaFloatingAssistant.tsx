import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOliviaMemory } from "@/hooks/useOliviaMemory";
import { useOliviaV2 } from "@/hooks/useOliviaV2";
import { useOliviaVoice } from "@/hooks/useOliviaVoice";
import { trpc } from "@/lib/trpc";
import { Grip, Mic, MicOff, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const OLIVIA_AVATAR = "/brand/olivia-assistant.webp";
const POSITION_KEY = "note-note:olivia-position:v1";
type Point = { x: number; y: number };
type Message = { role: "user" | "assistant"; content: string };
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function renderOliviaMessage(content: string): ReactNode {
  const lines = content.split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*|^[^:•]{2,42}:)/g).filter(Boolean);
    return (
      <span key={`${lineIndex}-${line}`} className="block min-h-[1.25rem]">
        {parts.map((part, index) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={index} className="font-semibold text-cyan-700 dark:text-cyan-300">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (/^[^:•]{2,42}:$/.test(part)) {
            return (
              <strong key={index} className="font-semibold text-foreground">
                {part}
              </strong>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  });
}

export default function OliviaFloatingAssistant() {
  const [position, setPosition] = useState<Point | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [open, setOpen] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou a Olivia. Posso consultar clientes, contratos, parcelas e valores do banco autorizado.",
    },
  ]);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const memoryApplied = useRef(false);
  const { data: access } = trpc.olivia.access.useQuery();
  const chat = trpc.olivia.chat.useMutation();
  const enabled = access?.enabled === true;
  const oliviaV2 = useOliviaV2(enabled);
  const memory = useOliviaMemory(enabled);
  const voice = useOliviaVoice(text => {
    if (enabled) void sendContent(text);
  });

  useEffect(() => {
    const updateViewport = () => {
      const next = { width: window.innerWidth, height: window.innerHeight };
      setViewport(next);
      setPosition(current => {
        let saved = current;
        if (!saved) {
          try {
            saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null") as Point | null;
          } catch {
            saved = null;
          }
        }
        return {
          x: clamp(saved?.x ?? next.width - 92, 12, next.width - 84),
          y: clamp(saved?.y ?? next.height - 108, 76, next.height - 84),
        };
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!access?.enabled || open) {
      setShowInvitation(false);
      return;
    }
    let hideTimer: number | undefined;
    const show = () => {
      setShowInvitation(true);
      hideTimer = window.setTimeout(() => setShowInvitation(false), 7000);
    };
    const firstTimer = window.setTimeout(show, 4500);
    const interval = window.setInterval(show, 60000);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(hideTimer);
      window.clearInterval(interval);
    };
  }, [access?.enabled, open]);

  useEffect(() => {
    if (!enabled) {
      memoryApplied.current = false;
      return;
    }
    if (memory.loaded && !memoryApplied.current) {
      memoryApplied.current = true;
      if (memory.memory.length) setMessages(memory.memory);
    }
  }, [enabled, memory.loaded, memory.memory]);

  useEffect(() => {
    if (open && enabled) void memory.reload();
  }, [open, enabled]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chat.isPending, open]);

  if (!access?.enabled || !position) return null;

  const iconSize = 72;
  const panelWidth = Math.min(390, viewport.width - 24);
  const panelHeight = Math.min(610, viewport.height - 92);
  const panelX = clamp(
    position.x + iconSize + panelWidth + 12 <= viewport.width
      ? position.x + iconSize + 10
      : position.x - panelWidth - 10,
    12,
    viewport.width - panelWidth - 12
  );
  const panelY = clamp(
    position.y + iconSize - panelHeight,
    74,
    viewport.height - panelHeight - 12
  );

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (Math.hypot(dx, dy) > 5) current.moved = true;
    if (!current.moved) return;
    setShowInvitation(false);
    setPosition({
      x: clamp(current.originX + dx, 12, viewport.width - 84),
      y: clamp(current.originY + dy, 76, viewport.height - 84),
    });
  };

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.moved) {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
      return;
    }
    setShowInvitation(false);
    setOpen(value => !value);
  };

  async function sendContent(rawContent: string) {
    const content = rawContent.trim();
    if (!content || chat.isPending) return;
    setMessage("");
    setMessages(current => [...current, { role: "user", content }]);

    const v2Result = oliviaV2.tryHandle(content);
    if (v2Result) {
      setMessages(current => [...current, { role: "assistant", content: v2Result.reply }]);
      void memory.remember(content, v2Result.reply);
      return;
    }

    try {
      const result = await chat.mutateAsync({ message: content });
      setMessages(current => [...current, { role: "assistant", content: result.reply }]);
      void memory.remember(content, result.reply);
    } catch (error) {
      setMessages(current => [
        ...current,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Não consegui concluir a consulta agora.",
        },
      ]);
    }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault();
    await sendContent(message);
  };

  return (
    <>
      {open && (
        <section
          aria-label="Chat com a assistente Olivia"
          className="fixed z-[70] flex overflow-hidden rounded-3xl border border-cyan-400/30 bg-background/95 shadow-[0_24px_80px_rgba(8,145,178,0.28)] backdrop-blur-xl"
          style={{ left: panelX, top: panelY, width: panelWidth, height: panelHeight }}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="relative flex items-center gap-3 overflow-hidden bg-gradient-to-r from-slate-950 via-blue-950 to-cyan-900 px-4 py-3.5 text-white">
              <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="relative">
                <div className="absolute -inset-1 rounded-full bg-cyan-300/20 blur-md" />
                <img
                  src={OLIVIA_AVATAR}
                  alt="Olivia"
                  className="relative h-12 w-12 rounded-full border-2 border-cyan-300 object-cover shadow-[0_0_18px_rgba(103,232,249,0.7)]"
                />
              </div>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="bg-gradient-to-r from-white via-cyan-100 to-cyan-300 bg-clip-text text-lg font-bold tracking-wide text-transparent">
                    Olivia
                  </p>
                  <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-cyan-100/90">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_7px_rgba(74,222,128,0.9)]" />
                  Assistente inteligente do Note Note
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="relative text-white hover:bg-white/10 hover:text-white"
                aria-label="Fechar Olivia"
              >
                <X className="h-5 w-5" />
              </Button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(135deg,rgba(8,47,73,0.05)_25%,transparent_25%,transparent_50%,rgba(8,47,73,0.05)_50%,rgba(8,47,73,0.05)_75%,transparent_75%)] bg-[length:26px_26px] p-4">
              {messages.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-end gap-2 ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {item.role === "assistant" && (
                    <img
                      src={OLIVIA_AVATAR}
                      alt=""
                      className="h-7 w-7 rounded-full border border-cyan-300 object-cover shadow-sm"
                    />
                  )}
                  <div
                    className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                      item.role === "user"
                        ? "rounded-br-md bg-gradient-to-br from-blue-600 to-cyan-600 text-white"
                        : "rounded-bl-md border border-cyan-500/15 bg-card/95 text-card-foreground shadow-[0_8px_24px_rgba(8,145,178,0.08)]"
                    }`}
                  >
                    {item.role === "assistant" ? renderOliviaMessage(item.content) : item.content}
                  </div>
                </div>
              ))}
              {chat.isPending && (
                <div className="flex items-end gap-2">
                  <img
                    src={OLIVIA_AVATAR}
                    alt=""
                    className="h-7 w-7 rounded-full border border-cyan-300 object-cover"
                  />
                  <div className="flex gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3">
                    {[0, 1, 2].map(dot => (
                      <span
                        key={dot}
                        className="h-2 w-2 animate-bounce rounded-full bg-cyan-500"
                        style={{ animationDelay: `${dot * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="border-t bg-background/95 p-3">
              <div className="flex items-center gap-1 rounded-full border bg-muted/40 p-1.5 pl-4 focus-within:ring-2 focus-within:ring-cyan-500/40">
                <Input
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder={voice.listening ? "Ouvindo sua pergunta..." : "Pergunte à Olivia..."}
                  className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  maxLength={500}
                  disabled={chat.isPending}
                />
                {memory.voiceEnabled && voice.listeningSupported && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 rounded-full"
                    onClick={voice.listening ? voice.stopListening : voice.startListening}
                    aria-label={voice.listening ? "Parar de ouvir" : "Perguntar por voz"}
                    title="Perguntar por voz"
                  >
                    {voice.listening ? (
                      <MicOff className="h-4 w-4 text-rose-500" />
                    ) : (
                      <Mic className="h-4 w-4 text-cyan-600" />
                    )}
                  </Button>
                )}
                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500"
                  disabled={!message.trim() || chat.isPending}
                  aria-label="Enviar mensagem"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Dados limitados às suas permissões · continuidade {memory.continuityCoefficient}%
              </p>
            </form>
          </div>
        </section>
      )}

      {showInvitation && !open && (
        <button
          type="button"
          onClick={() => {
            setShowInvitation(false);
            setOpen(true);
          }}
          className={`fixed z-[69] animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-cyan-300/40 bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-xl ${position.x > viewport.width / 2 ? "-translate-x-full" : ""}`}
          style={{
            left:
              position.x > viewport.width / 2
                ? position.x - 10
                : position.x + iconSize + 10,
            top: position.y + 12,
          }}
        >
          Fale com a assistente
        </button>
      )}

      <button
        type="button"
        aria-label="Abrir ou mover a assistente Olivia"
        title="Clique para conversar ou arraste para mover"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(value => !value);
          }
        }}
        className="fixed z-[71] h-[72px] w-[72px] touch-none cursor-grab rounded-full border-4 border-cyan-300 bg-slate-950 p-1 shadow-[0_0_0_5px_rgba(6,182,212,0.12),0_12px_35px_rgba(8,145,178,0.55)] transition-transform hover:scale-105 active:cursor-grabbing active:scale-95"
        style={{ left: position.x, top: position.y }}
      >
        <span className="absolute -inset-2 -z-10 animate-pulse rounded-full border border-cyan-400/40" />
        <img
          src={OLIVIA_AVATAR}
          alt=""
          draggable={false}
          className="h-full w-full select-none rounded-full object-cover"
        />
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-emerald-500">
          <Grip className="h-3 w-3 text-white" />
        </span>
      </button>
    </>
  );
}
