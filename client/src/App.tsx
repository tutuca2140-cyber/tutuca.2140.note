import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Emprestimos = lazy(() => import("./pages/Emprestimos"));
const Pagamentos = lazy(() => import("./pages/Pagamentos"));
const Caixa = lazy(() => import("./pages/Caixa"));
const Agentes = lazy(() => import("./pages/Agentes"));
const Veiculos = lazy(() => import("./pages/Veiculos"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Financiamentos = lazy(() => import("./pages/Financiamentos"));
const ContasAReceber = lazy(() => import("./pages/ContasAReceber"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const AdminUsuarios = lazy(() => import("./pages/admin/Usuarios"));
const AdminBancos = lazy(() => import("./pages/admin/Bancos"));
const AdminAuditoria = lazy(() => import("./pages/admin/Auditoria"));
const AdminConfiguracoes = lazy(() => import("./pages/admin/Configuracoes"));
const AdminSugestoes = lazy(() => import("./pages/admin/Sugestoes"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/clientes"} component={Clientes} />
      <Route path={"/emprestimos"} component={Emprestimos} />
      <Route path={"/pagamentos"} component={Pagamentos} />
      <Route path={"/caixa"} component={Caixa} />
      <Route path={"/agentes"} component={Agentes} />
      <Route path={"/veiculos"} component={Veiculos} />
      <Route path={"/produtos"} component={Produtos} />
      <Route path={"/financiamentos"} component={Financiamentos} />
      <Route path={"/contas-a-receber"} component={ContasAReceber} />
      <Route path={"/relatorios"} component={Relatorios} />
      <Route path={"/admin/usuarios"} component={AdminUsuarios} />
      <Route path={"/admin/bancos"} component={AdminBancos} />
      <Route path={"/admin/auditoria"} component={AdminAuditoria} />
      <Route path={"/admin/configuracoes"} component={AdminConfiguracoes} />
      <Route path={"/admin/sugestoes"} component={AdminSugestoes} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <ThemeToggle />
        <TooltipProvider>
          <Toaster />
          <Suspense
            fallback={
              <div className="min-h-screen grid place-items-center text-muted-foreground">
                Carregando...
              </div>
            }
          >
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
