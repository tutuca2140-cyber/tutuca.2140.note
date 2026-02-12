import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Emprestimos from "./pages/Emprestimos";
import Pagamentos from "./pages/Pagamentos";
import Veiculos from "./pages/Veiculos";
import Financiamentos from "./pages/Financiamentos";
import Relatorios from "./pages/Relatorios";
import AdminUsuarios from "./pages/admin/Usuarios";
import AdminBancos from "./pages/admin/Bancos";
import AdminAuditoria from "./pages/admin/Auditoria";
import AdminConfiguracoes from "./pages/admin/Configuracoes";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/clientes"} component={Clientes} />
      <Route path={"/emprestimos"} component={Emprestimos} />
      <Route path={"/pagamentos"} component={Pagamentos} />
      <Route path={"/veiculos"} component={Veiculos} />
      <Route path={"/financiamentos"} component={Financiamentos} />
      <Route path={"/relatorios"} component={Relatorios} />
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
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
