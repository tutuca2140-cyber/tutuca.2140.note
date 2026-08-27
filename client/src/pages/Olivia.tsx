import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOliviaExpert } from "@/hooks/useOliviaExpert";
import { useOliviaMemory } from "@/hooks/useOliviaMemory";
import { useOliviaV2 } from "@/hooks/useOliviaV2";
import { trpc } from "@/lib/trpc";
import { Clock3, Send, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };
const OLIVIA_AVATAR = "/brand/olivia-assistant.webp";

const suggestions = [
  "Quais recebimentos vencem hoje?",
  "Mostre os clientes em atraso",
  "Resuma os valores pagos e a receber",
  "Liste os contratos ativos",
];

const planLabel = (plan: string) =>
  plan === "basic_plus" ? "Basic +" : plan === "plus" ? "Plus" : "Basic";

export default function Olivia() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Oi! Tudo bem? Como posso te ajudar?" },
  ]);
  const { data: access, isLoading } = trpc.olivia.access.useQuery();
  const enabled = access?.enabled === true;
  const { data: history = [], refetch: refreshHistory } =
    trpc.olivia.history.useQuery(undefined, { enabled });
  const chat = trpc.olivia.chat.useMutation();
  const oliviaV2 = useOliviaV2(enabled);
  const expert = useOliviaExpert(enabled);
  const memory = useOliviaMemory(enabled);
  const isPending = chat.isPending || expert.pending;

  const send = async (text?: string) => {
    const content = (text ?? message).trim();
    if (!content || isPending) return;
    setMessage("");
    setMessages(current => [...current, { role: "user", content }]);

    const v2Result = oliviaV2.tryHandle(content);
    if (v2Result) {
      setMessages(current => [...current, { role: "assistant", content: v2Result.reply }]);
      void memory.remember(content, v2Result.reply);
      return;
    }

    let streamed = false;
    setMessages(current => [...current, { role: "assistant", content: "" }]);
    const updateStreamBubble = (partial: string) => {
      streamed = true;
      setMessages(current => {
        const next = [...current];
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (next[index].role === "assistant") {
            next[index] = { role: "assistant", content: partial };
            break;
          }
        }
        return next;
      });
    };

    const expertReply = await expert.ask(content, updateStreamBubble);
    if (expertReply) {
      if (!streamed) updateStreamBubble(expertReply);
      void memory.remember(content, expertReply);
      return;
    }

    setMessages(current => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        if (next[index].role === "assistant" && !next[index].content) {
          next.splice(index, 1);
          break;
        }
      }
      return next;
    });

    try {
      const result = await chat.mutateAsync({ message: content });
      setMessages(current => [...current, { role: "assistant", content: result.reply }]);
      void memory.remember(content, result.reply);
      void refreshHistory();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Não foi possível falar com a Olivia.";
      setMessages(current => [...current, { role: "assistant", content: errorText }]);
      toast.error(errorText);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  if (isLoading)
    return (
      <DashboardLayout>
        <p className="py-12 text-center text-muted-foreground">Carregando Olivia...</p>
      </DashboardLayout>
    );

  if (!access?.enabled)
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <img src={OLIVIA_AVATAR} alt="Olivia" className="h-24 w-24 rounded-full border-4 border-muted object-cover grayscale" />
            <h1 className="mt-4 text-2xl font-bold">Olivia não disponível</h1>
            <p className="mt-2 text-muted-foreground">O Super Administrador precisa habilitar a assistente para a sua conta.</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-slate-950 via-blue-950 to-cyan-900 p-5 text-white shadow-[0_20px_60px_rgba(8,145,178,0.18)]">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_1px,transparent_1px)] [background-size:20px_20px]" />
          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <img src={OLIVIA_AVATAR} alt="Olivia" className="h-20 w-20 rounded-full border-2 border-cyan-300 object-cover shadow-[0_0_25px_rgba(103,232,249,0.65)]" />
              <div>
                <h1 className="text-3xl font-bold">Olivia</h1>
                <p className="mt-1 text-cyan-100">Assistente virtual segura do Note Note</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Online e pronta para ajudar
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge className="border-cyan-300/40 bg-cyan-300/15 text-cyan-50">{planLabel(access.plan)}</Badge>
              <Badge className="border-white/20 bg-white/10 text-white"><ShieldCheck className="mr-1 h-3 w-3" />Banco autorizado</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden border-cyan-400/20 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-r from-slate-950 to-blue-950 text-white">
              <CardTitle className="flex items-center gap-3 text-base">
                <img src={OLIVIA_AVATAR} alt="" className="h-9 w-9 rounded-full border border-cyan-300 object-cover" />
                <span>Chat com a Olivia</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[52vh] min-h-[420px] space-y-4 overflow-y-auto bg-[linear-gradient(135deg,rgba(8,47,73,0.05)_25%,transparent_25%,transparent_50%,rgba(8,47,73,0.05)_50%,rgba(8,47,73,0.05)_75%,transparent_75%)] bg-[length:28px_28px] p-4 sm:p-6">
                {messages.map((item, index) => (
                  <div key={index} className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    {item.role === "assistant" && <img src={OLIVIA_AVATAR} alt="" className="h-9 w-9 shrink-0 rounded-full border border-cyan-300 object-cover" />}
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${item.role === "user" ? "rounded-br-md bg-gradient-to-br from-blue-600 to-cyan-600 text-white" : "rounded-bl-md border bg-card"}`}>
                      {item.content}
                    </div>
                    {item.role === "user" && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><UserRound className="h-4 w-4" /></div>}
                  </div>
                ))}
                {isPending && messages[messages.length - 1]?.content !== "" && (
                  <div className="flex items-end gap-2">
                    <img src={OLIVIA_AVATAR} alt="" className="h-9 w-9 rounded-full border border-cyan-300 object-cover" />
                    <div className="flex gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3">
                      {[0, 1, 2].map(dot => <span key={dot} className="h-2 w-2 animate-bounce rounded-full bg-cyan-500" style={{ animationDelay: `${dot * 120}ms` }} />)}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t bg-background/95 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {suggestions.map(suggestion => (
                    <Button key={suggestion} type="button" size="sm" variant="outline" onClick={() => void send(suggestion)} disabled={isPending}>{suggestion}</Button>
                  ))}
                </div>
                <form onSubmit={submit} className="flex gap-2 rounded-full border bg-muted/40 p-1.5 pl-4 focus-within:ring-2 focus-within:ring-cyan-500/40">
                  <Input value={message} onChange={event => setMessage(event.target.value)} placeholder="Fale com a Olivia..." className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" maxLength={500} disabled={isPending} />
                  <Button type="submit" size="icon" className="shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500" disabled={!message.trim() || isPending} aria-label="Enviar mensagem"><Send className="h-4 w-4" /></Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">A Olivia respeita suas permissões e nunca altera dados sem confirmação.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4" />Histórico recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.slice(0, 8).map(item => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="text-xs font-medium">{item.action.replace("olivia_", "").replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              ))}
              {!history.length && <p className="text-sm text-muted-foreground">As consultas realizadas aparecerão aqui.</p>}
              <div className="rounded-lg bg-primary/5 p-3 text-xs text-primary">
                <ShieldCheck className="mb-2 h-4 w-4" />
                Todas as ações são registradas e limitadas ao banco ativo.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
