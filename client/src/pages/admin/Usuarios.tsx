import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Shield, UserPlus, Users, Trash2, Save, KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type User = {
  id: number; username?: string | null; name?: string | null; email?: string | null;
  role: "user" | "admin" | "super_admin"; canView: boolean; canInsert: boolean;
  canEdit: boolean; canDelete: boolean; canGenerateReports: boolean;
  canAccessSettings: boolean; isActive: boolean;
};

const emptyForm = {
  username: "", name: "", email: "", password: "", role: "user",
  canView: true, canInsert: false, canEdit: false, canDelete: false,
  canGenerateReports: false, canAccessSettings: false,
};

export default function AdminUsuarios() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/users/list", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Não foi possível carregar usuários.");
      setUsers(data.users);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch("/api/users/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Não foi possível criar o usuário.");
      toast.success("Usuário criado com sucesso.");
      setForm({ ...emptyForm }); await loadUsers();
    } catch (error: any) {
      toast.error(error?.message || "Erro ao criar usuário.");
    } finally { setSaving(false); }
  };

  const patchUser = (id: number, patch: Partial<User>) =>
    setUsers(current => current.map(u => u.id === id ? { ...u, ...patch } : u));

  const updateUser = async (user: User) => {
    try {
      const response = await fetch("/api/users/update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ ...user, userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Não foi possível atualizar.");
      toast.success("Permissões atualizadas."); await loadUsers();
    } catch (error: any) { toast.error(error?.message || "Erro ao atualizar."); }
  };

  const resetPassword = async (userId: number) => {
    const password = passwordDrafts[userId] ?? "";
    if (password.length < 6) return toast.error("A nova senha deve ter no mínimo 6 caracteres.");
    try {
      const response = await fetch("/api/users/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ userId, password }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Não foi possível redefinir.");
      setPasswordDrafts(c => ({ ...c, [userId]: "" })); toast.success("Senha redefinida.");
    } catch (error: any) { toast.error(error?.message || "Erro ao redefinir senha."); }
  };

  const deleteUser = async (user: User) => {
    if (!window.confirm(`Excluir o usuário ${user.username || user.name}?`)) return;
    try {
      const response = await fetch("/api/users/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Não foi possível excluir.");
      toast.success("Usuário excluído."); await loadUsers();
    } catch (error: any) { toast.error(error?.message || "Erro ao excluir usuário."); }
  };

  return <DashboardLayout>
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Usuários</h1>
        <p className="text-muted-foreground mt-2">Crie usuários e defina as permissões diretamente pelo Super Administrador.</p>
      </div>

      <Card className="border-primary/20">
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5"/>Criar novo usuário</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div><Label>Nome</Label><Input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
              <div><Label>Usuário</Label><Input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></div>
              <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
              <div><Label>Senha inicial</Label><Input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>
            </div>
            <div className="flex flex-wrap gap-4">
              <select className="h-10 rounded-md border bg-background px-3" value={form.role}
                onChange={e=>setForm({...form,role:e.target.value,canAccessSettings:e.target.value==="admin"?form.canAccessSettings:false})}>
                <option value="user">Usuário</option><option value="admin">Administrador</option>
              </select>
              {[
                ["canView","Visualizar"],["canInsert","Inserir"],["canEdit","Editar"],
                ["canDelete","Excluir"],["canGenerateReports","Relatórios"],["canAccessSettings","Configurações"]
              ].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean((form as any)[key])}
                  disabled={key==="canAccessSettings"&&form.role!=="admin"}
                  onChange={e=>setForm({...form,[key]:e.target.checked} as any)}/>{label}
              </label>)}
            </div>
            <Button type="submit" disabled={saving}><UserPlus className="mr-2 h-4 w-4"/>{saving?"Criando...":"Criar usuário"}</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? <div className="py-12 text-center">Carregando usuários...</div> :
       !users.length ? <Card><CardContent className="py-12 text-center"><Users className="mx-auto mb-3"/><p>Nenhum usuário encontrado.</p></CardContent></Card> :
       <div className="grid gap-4 xl:grid-cols-2">
        {users.map(user=>{
          const isDraco=String(user.username).toLowerCase()==="draco";
          return <Card key={user.id}><CardHeader><CardTitle className="flex items-center justify-between">
            <span>{user.name||user.username}</span><Shield className="h-5 w-5 text-primary"/>
          </CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap"><Badge>{user.role}</Badge><Badge variant="outline">{user.isActive?"Ativo":"Inativo"}</Badge><span className="text-sm">@{user.username}</span></div>
            {isDraco ? <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">Conta protegida do Super Administrador.</div> : <>
              <div className="flex gap-4 flex-wrap">
                <select className="h-10 rounded-md border px-3" value={user.role} onChange={e=>patchUser(user.id,{role:e.target.value as any})}>
                  <option value="user">Usuário</option><option value="admin">Administrador</option>
                </select>
                <label className="flex items-center gap-2"><input type="checkbox" checked={user.isActive} onChange={e=>patchUser(user.id,{isActive:e.target.checked})}/>Ativo</label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["canView","Visualizar"],["canInsert","Inserir"],["canEdit","Editar"],
                  ["canDelete","Excluir"],["canGenerateReports","Relatórios"],["canAccessSettings","Configurações"]
                ].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean((user as any)[key])}
                    disabled={key==="canAccessSettings"&&user.role!=="admin"}
                    onChange={e=>patchUser(user.id,{[key]:e.target.checked} as any)}/>{label}
                </label>)}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={()=>updateUser(user)}><Save className="mr-2 h-4 w-4"/>Salvar</Button>
                <Button variant="destructive" onClick={()=>deleteUser(user)}><Trash2 className="mr-2 h-4 w-4"/>Excluir</Button>
              </div>
              <div className="flex gap-2 border-t pt-4">
                <Input type="password" placeholder="Nova senha" value={passwordDrafts[user.id]??""}
                  onChange={e=>setPasswordDrafts(c=>({...c,[user.id]:e.target.value}))}/>
                <Button variant="outline" onClick={()=>resetPassword(user.id)}><KeyRound className="mr-2 h-4 w-4"/>Redefinir</Button>
              </div>
            </>}
          </CardContent></Card>;
        })}
       </div>}
    </div>
  </DashboardLayout>;
}
