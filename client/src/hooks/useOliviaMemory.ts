import { useCallback, useEffect, useState } from "react";

export type OliviaMemoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type MemoryResponse = {
  messages?: OliviaMemoryMessage[];
  settings?: {
    continuityCoefficient?: number;
    memoryEnabled?: boolean;
    voiceEnabled?: boolean;
  };
};

export function useOliviaMemory(enabled: boolean) {
  const [memory, setMemory] = useState<OliviaMemoryMessage[]>([]);
  const [continuityCoefficient, setContinuityCoefficient] = useState(72);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch("/api/olivia-memory", { credentials: "include" });
      if (!response.ok) return;
      const data = (await response.json()) as MemoryResponse;
      setMemory((data.messages ?? []).filter(
        item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string"
      ));
      setContinuityCoefficient(Number(data.settings?.continuityCoefficient ?? 72));
      setMemoryEnabled(data.settings?.memoryEnabled !== false);
      setVoiceEnabled(data.settings?.voiceEnabled !== false);
    } finally {
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) void reload();
    else {
      setMemory([]);
      setLoaded(false);
    }
  }, [enabled, reload]);

  const remember = useCallback(async (userMessage: string, assistantMessage: string) => {
    if (!enabled || !memoryEnabled) return;
    const exchange: OliviaMemoryMessage[] = [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ];
    setMemory(current => [...current, ...exchange].slice(-40));
    try {
      await fetch("/api/olivia-memory", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, assistantMessage }),
      });
    } catch {
      // A conversa continua mesmo se a persistência estiver temporariamente indisponível.
    }
  }, [enabled, memoryEnabled]);

  return {
    memory,
    loaded,
    continuityCoefficient,
    memoryEnabled,
    voiceEnabled,
    remember,
    reload,
  };
}
