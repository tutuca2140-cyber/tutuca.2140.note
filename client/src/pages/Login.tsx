import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { LogIn, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    name: "",
    confirmPassword: ""
  });
  const [isRegister, setIsRegister] = useState(false);

  const loginMutation = trpc.auth.loginLocal.useMutation();
  const registerMutation = trpc.auth.registerLocal.useMutation();

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await loginMutation.mutateAsync({
        username: formData.username,
        password: formData.password
      });

      if (result.success) {
        toast.success("Login realizado com sucesso!");
        // Redirecionar para dashboard
        setTimeout(() => setLocation("/"), 500);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    setIsLoading(true);

    try {
      const result = await registerMutation.mutateAsync({
        username: formData.username,
        email: formData.email,
        name: formData.name,
        password: formData.password
      });

      if (result.success) {
        toast.success("Conta criada com sucesso! Faça login para continuar.");
        setIsRegister(false);
        setFormData({
          username: "",
          password: "",
          email: "",
          name: "",
          confirmPassword: ""
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo e Título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-lg bg-blue-600 text-white mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">DEATH NOTE</h1>
          <p className="text-gray-600 mt-2">Sistema de Gestão Financeira</p>
        </div>

        {/* Card de Login */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>
              Escolha uma forma de entrar no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="oauth" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="oauth">Manus OAuth</TabsTrigger>
                <TabsTrigger value="local">Usuário e Senha</TabsTrigger>
              </TabsList>

              {/* OAuth Tab */}
              <TabsContent value="oauth" className="space-y-4 mt-6">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Entre usando sua conta Manus
                </p>
                <Button
                  onClick={() => window.location.href = getLoginUrl()}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Entrar com Manus OAuth
                </Button>
              </TabsContent>

              {/* Local Auth Tab */}
              <TabsContent value="local" className="space-y-4 mt-6">
                {!isRegister ? (
                  <>
                    <form onSubmit={handleLocalLogin} className="space-y-4">
                      <div>
                        <Label htmlFor="username">Usuário</Label>
                        <Input
                          id="username"
                          type="text"
                          placeholder="Digite seu usuário"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <Label htmlFor="password">Senha</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Digite sua senha"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        disabled={isLoading}
                      >
                        {isLoading ? "Entrando..." : "Entrar"}
                      </Button>
                    </form>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">ou</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsRegister(true)}
                      disabled={isLoading}
                    >
                      Criar nova conta
                    </Button>
                  </>
                ) : (
                  <>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <Label htmlFor="name">Nome Completo</Label>
                        <Input
                          id="name"
                          type="text"
                          placeholder="Digite seu nome"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <Label htmlFor="reg-email">Email</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="Digite seu email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <Label htmlFor="reg-username">Usuário</Label>
                        <Input
                          id="reg-username"
                          type="text"
                          placeholder="Escolha um usuário"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <Label htmlFor="reg-password">Senha</Label>
                        <Input
                          id="reg-password"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <div>
                        <Label htmlFor="confirm-password">Confirmar Senha</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          placeholder="Confirme sua senha"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                          required
                          disabled={isLoading}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        disabled={isLoading}
                      >
                        {isLoading ? "Criando conta..." : "Criar Conta"}
                      </Button>
                    </form>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setIsRegister(false);
                        setFormData({
                          username: "",
                          password: "",
                          email: "",
                          name: "",
                          confirmPassword: ""
                        });
                      }}
                      disabled={isLoading}
                    >
                      Voltar para login
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Sistema de gestão financeira com controle de empréstimos e pagamentos
        </p>
      </div>
    </div>
  );
}
