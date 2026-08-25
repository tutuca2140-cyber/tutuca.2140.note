import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Usuário ou senha inválidos.");
      }

      const sessionCheck = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!sessionCheck.ok) throw new Error("A sessão foi criada, mas não pôde ser validada.");

      toast.success("Login realizado com sucesso.");
      window.location.replace("/dashboard");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível realizar o login.");
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
          <p className="text-gray-600 mt-2">Sistema de Gestão Financeira</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>Entre com seu usuário e senha cadastrados pelo administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="username">Usuário</Label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" required disabled={isLoading} />
              </div>
              <div>
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password" required disabled={isLoading} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Lembrar-me neste dispositivo por 30 dias
              </label>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
            <Button type="button" variant="link" className="w-full mt-4 text-blue-600"
              onClick={() => toast.info("A redefinição de senha é feita pelo Super Administrador em Usuários.")}>
              Esqueci minha senha
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
