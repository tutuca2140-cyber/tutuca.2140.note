import { useCallback, useState } from "react";

export function useOliviaExpert(enabled: boolean) {
  const [pending, setPending] = useState(false);

  const ask = useCallback(async (message: string) => {
    if (!enabled) return null;
    setPending(true);
    try {
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
  }, [enabled]);

  return { ask, pending };
}
