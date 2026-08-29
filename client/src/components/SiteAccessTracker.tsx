import { useEffect } from "react";
import { useLocation } from "wouter";

const HEARTBEAT_MS = 5 * 60 * 1000;

function registerAccess(path: string) {
  const body = JSON.stringify({
    path,
    referrer: document.referrer || "",
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
