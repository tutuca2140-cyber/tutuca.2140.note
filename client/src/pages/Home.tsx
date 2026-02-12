import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-2 border-primary rounded-xl p-10 shadow-2xl shadow-primary/20">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="text-5xl font-bold mb-3 text-primary tracking-[0.1em]">
              DEATH NOTE
            </div>
            <p className="text-muted-foreground text-xs tracking-[0.1em] uppercase">
              Sistema de Gestão Financeira
            </p>
            <div className="h-1 w-24 bg-gradient-to-r from-primary to-blue-400 mx-auto mt-4 rounded-full"></div>
          </div>

          {/* Descrição */}
          <div className="mb-8 text-center">
            <p className="text-sm text-muted-foreground">
              Controle completo de empréstimos, pagamentos e financiamentos com isolamento de dados e auditoria integrada.
            </p>
          </div>

          {/* Botão de Login */}
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            className="w-full h-12 text-base font-semibold tracking-wide uppercase"
            size="lg"
          >
            🚀 Entrar com Manus
          </Button>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-[0.1em]">
              DEATH NOTE v1.0
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              © 2026 DEATH NOTE. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
