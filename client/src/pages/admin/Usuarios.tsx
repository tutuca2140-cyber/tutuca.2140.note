import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminUsuarios() {
  const { data: users, isLoading } = trpc.users.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gerenciamento de Usuários</h1>
          <p className="text-muted-foreground mt-2">Gerencie usuários e permissões do sistema</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Carregando usuários...</p>
          </div>
        ) : users && users.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="truncate">{user.name || user.email}</span>
                    <Shield className="h-5 w-5 text-primary" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Badge variant={user.role === 'super_admin' ? 'default' : user.role === 'admin' ? 'secondary' : 'outline'}>
                      {user.role}
                    </Badge>
                    {user.isActive ? (
                      <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-2 bg-red-50 text-red-700 border-red-200">Inativo</Badge>
                    )}
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="text-muted-foreground truncate">{user.email}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {user.canView && <Badge variant="outline" className="text-xs">Ver</Badge>}
                      {user.canInsert && <Badge variant="outline" className="text-xs">Inserir</Badge>}
                      {user.canEdit && <Badge variant="outline" className="text-xs">Editar</Badge>}
                      {user.canDelete && <Badge variant="outline" className="text-xs">Deletar</Badge>}
                      {user.canGenerateReports && <Badge variant="outline" className="text-xs">Relatórios</Badge>}
                      {user.canAccessSettings && <Badge variant="outline" className="text-xs">Config</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum usuário encontrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}