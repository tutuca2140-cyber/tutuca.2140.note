import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import CommercialPaymentGate from "./components/CommercialPaymentGate";
import ErrorBoundary from "./components/ErrorBoundary";
import SiteAccessTracker from "./components/SiteAccessTracker";
import SystemGuideAssistant from "./components/SystemGuideAssistant";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Planos = lazy(() => import("./pages/Planos"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Perfil = lazy(() => import("./pages/Perfil"));
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
const MeuBanco = lazy(() => import("./pages/MeuBanco"));
const Equipe = lazy(() => import("./pages/Equipe"));
const AdminControle = lazy(() => import("./pages/admin/Controle"));
const AdminAssinaturas = lazy(() => import("./pages/admin/Assinaturas"));
const AdminUsuarios = lazy(() => import("./pages/admin/Usuarios"));
const AdminBancos = lazy(() => import("./pages/admin/Bancos"));
const AdminAuditoria = lazy(() => import("./pages/admin/Auditoria"));
const AdminConfiguracoes = lazy(() => import("./pages/admin/Configuracoes"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PaidPerfil = () => <CommercialPaymentGate><Perfil /></CommercialPaymentGate>;
const PaidClientes = () => <CommercialPaymentGate><Clientes /></CommercialPaymentGate>;
const PaidEmprestimos = () => <CommercialPaymentGate><Emprestimos /></CommercialPaymentGate>;
const PaidPagamentos = () => <CommercialPaymentGate><Pagamentos /></CommercialPaymentGate>;
const PaidCaixa = () => <CommercialPaymentGate><Caixa /></CommercialPaymentGate>;
const PaidAgentes = () => <CommercialPaymentGate><Agentes /></CommercialPaymentGate>;
const PaidVeiculos = () => <CommercialPaymentGate><Veiculos /></CommercialPaymentGate>;
const PaidProdutos = () => <CommercialPaymentGate><Produtos /></CommercialPaymentGate>;
const PaidFinanciamentos = () => <CommercialPaymentGate><Financiamentos /></CommercialPaymentGate>;
const PaidContasAReceber = () => <CommercialPaymentGate><ContasAReceber /></CommercialPaymentGate>;
const PaidRelatorios = () => <CommercialPaymentGate><Relatorios /></CommercialPaymentGate>;
const PaidMeuBanco = () => <CommercialPaymentGate><MeuBanco /></CommercialPaymentGate>;
const PaidEquipe = () => <CommercialPaymentGate><Equipe /></CommercialPaymentGate>;

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/planos"} component={Planos} />
      <Route path={"/cadastro"} component={Cadastro} />
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/perfil"} component={PaidPerfil} />
      <Route path={"/clientes"} component={PaidClientes} />
      <Route path={"/emprestimos"} component={PaidEmprestimos} />
      <Route path={"/pagamentos"} component={PaidPagamentos} />
      <Route path={"/caixa"} component={PaidCaixa} />
      <Route path={"/agentes"} component={PaidAgentes} />
      <Route path={"/veiculos"} component={PaidVeiculos} />
      <Route path={"/produtos"} component={PaidProdutos} />
      <Route path={"/financiamentos"} component={PaidFinanciamentos} />
      <Route path={"/contas-a-receber"} component={PaidContasAReceber} />
      <Route path={"/relatorios"} component={PaidRelatorios} />
      <Route path={"/meu-banco"} component={PaidMeuBanco} />
      <Route path={"/equipe"} component={PaidEquipe} />
      <Route path={"/admin/controle"} component={AdminControle} />
      <Route path={"/admin/assinaturas"} component={AdminAssinaturas} />
      <Route path={"/admin/usuarios"} component={AdminUsuarios} />
      <Route path={"/admin/bancos"} component={AdminBancos} />
      <Route path={"/admin/auditoria"} component={AdminAuditoria} />
      <Route path={"/admin/configuracoes"} component={AdminConfiguracoes} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <SiteAccessTracker />
          <SystemGuideAssistant />
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
