import { useCallback, useState } from "react";

type OliviaExpertResult = {
  reply?: string;
  databaseId?: number;
  planner?: {
    goal?: string;
    tools?: string[];
  };
};

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);
  const [activeContext, setActiveContext] = useState<{
    databaseId?: number;
    goal?: string;
    tools?: string[];
  } | undefined>(undefined);

  const ask = useCallback(async (message: string) => {
    if (!enabled) return null;
    setPending(true);
    try {
      const response = await fetch("/api/olivia-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as OliviaExpertResult;
      setActiveContext({
        databaseId: data.databaseId,
        goal: data.planner?.goal,
        tools: data.planner?.tools,
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
