import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Star } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";

type FeedbackItem = {
  id: number;
  rating: number;
  comment?: string | null;
  createdAt: string;
  userId: number;
  userName?: string | null;
  username?: string | null;
  email?: string | null;
};

export default function Sugestoes() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || user.role !== "super_admin") return;

    void (async () => {
      try {
        setFetching(true);
        const response = await fetch("/api/feedback?admin=true", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "Não foi possível carregar as avaliações.");
        }
        setItems(data.feedback || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar avaliações.");
      } finally {
        setFetching(false);
      }
    })();
  }, [user]);

  const average = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / items.length;
  }, [items]);

  if (loading) return null;

  if (!user || user.role !== "super_admin") {
    return (
      <DashboardLayout>
        <div className="rounded-lg border bg-background p-6">
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">Esta área é exclusiva do Super Administrador.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquareText className="h-6 w-6" />
            Sugestões
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Avaliações e sugestões enviadas pelos usuários no terceiro login.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de avaliações</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{items.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Média de estrelas</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-3xl font-bold">
              {average.toFixed(1)}
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </CardContent>
          </Card>
        </div>

        {fetching ? (
          <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">Carregando avaliações...</div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">Nenhuma avaliação recebida ainda.</div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const displayName = item.userName || item.username || item.email || `Usuário #${item.userId}`;
              return (
                <Card key={item.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{displayName}</p>
                          {item.username && item.userName && (
                            <span className="text-xs text-muted-foreground">@{item.username}</span>
                          )}
                        </div>
                        {item.email && <p className="mt-0.5 text-xs text-muted-foreground">{item.email}</p>}
                      </div>
                      <Badge variant="secondary" className="w-fit gap-1">
                        {item.rating} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      </Badge>
                    </div>

                    <div className="mt-4 rounded-md bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugestão / comentário</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {item.comment?.trim() || "O usuário enviou apenas a avaliação por estrelas."}
                      </p>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Enviado em {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
