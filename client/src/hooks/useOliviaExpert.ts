import { useCallback, useState } from "react";

type OliviaExpertResult = {
  reply?: string;
  databaseId?: number;
  search?: string | null;
};

type OliviaCalculationResult = {
  handled?: boolean;
  reply?: string;
};

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);
  const [activeContext, setActiveContext] = useState<{
    databaseId?: number;
    activeSearch?: string | null;
  } | undefined>(undefined);

  const ask = useCallback(async (message: string) => {
    if (!enabled) return null;
    setPending(true);
    try {
      // Contas financeiras e física básica passam primeiro pelo calculador
      // determinístico. Isso evita depender de aproximações do modelo de IA.
      try {
        const calculationResponse = await fetch("/api/olivia-calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message }),
        });
        if (calculationResponse.ok) {
          const calculation = (await calculationResponse.json()) as OliviaCalculationResult;
          if (calculation.handled && calculation.reply?.trim()) {
            return calculation.reply.trim();
          }
        }
      } catch {
        // Se a ferramenta determinística não reconhecer a pergunta, o núcleo
        // conversacional continua normalmente.
      }

      const response = await fetch("/api/olivia-core", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as OliviaExpertResult;
      setActiveContext({
        databaseId: data.databaseId,
        activeSearch: data.search ?? null,
      });
      return data.reply?.trim() || null;
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  }, [enabled]);

  return { ask, pending, activeContext };
}
