import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Pencil, Plus, Shield, UserRoundX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Draft = { id?: number; username: string; email: string; name: string; password: string; role: "user" | "admin" };
const emptyDraft: Draft = { username: "", email: "", name: "", password: "", role: "user" };

export default function AdminUsuarios() {
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.users.list.useQuery();
  const createUser = trpc.users.create.useMutation();
  const updateUser = trpc.users.update.useMutation();
  const toggleUser = trpc.users.toggleActive.useMutation();
  const resetPassword = trpc.users.adminResetPassword.useMutation();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});
  const refresh = async () => utils.users.list.invalidate();
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");

  const save = async () => {
    try {
      if (draft.id) {
        const { id: userId, password: _password, ...data } = draft;
        await updateUser.mutateAsync({ userId, ...data });
        toast.success("Usuário atualizado.");
      } else {
        await createUser.mutateAsync(draft);
        toast.success("Usuário criado.");
      }
      setOpen(false); setDraft(emptyDraft); await refresh();
    } catch (error) { fail(error); }
  };

  const edit = (user: (typeof users)[number]) => {
    setDraft({ id: user.id, username: user.username ?? "", email: user.email ?? "", name: user.name ?? "", password: "", role: user.role === "admin" ? "admin" : "user" });
    setOpen(true);
  };

  const toggle = async (userId: number, isActive: boolean) => {
    try { await toggleUser.mutateAsync({ userId, isActive }); await refresh(); toast.success(isActive ? "Usuário ativado." : "Usuário desativado e sessões encerradas."); }
    catch (error) { fail(error); }
  };

  const reset = async (userId: number) => {
    const password = passwordDrafts[userId] ?? "";
    if (password.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");
    try { await resetPassword.mutateAsync({ userId, password }); setPasswordDrafts(current => ({ ...current, [userId]: "" })); toast.success("Senha redefinida e sessões anteriores encerradas."); }
    catch (error) { fail(error); }
  };

  const busy = createUser.isPending || updateUser.isPending;
  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="text-3xl font-bold tracking-tight">Gerenciamento de Usuários</h1><p className="mt-2 text-muted-foreground">Crie, edite, desative e redefina senhas.</p></div>
      <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setDraft(emptyDraft); }}><DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Novo usuário</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{draft.id ? "Editar usuário" : "Criar usuário"}</DialogTitle></DialogHeader><div className="grid gap-4">
        <div><Label htmlFor="user-name">Nome</Label><Input id="user-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <div><Label htmlFor="user-username">Usuário</Label><Input id="user-username" value={draft.username} onChange={e => setDraft({ ...draft, username: e.target.value })} /></div>
        <div><Label htmlFor="user-email">E-mail</Label><Input id="user-email" type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></div>
        {!draft.id && <div><Label htmlFor="user-password">Senha inicial</Label><Input id="user-password" type="password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} /></div>}
        <div><Label>Perfil</Label><Select value={draft.role} onValueChange={(role: "user" | "admin") => setDraft({ ...draft, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Usuário</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></div>
        <Button onClick={save} disabled={busy || !draft.name || !draft.username || !draft.email || (!draft.id && draft.password.length < 6)}>{busy ? "Salvando..." : "Salvar"}</Button>
      </div></DialogContent></Dialog>
    </div>
    {isLoading ? <p className="py-12 text-center text-muted-foreground">Carregando usuários...</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{users.map(user => { const protectedUser = user.username?.toLowerCase() === "draco"; return <Card key={user.id}><CardHeader><CardTitle className="flex items-center justify-between gap-2"><span className="truncate">{user.name || user.username || user.email}</span><Shield className="h-5 w-5 text-primary" /></CardTitle></CardHeader><CardContent className="space-y-4">
      <div><Badge>{user.role}</Badge><Badge variant="outline" className={`ml-2 ${user.isActive ? "text-green-700" : "text-red-700"}`}>{user.isActive ? "Ativo" : "Inativo"}</Badge></div><p className="text-sm text-muted-foreground">@{user.username}<br />{user.email}</p>
      {protectedUser ? <p className="rounded-md bg-primary/5 p-3 text-xs text-primary">Super administrador protegido.</p> : <><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => edit(user)}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button variant="outline" size="sm" onClick={() => toggle(user.id, !user.isActive)}><UserRoundX className="mr-2 h-4 w-4" />{user.isActive ? "Desativar" : "Ativar"}</Button></div><div className="flex flex-col gap-2 sm:flex-row"><Input type="password" placeholder="Nova senha" value={passwordDrafts[user.id] ?? ""} onChange={e => setPasswordDrafts(current => ({ ...current, [user.id]: e.target.value }))} /><Button className="w-full sm:w-auto" variant="outline" onClick={() => reset(user.id)}>Redefinir</Button></div></>}
    </CardContent></Card>; })}</div>}
  </div></DashboardLayout>;
}
