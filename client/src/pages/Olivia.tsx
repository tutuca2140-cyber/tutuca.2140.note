import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Bot, Clock3, Send, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };

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
    {
      role: "assistant",
      content:
        "Olá! Sou Olivia, assistente virtual do Note Note. Posso consultar os dados autorizados do banco selecionado. Como posso ajudar?",
    },
  ]);
  const { data: access, isLoading } = trpc.olivia.access.useQuery();
  const { data: history = [], refetch: refreshHistory } =
    trpc.olivia.history.useQuery(undefined, {
      enabled: access?.enabled === true,
    });
  const chat = trpc.olivia.chat.useMutation();

  const send = async (text?: string) => {
    const content = (text ?? message).trim();
    if (!content || chat.isPending) return;
    setMessage("");
    setMessages(current => [...current, { role: "user", content }]);
    try {
      const result = await chat.mutateAsync({ message: content });
      setMessages(current => [
        ...current,
        { role: "assistant", content: result.reply },
      ]);
      void refreshHistory();
    } catch (error) {
      const content =
        error instanceof Error
          ? error.message
          : "Não foi possível falar com a Olivia.";
      setMessages(current => [...current, { role: "assistant", content }]);
      toast.error(content);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  if (isLoading)
    return (
      <DashboardLayout>
        <p className="py-12 text-center text-muted-foreground">
          Carregando Olivia...
        </p>
      </DashboardLayout>
    );

  if (!access?.enabled)
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-bold">Olivia não disponível</h1>
            <p className="mt-2 text-muted-foreground">
              O Super Administrador precisa habilitar a assistente para a sua
              conta.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <Bot className="h-8 w-8 text-primary" />
              Olivia
            </h1>
            <p className="mt-1 text-muted-foreground">
              Assistente virtual segura do Note Note
            </p>
          </div>
          <div className="flex gap-2">
            <Badge>{planLabel(access.plan)}</Badge>
            <Badge variant="outline">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Banco autorizado
            </Badge>
          </div>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-base">Chat com a Olivia</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[52vh] min-h-[420px] space-y-4 overflow-y-auto p-4 sm:p-6">
                {messages.map((item, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {item.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${item.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {item.content}
                    </div>
                    {item.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserRound className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {chat.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Bot className="h-4 w-4 animate-pulse" />
                    Olivia está consultando os dados autorizados...
                  </div>
                )}
              </div>
              <div className="border-t p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {suggestions.map(suggestion => (
                    <Button
                      key={suggestion}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void send(suggestion)}
                      disabled={chat.isPending}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
                <form onSubmit={submit} className="flex gap-2">
                  <Input
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    placeholder="Pergunte sobre clientes, contratos ou vencimentos..."
                    maxLength={500}
                    disabled={chat.isPending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!message.trim() || chat.isPending}
                    aria-label="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted-foreground">
                  A Olivia respeita suas permissões e nunca altera dados sem
                  confirmação.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" />
                Histórico recente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.slice(0, 8).map(item => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="text-xs font-medium">
                    {item.action.replace("olivia_", "").replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
              {!history.length && (
                <p className="text-sm text-muted-foreground">
                  As consultas realizadas aparecerão aqui.
                </p>
              )}
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
