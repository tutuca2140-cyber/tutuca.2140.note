import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { FileText, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminAuditoria() {
  const { data: logs, isLoading } = trpc.auditLogs.list.useQuery({ limit: 50 });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('pt-BR');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Auditoria</h1>
          <p className="text-muted-foreground mt-2">Histórico de ações e logs do sistema</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando logs...</p>
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(log.status)}>{log.status}</Badge>
                        <span className="text-sm font-medium">{log.action}</span>
                        {log.entity && <span className="text-xs text-muted-foreground">({log.entity})</span>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <strong>{log.username || 'Sistema'}</strong>
                        {log.details && ` - ${log.details}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum log de auditoria encontrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}