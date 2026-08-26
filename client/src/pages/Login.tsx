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
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [notRobot, setNotRobot] = useState(false);
  const [captcha, setCaptcha] = useState({ question: "", token: "" });
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const refreshCaptcha = useCallback(async () => {
    const response = await fetch("/api/auth/captcha", { cache: "no-store" });
    const result = await response.json();
    if (response.ok && result?.success) setCaptcha({ question: result.question, token: result.token });
  }, []);

  useEffect(() => {
    void refreshCaptcha();
  }, [refreshCaptcha]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notRobot || !captchaAnswer.trim()) {
      toast.error("Marque “Não sou um robô” e resolva a verificação.");
      return;
    }
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          rememberMe,
          captchaToken: captcha.token,
          captchaAnswer,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Usuário ou senha inválidos.");
      }

      toast.success("Login realizado com sucesso!");
      setLocation("/dashboard");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível realizar o login.");
      setCaptchaAnswer("");
      void refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/brand/note-note-logo-official.png"
            alt="Note Note"
            className="mx-auto mb-4 w-full max-w-sm object-contain"
          />
          <p className="text-gray-600 mt-2">Sistema de Gestão Financeira</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>
              Entre com seu usuário e senha cadastrados pelo administrador.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {showRecovery ? (
              <div className="space-y-4">
                <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-700">
                  A recuperação de senha será conectada ao novo sistema de
                  autenticação na próxima etapa. Enquanto isso, a senha dos
                  usuários pode ser redefinida pelo super administrador.
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowRecovery(false)}
                >
                  Voltar para login
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="username">Usuário</Label>
                    <Input
                      id="username"
                      autoComplete="username"
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
                      autoComplete="current-password"
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

                  <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={notRobot}
                        onChange={e => setNotRobot(e.target.checked)}
                        disabled={isLoading}
                        className="h-5 w-5"
                      />
                      Não sou um robô
                    </label>
                    {notRobot ? (
                      <div>
                        <Label htmlFor="captcha">Verificação: {captcha.question}</Label>
                        <Input
                          id="captcha"
                          inputMode="numeric"
                          autoComplete="off"
                          value={captchaAnswer}
                          onChange={e => setCaptchaAnswer(e.target.value)}
                          disabled={isLoading}
                          className="mt-2"
                          required
                        />
                      </div>
                    ) : null}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="link"
                  className="w-full text-blue-600"
                  onClick={() => setShowRecovery(true)}
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
