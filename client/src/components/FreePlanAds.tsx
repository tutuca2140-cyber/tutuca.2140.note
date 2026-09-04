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

  return null;
}
