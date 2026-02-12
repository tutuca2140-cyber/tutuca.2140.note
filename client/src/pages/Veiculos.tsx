import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Plus, Car } from "lucide-react";
import { toast } from "sonner";

export default function Veiculos() {
  const { data: vehicles, isLoading } = trpc.vehicles.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Veículos</h1>
            <p className="text-muted-foreground mt-2">Gerencie o estoque de veículos</p>
          </div>
          <Button onClick={() => toast.info("Funcionalidade em desenvolvimento")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Veículo
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando veículos...</p>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Car className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum veículo cadastrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}