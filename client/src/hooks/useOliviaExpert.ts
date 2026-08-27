import { useCallback, useRef, useState } from "react";
import { useOliviaActions } from "@/hooks/useOliviaActions";

const ACTION_HINT = /\b(criar|cadastrar|registrar|lançar|lancar|atualizar|alterar|editar|marcar|incluir|excluir|apagar|deletar|remover)\b/i;
const INSIGHT_HINT = /\b(risco|previs[aã]o|prever|inadimpl[eê]ncia|chance de atraso|caixa previsto|pr[oó]ximos 30 dias)\b/i;

type ChunkHandler = (accumulated: string) => void;

async function readOliviaStream(message: string, onChunk?: ChunkHandler) {
  const response = await fetch("/api/olivia-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok || !response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  const consume = (block: string) => {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          accumulated += delta;
          onChunk?.(accumulated);
        }
      } catch {
        // fragmento SSE incompleto: permanece no buffer até o próximo bloco
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      consume(block);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return accumulated.trim() || null;
}

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);
  const actions = useOliviaActions(enabled);
  const pendingActionRef = useRef(false);

  const ask = useCallback(async (message: string, onChunk?: ChunkHandler) => {
    if (!enabled) return null;
    const normalized = message.trim().toLocaleLowerCase("pt-BR");

    if (pendingActionRef.current) {
      if (normalized === "confirmar") {
        setPending(true);
        try {
          const reply = await actions.confirm();
          pendingActionRef.current = false;
          return reply;
        } catch (error) {
          pendingActionRef.current = false;
          return error instanceof Error
            ? `Não consegui concluir a ação: ${error.message}`
            : "Não consegui concluir a ação confirmada.";
        } finally {
          setPending(false);
        }
      }
      actions.cancel();
      pendingActionRef.current = false;
    }

    setPending(true);
    try {
      if (ACTION_HINT.test(message)) {
        const plan = await actions.plan(message);
        if (plan?.reply) {
          pendingActionRef.current = Boolean(plan.action && plan.payload);
          return String(plan.reply);
        }
        if (plan?.question) return String(plan.question);
      }

      if (INSIGHT_HINT.test(message)) {
        const response = await fetch("/api/olivia-insights");
        if (response.ok) {
          const insights = await response.json();
          const enriched = `${message}\n\nIndicadores preditivos autorizados calculados pelo sistema: ${JSON.stringify(insights)}`;
          const streamed = await readOliviaStream(enriched, onChunk);
          if (streamed) return streamed;
        }
      }

      return await readOliviaStream(message, onChunk);
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  }, [actions, enabled]);

  return { ask, pending: pending || actions.isPending };
}
