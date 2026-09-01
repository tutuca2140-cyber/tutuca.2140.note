import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Circle, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Thread = {
  id:number;
  status:string;
  lastUserMessageAt:string;
  name?:string;
  username?:string;
  email?:string;
  supportId?:string;
  accountActive:boolean;
  sessionActive:boolean;
  unreadCount:number;
  lastMessage?:string;
};

type Msg = { id:number; senderRole:"user"|"super_admin"; message:string; createdAt:string; senderName?:string };

export default function AdminSuporte(){
  const [threads,setThreads]=useState<Thread[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [detail,setDetail]=useState<any>(null);
  const [messages,setMessages]=useState<Msg[]>([]);
  const [reply,setReply]=useState("");
  const [sending,setSending]=useState(false);
  const endRef=useRef<HTMLDivElement>(null);

  const loadList=useCallback(async(silent=false)=>{
    try{
      const response=await fetch("/api/site-access?scope=support&action=list",{credentials:"include",cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.message||"Erro ao carregar suporte.");
      const next=Array.isArray(data.threads)?data.threads:[];
      setThreads(next);
      setSelected(current=>current??(next[0]?.id?Number(next[0].id):null));
    }catch(error){if(!silent)toast.error(error instanceof Error?error.message:"Erro no suporte.");}
  },[]);

  const loadThread=useCallback(async(id:number,silent=false)=>{
    try{
      const response=await fetch(`/api/site-access?scope=support&action=thread&threadId=${id}`,{credentials:"include",cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.message||"Erro ao abrir atendimento.");
      setDetail(data.thread);
      setMessages(Array.isArray(data.messages)?data.messages:[]);
    }catch(error){if(!silent)toast.error(error instanceof Error?error.message:"Erro ao abrir atendimento.");}
  },[]);

  useEffect(()=>{loadList();const timer=window.setInterval(()=>loadList(true),10000);return()=>window.clearInterval(timer);},[loadList]);
  useEffect(()=>{if(selected)loadThread(selected);else{setDetail(null);setMessages([]);}},[selected,loadThread]);
  useEffect(()=>{if(!selected)return;const timer=window.setInterval(()=>loadThread(selected,true),10000);return()=>window.clearInterval(timer);},[selected,loadThread]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);

  const send=async(event:FormEvent)=>{
    event.preventDefault();
    if(!selected||!reply.trim()||sending)return;
    setSending(true);
    try{
      const response=await fetch("/api/site-access?scope=support",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({action:"reply",threadId:selected,message:reply.trim()})});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.message||"Erro ao responder.");
      setReply("");
      await Promise.all([loadThread(selected,true),loadList(true)]);
    }catch(error){toast.error(error instanceof Error?error.message:"Erro ao responder.");}
    finally{setSending(false);}
  };

  const toggle=async()=>{
    if(!selected||!detail)return;
    const action=detail.status==="closed"?"reopen":"close";
    const response=await fetch("/api/site-access?scope=support",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({action,threadId:selected})});
    const data=await response.json();
    if(!response.ok)return toast.error(data?.message||"Erro ao alterar atendimento.");
    await Promise.all([loadThread(selected,true),loadList(true)]);
  };

  return <DashboardLayout>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Super Admin</p><h1 className="text-2xl font-bold">Suporte aos assinantes</h1><p className="text-sm text-muted-foreground">Mensagens organizadas pela chegada mais recente do cliente.</p></div>
        <Button variant="outline" onClick={()=>loadList()}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>
      </div>
      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[360px_1fr]">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b p-3 font-semibold">Caixa de entrada ({threads.length})</div>
          <div className="max-h-[680px] overflow-y-auto">
            {threads.length===0?<p className="p-5 text-sm text-muted-foreground">Nenhuma mensagem recebida.</p>:threads.map(thread=><button key={thread.id} onClick={()=>setSelected(Number(thread.id))} className={`w-full border-b p-4 text-left transition hover:bg-muted/50 ${selected===Number(thread.id)?"bg-primary/10":""}`}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{thread.name||thread.username||"Assinante"}</p><p className="font-mono text-xs text-muted-foreground">ID {thread.supportId||"—"}</p></div>{Number(thread.unreadCount)>0?<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{thread.unreadCount}</span>:null}</div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{thread.lastMessage||"Sem mensagem"}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-full px-2 py-1 ${thread.accountActive?"bg-emerald-500/10 text-emerald-700":"bg-destructive/10 text-destructive"}`}>Conta {thread.accountActive?"ativa":"inativa"}</span><span className={`rounded-full px-2 py-1 ${thread.sessionActive?"bg-emerald-500/10 text-emerald-700":"bg-muted text-muted-foreground"}`}>{thread.sessionActive?"Sessão ativa":"Offline"}</span></div>
              <p className="mt-2 text-[10px] text-muted-foreground">Chegada: {new Date(thread.lastUserMessageAt).toLocaleString("pt-BR")}</p>
            </button>)}
          </div>
        </section>
        <section className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border bg-card">
          {!detail?<div className="grid flex-1 place-items-center text-center text-muted-foreground"><div><MessageCircle className="mx-auto h-10 w-10"/><p className="mt-2">Selecione um atendimento.</p></div></div>:<>
            <div className="border-b p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-full bg-primary/10 p-2"><UserRound className="h-5 w-5 text-primary"/></div><div><h2 className="font-bold">{detail.name||detail.username}</h2><p className="text-xs text-muted-foreground">{detail.email}</p><p className="font-mono text-xs font-bold">ID {detail.supportId||"—"}</p></div></div><div className="flex items-center gap-2"><span className="flex items-center gap-1 text-xs"><Circle className={`h-2.5 w-2.5 ${detail.sessionActive?"fill-emerald-500 text-emerald-500":"fill-muted text-muted"}`}/>{detail.sessionActive?"Sessão ativa":"Offline"}</span><Button size="sm" variant="outline" onClick={toggle}>{detail.status==="closed"?"Reabrir":"Encerrar"}</Button></div></div></div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/15 p-4">{messages.map(message=><div key={message.id} className={`flex ${message.senderRole==="super_admin"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${message.senderRole==="super_admin"?"bg-primary text-primary-foreground":"border bg-background"}`}><p className="whitespace-pre-wrap">{message.message}</p><p className={`mt-1 text-[10px] ${message.senderRole==="super_admin"?"text-primary-foreground/70":"text-muted-foreground"}`}>{message.senderRole==="super_admin"?"Super Admin":detail.name||"Cliente"} • {new Date(message.createdAt).toLocaleString("pt-BR")}</p></div></div>)}<div ref={endRef}/></div>
            <form onSubmit={send} className="flex gap-2 border-t p-3"><textarea value={reply} onChange={event=>setReply(event.target.value)} maxLength={5000} rows={2} placeholder="Responder ao assinante..." className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><Button type="submit" disabled={sending||!reply.trim()}><Send className="mr-2 h-4 w-4"/>{sending?"Enviando...":"Responder"}</Button></form>
          </>}
        </section>
      </div>
    </div>
  </DashboardLayout>;
}
