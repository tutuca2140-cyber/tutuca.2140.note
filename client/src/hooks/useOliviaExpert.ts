import { useCallback, useState } from "react";

type OliviaExpertResult = {
  reply?: string;
  intent?: string;
  context?: {
    activeIntent?: string;
    activeSearch?: string | null;
  };
};

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);
  const [activeContext, setActiveContext] = useState<OliviaExpertResult["context"]>(undefined);

  const ask = useCallback(async (message: string) => {
    if (!enabled) return null;
    setPending(true);
    try {
      const response = await fetch("/api/olivia-intelligence-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as OliviaExpertResult;
      setActiveContext(data.context);
      return data.reply?.trim() || null;
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  }, [enabled]);

  return { ask, pending, activeContext };
}
