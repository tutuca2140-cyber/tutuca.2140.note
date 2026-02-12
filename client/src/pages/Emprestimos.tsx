import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Plus, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function Emprestimos() {
  const { data: loans, isLoading } = trpc.loans.list.useQuery();

  const formatCurrency = (value: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(parseFloat(value));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-800';
      case 'pago': return 'bg-blue-100 text-blue-800';
      case 'atrasado': return 'bg-red-100 text-red-800';
      case 'cancelado': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Empréstimos</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie os empréstimos cadastrados no sistema
            </p>
          </div>
          <Button onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Empréstimo
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando empréstimos...</p>
          </div>
        ) : loans && loans.length > 0 ? (
          <div className="space-y-4">
            {loans.map((loan) => (
              <Card key={loan.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Empréstimo #{loan.id}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(loan.status)}`}>
                          {loan.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Valor:</span>{' '}
                          <span className="font-medium">{formatCurrency(loan.amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total:</span>{' '}
                          <span className="font-medium">{formatCurrency(loan.totalAmount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Parcelas:</span>{' '}
                          <span className="font-medium">{loan.installments}x de {formatCurrency(loan.installmentAmount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Taxa:</span>{' '}
                          <span className="font-medium">{loan.interestRate}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Início:</span>{' '}
                          <span className="font-medium">{formatDate(loan.startDate)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fim:</span>{' '}
                          <span className="font-medium">{formatDate(loan.endDate)}</span>
                        </div>
                      </div>
                      {loan.description && (
                        <p className="text-sm text-muted-foreground mt-2">{loan.description}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum empréstimo cadastrado</p>
              <Button className="mt-4" onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Primeiro Empréstimo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
