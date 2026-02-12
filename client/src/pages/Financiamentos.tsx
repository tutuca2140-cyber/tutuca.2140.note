import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Plus, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export default function Financiamentos() {
  const { data: financings, isLoading } = trpc.vehicleFinancings.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financiamentos</h1>
            <p className="text-muted-foreground mt-2">Gerencie financiamentos de veículos</p>
          </div>
          <Button onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Financiamento
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando financiamentos...</p>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum financiamento cadastrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}