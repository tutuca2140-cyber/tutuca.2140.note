from pathlib import Path
p=Path('client/src/components/FloatingTutorial.tsx')
s=p.read_text()
s=s.replace('Bot, ChevronRight, CircleHelp, GraduationCap, GripHorizontal, Minimize2, Orbit, Send, Sparkles, Zap','Bot, ChevronRight, CircleHelp, GraduationCap, GripHorizontal, MessageCircle, Minimize2, Orbit, Send, Sparkles, Zap')
needle='  { id: "primeiro-acesso", title: "Concluir pagamento e primeiro acesso", area: "Cadastro e assinatura", keywords: ["primeiro acesso", "pagamento pendente", "continuar pagamento", "pix", "cartão", "cartao", "asaas"], intro: "Novos assinantes só entram na operação depois de concluir as etapas exigidas no pagamento.", steps: ["Escolha o plano e a forma de pagamento.", "Preencha o cadastro e aceite os termos.", "Conclua cartão ou Pix no fluxo do Asaas.", "Se sair antes de terminar, volte ao login com o mesmo usuário.", "O Note Note mostra a etapa em que você parou.", "Depois da confirmação exigida, o primeiro acesso é liberado."] },\n'
insert=needle+'  { id: "suporte", title: "Falar com o suporte", area: "Suporte", keywords: ["suporte", "falar com suporte", "atendimento", "ajuda humana", "mensagem suporte"], intro: "Você pode falar diretamente com o suporte do Note Note dentro do Tutorial.", steps: ["Abra o Tutorial.", "Entre na seção Fale com o suporte.", "Digite sua mensagem e envie.", "A mensagem chega ao painel do Super Admin com seu nome e ID de 9 dígitos.", "Acompanhe as respostas no mesmo chat."], tip: "Use o botão Falar com suporte abaixo para abrir o atendimento agora." },\n'
if 'id: "suporte"' not in s:
    if needle not in s: raise SystemExit('support guide insertion point not found')
    s=s.replace(needle,insert,1)
s=s.replace('const quickTopics = ["Como começar?", "Dashboard", "Cadastrar cliente", "Empréstimos", "Produtos e estoque", "Veículos", "Financiamento", "Imóveis", "Financiar imóvel", "Aluguéis", "Pagamentos", "Agentes", "Caixa", "Contas a receber", "Meu Perfil"];','const quickTopics = ["Falar com suporte", "Como começar?", "Dashboard", "Cadastrar cliente", "Empréstimos", "Produtos e estoque", "Veículos", "Financiamento", "Imóveis", "Financiar imóvel", "Aluguéis", "Pagamentos", "Agentes", "Caixa", "Contas a receber", "Meu Perfil"];')
old='<div className="relative border-t border-white/10 bg-slate-950/90 p-3"><div className="mb-3 flex gap-2 overflow-x-auto pb-1">'
new='<div className="relative border-t border-white/10 bg-slate-950/90 p-3"><button type="button" onClick={() => { window.location.href = "/tutorial#suporte"; }} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/15"><MessageCircle className="h-4 w-4" />Falar com o suporte</button><div className="mb-3 flex gap-2 overflow-x-auto pb-1">'
if 'window.location.href = "/tutorial#suporte"' not in s:
    if old not in s: raise SystemExit('support button insertion point not found')
    s=s.replace(old,new,1)
p.write_text(s)
