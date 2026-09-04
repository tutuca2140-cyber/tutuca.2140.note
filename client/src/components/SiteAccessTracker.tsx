import { useEffect } from "react";
import { useLocation } from "wouter";

const HEARTBEAT_MS = 60 * 1000;

function trackingId(storage: Storage, key: string) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const next =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(key, next);
    return next;
  } catch {
    return `private-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function registerAccess(path: string) {
  const body = JSON.stringify({
    path,
    referrer: document.referrer || "",
    visitorId: trackingId(window.localStorage, "note-note-visitor-id"),
    sessionId: trackingId(window.sessionStorage, "note-note-visit-session"),
    language: navigator.language || "",
    screen: `${window.screen.width}x${window.screen.height}`,
  });

  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/site-access", blob);
    return;
  }

  void fetch("/api/site-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => undefined);
}

export default function SiteAccessTracker() {
  const [location] = useLocation();

  useEffect(() => {
    const path = String(location || "/").split("?")[0] || "/";
    registerAccess(path);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        registerAccess(path);
      }
    }, HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        registerAccess(path);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [location]);

  return null;
}
