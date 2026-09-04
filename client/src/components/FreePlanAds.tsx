import { useEffect } from "react";

const ADSENSE_CLIENT = "ca-pub-9420443147906669";
const ADSENSE_SCRIPT_ID = "notenote-adsense-free-plan";

export default function FreePlanAds({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || document.getElementById(ADSENSE_SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.appendChild(script);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-background px-4 py-2 text-center text-[11px] text-muted-foreground shadow-sm">
      <span className="font-semibold">Plano Grátis</span>
      <span className="mx-2" aria-hidden="true">
        •
      </span>
      Este acesso pode exibir anúncios. Assine um plano para usar o Note Note
      sem publicidade.
    </div>
  );
}
