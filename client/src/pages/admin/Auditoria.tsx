import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { FileText, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Consent = {
  id:number; userId:number; email:string; username?:string; name?:string; plan?:string; billingMethod?:string;
  termsAccepted:boolean; termsVersion:string; privacyAccepted:boolean; privacyVersion:string;
  trialCancellationAccepted:boolean; trialCancellationVersion:string; marketingOptIn:boolean;
  ipAddress?:string; userAgent?:string; acceptedAt:string; isActive:boolean;
};

export default function AdminAuditoria() {
  const { user } = useAuth();
  const { data: logs, isLoading } = trpc.auditLogs.list.useQuery({ limit: 50 });
  const [q,setQ]=useState(""); const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [marketing,setMarketing]=useState("all");
  const [consents,setConsents]=useState<Consent[]>([]); const [consentLoading,setConsentLoading]=useState(false);
  const isSuperAdmin=user?.role==="super_admin";

  const formatDate=(date:Date|string)=>new Date(date).toLocaleString("pt-BR");
  const getStatusColor=(status:string)=>status==='success'?'bg-green-100 text-green-800':status==='failed'?'bg-red-100 text-red-800':status==='warning'?'bg-yellow-100 text-yellow-800':'bg-gray-100 text-gray-800';
  const loadConsents=async()=>{if(!isSuperAdmin)return;setConsentLoading(true);try{const p=new URLSearchParams();if(q.trim())p.set("q",q.trim());if(from)p.set("from",from);if(to)p.set("to",to);if(marketing!=="all")p.set("marketing",marketing);const r=await fetch(`/api/site-access?scope=legal-consents&${p.toString()}`,{credentials:"include"});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.message||"Não foi possível consultar os aceites.");setConsents(j.consents||[]);}catch(e){toast.error(e instanceof Error?e.message:"Erro ao consultar aceites.");}finally{setConsentLoading(false);}};
  useEffect(()=>{if(isSuperAdmin)void loadConsents();},[isSuperAdmin]);

  return <DashboardLayout><div className="space-y-8"><div><h1 className="text-3xl font-bold tracking-tight">Auditoria</h1><p className="mt-2 text-muted-foreground">Histórico de ações, logs do sistema e comprovação de aceites.</p></div>
    {isSuperAdmin&&<Card className="border-primary/20"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/>Aceites da contratação</CardTitle><p className="text-sm text-muted-foreground">Pesquise a prova de aceite dos Termos, Privacidade, teste/cancelamento e autorização de marketing.</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-5"><div className="md:col-span-2"><Label>Nome, e-mail ou usuário</Label><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente" className="mt-1"/></div><div><Label>De</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1"/></div><div><Label>Até</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1"/></div><div><Label>Marketing</Label><Select value={marketing} onValueChange={setMarketing}><SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="yes">Autorizou</SelectItem><SelectItem value="no">Não autorizou</SelectItem></SelectContent></Select></div></div><div className="flex justify-end"><Button onClick={()=>void loadConsents()} disabled={consentLoading}><Search className="mr-2 h-4 w-4"/>{consentLoading?"Buscando...":"Buscar aceites"}</Button></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Cliente</th><th className="p-3">Plano</th><th className="p-3">Termos</th><th className="p-3">Privacidade</th><th className="p-3">Teste / cancelamento</th><th className="p-3">Marketing</th><th className="p-3">Data do aceite</th><th className="p-3">IP</th></tr></thead><tbody>{consents.map(c=><tr key={c.id} className="border-t"><td className="p-3"><b>{c.name||c.username||"Cliente"}</b><div className="text-xs text-muted-foreground">{c.email}</div></td><td className="p-3 capitalize">{c.plan||"—"}<div className="text-xs text-muted-foreground">{c.billingMethod||"—"}</div></td><td className="p-3"><Badge variant={c.termsAccepted?"default":"destructive"}>{c.termsAccepted?`Aceito v${c.termsVersion}`:"Não"}</Badge></td><td className="p-3"><Badge variant={c.privacyAccepted?"default":"destructive"}>{c.privacyAccepted?`Aceito v${c.privacyVersion}`:"Não"}</Badge></td><td className="p-3"><Badge variant={c.trialCancellationAccepted?"default":"destructive"}>{c.trialCancellationAccepted?`Aceito v${c.trialCancellationVersion}`:"Não"}</Badge></td><td className="p-3"><Badge variant={c.marketingOptIn?"default":"secondary"}>{c.marketingOptIn?"Autorizou":"Não autorizou"}</Badge></td><td className="p-3">{formatDate(c.acceptedAt)}</td><td className="p-3 font-mono text-xs">{c.ipAddress||"—"}</td></tr>)}{!consentLoading&&consents.length===0&&<tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum aceite encontrado com os filtros informados.</td></tr>}</tbody></table></div></CardContent></Card>}

    <div><h2 className="text-xl font-bold">Logs do sistema</h2><p className="text-sm text-muted-foreground">Últimas ações registradas.</p></div>{isLoading?<div className="py-12 text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary"/><p className="mt-4 text-muted-foreground">Carregando logs...</p></div>:logs&&logs.length>0?<div className="space-y-3">{logs.map(log=><Card key={log.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-4"><div className="flex-1 space-y-1"><div className="flex items-center gap-2"><Badge className={getStatusColor(log.status)}>{log.status}</Badge><span className="text-sm font-medium">{log.action}</span>{log.entity&&<span className="text-xs text-muted-foreground">({log.entity})</span>}</div><p className="text-sm text-muted-foreground"><strong>{log.username||'Sistema'}</strong>{log.details&&` - ${log.details}`}</p><p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p></div></div></CardContent></Card>)}</div>:<Card><CardContent className="flex flex-col items-center justify-center py-12"><FileText className="mb-4 h-12 w-12 text-muted-foreground"/><p className="text-muted-foreground">Nenhum log de auditoria encontrado</p></CardContent></Card>}
  </div></DashboardLayout>;
}
