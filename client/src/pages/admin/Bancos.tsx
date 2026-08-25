import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Plus, Database, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminBancos() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "novo" as "novo" | "copia" | "existente"
  });

  const { data: databases, isLoading } = trpc.databases.list.useQuery();
  const { data: activeDb } = trpc.databases.getActive.useQuery();
  const createMutation = trpc.databases.create.useMutation();
  const setActiveMutation = trpc.databases.setActive.useMutation();
  const deleteMutation = trpc.databases.delete.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast.success("Banco de dados criado com sucesso!");
      setOpen(false);
      setFormData({ name: "", description: "", type: "novo" });
      utils.databases.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar banco");
    }
  };

  const handleSetActive = async (id: number) => {
    try {
      await setActiveMutation.mutateAsync({ id });
      toast.success("Banco de dados ativado!");
      utils.databases.list.invalidate();
      utils.databases.getActive.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Erro ao ativar banco");
    }
  };

  const handleDelete = async (database: { id: number; name: string }) => {
    if (!window.confirm(`Excluir definitivamente o banco “${database.name}” e todos os dados vinculados? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteMutation.mutateAsync({ id: database.id });
      await Promise.all([utils.databases.list.invalidate(), utils.databases.getActive.invalidate()]);
      toast.success("Banco e todos os dados vinculados foram excluídos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o banco.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bancos de Dados</h1>
            <p className="text-muted-foreground mt-2">Gerencie múltiplos bancos de dados isolados</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Banco
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Banco de Dados</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo *</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo (Vazio)</SelectItem>
                      <SelectItem value="copia">Cópia do Atual</SelectItem>
                      <SelectItem value="existente">Existente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Banco"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando bancos...</p>
          </div>
        ) : databases && databases.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {databases.map((db) => (
              <Card key={db.id} className={db.isActive ? "border-primary border-2" : ""}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="truncate">{db.name}</span>
                    {db.isActive && <Check className="h-5 w-5 text-primary" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">Tipo: <span className="font-medium">{db.type}</span></p>
                    {db.description && <p className="text-muted-foreground text-xs">{db.description}</p>}
                  </div>
                  {!db.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSetActive(db.id)}
                      disabled={setActiveMutation.isPending}
                    >
                      Ativar Banco
                    </Button>
                  )}
                  {user?.role === "super_admin" && <Button size="sm" variant="destructive" className="w-full" onClick={() => handleDelete(db)} disabled={deleteMutation.isPending}><Trash2 className="mr-2 h-4 w-4" />Excluir definitivamente</Button>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum banco cadastrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
