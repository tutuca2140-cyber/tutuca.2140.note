import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CreditCard,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";

type AccountContext = {
  success?: boolean;
  commercial?: boolean;
  plan?: "free" | "basic" | "plus" | null;
  status?: string | null;
};

export default function CommercialPaymentGate({
  children,
}: {
  children: ReactNode;
}) {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<AccountContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/commercial-account?scope=context", {
          credentials: "include",
          cache: "no-store",
        });
        const result = (await response
          .json()
          .catch(() => ({}))) as AccountContext;
        if (!cancelled && response.ok) setContext(result);
      } catch {
        // As páginas protegidas continuam responsáveis pelo próprio fluxo de autenticação.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/20 text-muted-foreground">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verificando assinatura...
        </div>
      </div>
    );
  }

  const paymentRequired = Boolean(
    context?.commercial &&
    context.status !== "active" &&
    context.status !== "paid"
  );

  if (!paymentRequired) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-sky-100 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <Card className="w-full border-amber-200 shadow-2xl shadow-slate-900/10">
          <CardContent className="p-8 text-center sm:p-10">
            <img
              src="/brand/note-note-logo-official.png"
              alt="Note Note"
              className="mx-auto h-12 w-auto"
            />
            <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <LockKeyhole className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
              Sistema aguardando pagamento
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Sua assinatura está aguardando regularização. Enquanto o pagamento
              não for confirmado, sua conta permanece disponível somente para
              visualizar o Dashboard.
            </p>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-950">
              <div className="flex items-center gap-2 font-bold">
                <CreditCard className="h-4 w-4" />
                Assinatura {context?.plan === "plus" ? "Plus" : "Basic"}
              </div>
              <p className="mt-2 leading-6">
                Assim que o pagamento for confirmado, as funções do sistema
                voltam a ser liberadas conforme o seu plano e suas permissões.
              </p>
            </div>
            <Button
              className="mt-7 h-12 w-full"
              onClick={() => navigate("/dashboard")}
            >
              <LayoutDashboard className="mr-2 h-5 w-5" />
              Voltar para o Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
