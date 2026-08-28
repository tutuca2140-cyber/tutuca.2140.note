import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SiteAccessTracker() {
  const [location] = useLocation();

  useEffect(() => {
    const path = String(location || "/").split("?")[0] || "/";
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
  }, [location]);

  return null;
}
