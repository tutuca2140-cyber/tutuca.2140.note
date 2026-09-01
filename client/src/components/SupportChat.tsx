import { Button } from "@/components/ui/button";
import { MessageCircle, Send, ShieldCheck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Msg = { id:number; senderRole:"user"|"super_admin"; message:string; createdAt:string; senderName?:string };

export default function SupportChat() {
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [text,setText]=useState("");
  const [supportId,setSupportId]=useState("");
  const [messages,setMessages]=useState<Msg[]>([]);
  const endRef=useRef<HTMLDivElement>(null);

  const load=useCallback(async(silent=false)=>{
    try{
      const response=await fetch("/api/site-access?scope=support",{credentials:"include",cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data?.message||"Não foi possível abrir o suporte.");
      setSupportId(String(data.supportId||""));
      setMessages(Array.isArray(data.messages)?data.messages:[]);
    }catch(error){
      if(!silent) toast.error(error instanceof Error?error.message:"Erro ao abrir suporte.");
    }finally{
      if(!silent) setLoading(false);
    }
  },[]);

  useEffect(()=>{load();const timer=window.setInterval(()=>load(true),10000);return()=>window.clearInterval(timer);},[load]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages.length]);

  const send=async(event:FormEvent)=>{
    event.preventDefault();
    const message=text.trim();
    if(!message||sending)return;
    setSending(true);
    try{
      const response=await fetch("/api/site-access?scope=support",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({message})});
      const data=await response.json();
      if(!response.ok) throw new Error(data?.message||"Não foi possível enviar a mensagem.");
      setText("");
      await load(true);
    }catch(error){toast.error(error instanceof Error?error.message:"Erro ao enviar mensagem.");}
    finally{setSending(false);}
  };

  return <section id="suporte" className="overflow-hidden rounded-3xl border bg-card shadow-sm">
    <div className="border-b bg-gradient-to-r from-primary/10 via-background to-cyan-500/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary p-3 text-primary-foreground"><MessageCircle className="h-6 w-6"/></div>
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Suporte Note Note</p><h2 className="text-xl font-bold">Fale com o suporte</h2><p className="text-sm text-muted-foreground">Sua mensagem chega diretamente ao painel do Super Admin.</p></div>
        </div>
        {supportId?<div className="rounded-xl border bg-background px-4 py-2 text-right"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Seu ID de usuário</p><p className="font-mono text-lg font-bold tracking-widest">{supportId}</p><p className="text-[10px] text-muted-foreground">9 dígitos • gerado pelo sistema • não editável</p></div>:null}
      </div>
    </div>
    <div className="p-4 sm:p-6">
      <div className="h-72 space-y-3 overflow-y-auto rounded-2xl border bg-muted/20 p-3">
        {loading?<p className="text-sm text-muted-foreground">Carregando atendimento...</p>:messages.length===0?<div className="grid h-full place-items-center text-center"><div><ShieldCheck className="mx-auto h-8 w-8 text-primary"/><p className="mt-2 font-semibold">Como podemos ajudar?</p><p className="text-sm text-muted-foreground">Escreva sua primeira mensagem abaixo.</p></div></div>:messages.map(message=><div key={message.id} className={`flex ${message.senderRole==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${message.senderRole==="user"?"bg-primary text-primary-foreground":"border bg-background"}`}><p className="whitespace-pre-wrap">{message.message}</p><p className={`mt-1 text-[10px] ${message.senderRole==="user"?"text-primary-foreground/70":"text-muted-foreground"}`}>{message.senderRole==="user"?"Você":"Suporte"} • {new Date(message.createdAt).toLocaleString("pt-BR")}</p></div></div>)}
        <div ref={endRef}/>
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2"><textarea value={text} onChange={event=>setText(event.target.value)} maxLength={5000} rows={2} placeholder="Digite sua mensagem para o suporte..." className="min-h-11 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"/><Button type="submit" disabled={sending||!text.trim()} className="self-stretch rounded-xl"><Send className="mr-2 h-4 w-4"/>{sending?"Enviando...":"Enviar"}</Button></form>
    </div>
  </section>;
}
