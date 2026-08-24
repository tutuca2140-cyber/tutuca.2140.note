import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [resetToken] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("reset") ?? ""
      : ""
  );

  const [isReset, setIsReset] = useState(() => Boolean(resetToken));
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const loginMutation = trpc.auth.loginLocal.useMutation();
  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation();
  const resetPasswordMutation = trpc.auth.resetPassword.useMutation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await loginMutation.mutateAsync({
        username,
        password,
        rememberMe,
      });

      if (result.success) {
        toast.success("Login realizado com sucesso!");
        setTimeout(() => setLocation("/dashboard"), 300);
      }
    } catch (error: any) {
      toast.error(error.message || "Usuário ou senha inválidos");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await requestResetMutation.mutateAsync({
        identifier: resetIdentifier,
        origin: window.location.origin,
      });

      toast.success(
        "Se o cadastro existir, a solicitação será encaminhada com segurança."
      );
      setIsReset(false);
      setResetIdentifier("");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível solicitar a recuperação");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (resetPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsLoading(true);

    try {
      await resetPasswordMutation.mutateAsync({
        token: resetToken,
        password: resetPassword,
      });

      toast.success("Senha redefinida com sucesso.");
      setIsReset(false);
      setResetPassword("");
      window.history.replaceState({}, document.title, "/login");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível redefinir a senha");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-blue-600 text-white mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">NOTE NOTE</h1>
          <p className="text-gray-600 mt-2">
            Sistema de Gestão Financeira
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>
              Entre com seu usuário e senha cadastrados pelo administrador.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isReset && resetToken ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Salvando..." : "Redefinir senha"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsReset(false)}
                >
                  Voltar para login
                </Button>
              </form>
            ) : isReset ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div>
                  <Label htmlFor="reset-identifier">Usuário ou email</Label>
                  <Input
                    id="reset-identifier"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Enviando..." : "Solicitar recuperação"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsReset(false)}
                >
                  Voltar para login
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="username">Usuário</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <div>
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Lembrar-me neste dispositivo por 30 dias
                  </label>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="link"
                  className="w-full text-blue-600"
                  onClick={() => setIsReset(true)}
                >
                  Esqueci minha senha
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}