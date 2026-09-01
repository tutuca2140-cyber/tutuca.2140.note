import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, Image, Mail, Send, Square, Trash2, Upload, Users } from "lucide-react";

type Recipient = { id:number; supportId?:string|null; name?:string; username?:string; email:string; whatsapp?:string; plan?:string; status?:string; marketingState:"current"|"overdue"|"other" };

export default function Marketing() {
  const [recipients,setRecipients]=useState<Recipient[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [segment,setSegment]=useState<"all"|"current"|"overdue"|"selected">("all");
  const [selected,setSelected]=useState<number[]>([]);
  const [subject,setSubject]=useState("");
  const [message,setMessage]=useState("");
  const [imageData,setImageData]=useState("");
  const [imageName,setImageName]=useState("");

  const load=async()=>{ setLoading(true); try { const r=await fetch("/api/admin/marketing",{credentials:"include"}); const j=await r.json(); if(!r.ok) throw new Error(j.message); setRecipients(j.recipients||[]); } catch(e){ toast.error(e instanceof Error?e.message:"Erro ao carregar clientes."); } finally {setLoading(false);} };
  useEffect(()=>{void load();},[]);

  const visible=useMemo(()=>segment==="current"?recipients.filter(r=>r.marketingState==="current"):segment==="overdue"?recipients.filter(r=>r.marketingState==="overdue"):recipients,[recipients,segment]);
  const targetCount=segment==="selected"?selected.length:visible.length;
  const toggle=(id:number)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const selectVisible=()=>setSelected(Array.from(new Set([...selected,...visible.map(r=>r.id)])));
  const clear=()=>setSelected([]);

  const chooseImage=(file?:File)=>{
    if(!file)return;
    if(!["image/png","image/jpeg","image/gif"].includes(file.type)) return toast.error("Use uma imagem PNG, JPG ou GIF.");
    if(file.size>2*1024*1024) return toast.error("A imagem deve ter no máximo 2 MB.");
    const reader=new FileReader();
    reader.onload=()=>{setImageData(String(reader.result||""));setImageName(file.name);};
    reader.onerror=()=>toast.error("Não foi possível carregar a imagem.");
    reader.readAsDataURL(file);
  };

  const send=async()=>{
    if(!subject.trim()||!message.trim()) return toast.error("Preencha assunto e mensagem.");
    if(segment==="selected"&&!selected.length) return toast.error("Selecione pelo menos um cliente.");
    if(!window.confirm(`Confirmar envio para ${targetCount} destinatário(s)?`)) return;
    setSending(true);
    try { const r=await fetch("/api/admin/marketing",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({segment,selectedIds:selected,subject,message,imageData})}); const j=await r.json(); if(!r.ok) throw new Error(j.message); toast.success(`Campanha concluída: ${j.sent} enviados${j.failed?`, ${j.failed} falharam`:""}.`); }
    catch(e){toast.error(e instanceof Error?e.message:"Não foi possível enviar a campanha.");} finally{setSending(false);}
  };

  return <DashboardLayout><div className="space-y-6">
    <div><div className="flex items-center gap-2"><Mail className="h-6 w-6 text-primary"/><h1 className="text-2xl font-bold">Marketing por E-mail</h1></div><p className="mt-1 text-sm text-muted-foreground">Campanhas para clientes cadastrados, conforme as autorizações administrativas concedidas pelo Super Admin.</p></div>

    <div className="grid gap-3 sm:grid-cols-3">
      <button onClick={()=>setSegment("all")} className={`rounded-2xl border p-4 text-left ${segment==="all"?"border-primary bg-primary/5":"bg-background"}`}><Users className="mb-2 h-5 w-5"/><b>Todos</b><div className="text-2xl font-bold">{recipients.length}</div></button>
      <button onClick={()=>setSegment("current")} className={`rounded-2xl border p-4 text-left ${segment==="current"?"border-primary bg-primary/5":"bg-background"}`}><CheckSquare className="mb-2 h-5 w-5"/><b>Pagamentos em dia</b><div className="text-2xl font-bold">{recipients.filter(r=>r.marketingState==="current").length}</div></button>
      <button onClick={()=>setSegment("overdue")} className={`rounded-2xl border p-4 text-left ${segment==="overdue"?"border-primary bg-primary/5":"bg-background"}`}><Square className="mb-2 h-5 w-5"/><b>Pagamentos atrasados</b><div className="text-2xl font-bold">{recipients.filter(r=>r.marketingState==="overdue").length}</div></button>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
      <section className="rounded-2xl border bg-background p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Destinatários</h2><p className="text-xs text-muted-foreground">Use um grupo inteiro ou selecione clientes individualmente.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={selectVisible}>Selecionar exibidos</Button><Button size="sm" variant="ghost" onClick={clear}>Limpar</Button></div></div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">{loading?<p className="py-8 text-center text-muted-foreground">Carregando...</p>:visible.map(r=><label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-muted/40"><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)} className="h-4 w-4"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{r.name||r.username||"Cliente"}</p><p className="font-mono text-[11px] font-semibold text-primary">ID de usuário: {r.supportId||"—"}</p><p className="truncate text-xs text-muted-foreground">{r.email}{r.whatsapp?` • ${r.whatsapp}`:""}</p><p className="mt-1 font-mono text-[11px] font-semibold text-primary">ID {r.supportId || "—"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${r.marketingState==="current"?"bg-emerald-100 text-emerald-700":r.marketingState==="overdue"?"bg-red-100 text-red-700":"bg-slate-100 text-slate-600"}`}>{r.marketingState==="current"?"EM DIA":r.marketingState==="overdue"?"ATRASADO":"OUTRO"}</span></label>)}</div>
        <Button variant={segment==="selected"?"default":"outline"} onClick={()=>setSegment("selected")} disabled={!selected.length} className="w-full">Usar somente os {selected.length} selecionado(s)</Button>
      </section>

      <section className="rounded-2xl border bg-background p-5 space-y-4"><div><h2 className="font-semibold">Criar campanha</h2><p className="text-xs text-muted-foreground">O e-mail recebe automaticamente a identidade visual do Note Note.</p></div>
        <div><label className="mb-1 block text-sm font-medium">Assunto</label><Input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={200} placeholder="Ex.: Uma novidade para você no Note Note"/></div>
        <div className="space-y-2"><label className="block text-sm font-medium">Imagem da campanha</label><label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-sm font-medium hover:bg-muted/40"><Upload className="h-5 w-5"/><span>{imageName||"Selecionar imagem PNG, JPG ou GIF"}</span><input type="file" accept="image/png,image/jpeg,image/gif" className="hidden" onChange={e=>chooseImage(e.target.files?.[0])}/></label><p className="text-xs text-muted-foreground">Máximo 2 MB. A imagem será incorporada dentro do próprio e-mail para não depender de um link externo.</p></div>
        {imageData&&<div className="space-y-2"><div className="overflow-hidden rounded-xl border bg-muted/20"><img src={imageData} alt="Prévia da campanha" className="max-h-64 w-full object-contain"/></div><Button type="button" variant="outline" size="sm" onClick={()=>{setImageData("");setImageName("");}}><Trash2 className="mr-2 h-4 w-4"/>Remover imagem</Button></div>}
        <div><label className="mb-1 block text-sm font-medium">Mensagem</label><textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={10000} rows={10} className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" placeholder="Escreva aqui a mensagem que seus clientes receberão..."/></div>
        <div className="rounded-xl bg-muted/50 p-3 text-sm"><b>Envio atual:</b> {segment==="all"?"todos os clientes":segment==="current"?"clientes com pagamento em dia":segment==="overdue"?"clientes com pagamento atrasado":`${selected.length} clientes selecionados`}.</div>
        <Button onClick={send} disabled={sending||!targetCount} className="w-full"><Send className="mr-2 h-4 w-4"/>{sending?"Enviando campanha...":`Enviar para ${targetCount} destinatário(s)`}</Button>
      </section>
    </div>
  </div></DashboardLayout>;
}
