import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function Pagamentos() {
  const { data: payments, isLoading } = trpc.payments.list.useQuery();

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
      case 'pago': return 'bg-green-100 text-green-800';
      case 'pendente': return 'bg-yellow-100 text-yellow-800';
      case 'atrasado': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pagamentos</h1>
            <p className="text-muted-foreground mt-2">
              Histórico de pagamentos e parcelas
            </p>
          </div>
          <Button onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar Pagamento
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando pagamentos...</p>
          </div>
        ) : payments && payments.length > 0 ? (
          <div className="space-y-4">
            {payments.map((payment) => (
              <Card key={payment.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">Parcela #{payment.installmentNumber}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </div>
                      <div className="text-sm space-y-1">
                        <div>
                          <span className="text-muted-foreground">Valor:</span>{' '}
                          <span className="font-medium">{formatCurrency(payment.amount)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vencimento:</span>{' '}
                          <span className="font-medium">{formatDate(payment.dueDate)}</span>
                        </div>
                        {payment.status === 'pago' && (
                          <div>
                            <span className="text-muted-foreground">Pago em:</span>{' '}
                            <span className="font-medium">{formatDate(payment.paymentDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum pagamento registrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
