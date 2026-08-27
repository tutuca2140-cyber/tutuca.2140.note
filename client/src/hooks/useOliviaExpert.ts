import { useCallback, useRef, useState } from "react";
import { useOliviaActions } from "@/hooks/useOliviaActions";

const ACTION_HINT = /\b(criar|cadastrar|registrar|lançar|lancar|atualizar|alterar|editar|marcar|incluir|excluir|apagar|deletar|remover)\b/i;

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);
  const actions = useOliviaActions(enabled);
  const pendingActionRef = useRef(false);

  const ask = useCallback(async (message: string) => {
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

      const response = await fetch("/api/olivia-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { reply?: string };
      return data.reply?.trim() || null;
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  }, [actions, enabled]);

  return { ask, pending: pending || actions.isPending };
}
