from pathlib import Path
p=Path('client/src/components/FloatingTutorial.tsx')
s=p.read_text()
if 'import SupportChat from "@/components/SupportChat";' not in s:
    s=s.replace('import { Input } from "@/components/ui/input";','import { Input } from "@/components/ui/input";\nimport SupportChat from "@/components/SupportChat";')
s=s.replace('const [thinking, setThinking] = useState(false);','const [thinking, setThinking] = useState(false);\n  const [supportOpen, setSupportOpen] = useState(false);')
s=s.replace('const POSITION_KEY = "note-note:tutorial-position-v5";','const POSITION_KEY = "note-note:tutorial-position-v6";')
s=s.replace('const MINIMIZED_KEY = "note-note:tutorial-minimized-v5";','const MINIMIZED_KEY = "note-note:tutorial-minimized-v6";')
old='<div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">\n        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3">'
new='<div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4">\n        {supportOpen && user.role !== "super_admin" ? <SupportChat /> : <>\n        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-3">'
if old not in s: raise SystemExit('body start not found')
s=s.replace(old,new,1)
old2='        {thinking && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.2s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.1s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"/></div></div>}\n      </div>'
new2='        {thinking && <div className="flex justify-start"><div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.2s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.1s]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"/></div></div>}\n        </>}\n      </div>'
if old2 not in s: raise SystemExit('body end not found')
s=s.replace(old2,new2,1)
old3='<button type="button" onClick={() => { window.location.href = "/tutorial#suporte"; }} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/15"><MessageCircle className="h-4 w-4" />Falar com o suporte</button>'
new3='<button type="button" onClick={() => { if (user.role === "super_admin") { window.location.href = "/admin/suporte"; return; } setSupportOpen(value => !value); }} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/15"><MessageCircle className="h-4 w-4" />{user.role === "super_admin" ? "Abrir painel de suporte" : supportOpen ? "Voltar ao guia" : "Falar com o suporte"}</button>'
if old3 not in s: raise SystemExit('support button not found')
s=s.replace(old3,new3,1)
p.write_text(s)
