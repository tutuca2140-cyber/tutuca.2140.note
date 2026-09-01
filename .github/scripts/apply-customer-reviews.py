from pathlib import Path


def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f'pattern not found in {path}: {old[:120]}')
    p.write_text(s.replace(old,new,1))

# route backend through shared API
replace_once('api/site-access.ts','import { handleSupportChat } from "../server/support-chat.js";','import { handleSupportChat } from "../server/support-chat.js";\nimport { handleReviews } from "../server/reviews.js";')
replace_once('api/site-access.ts','  if(scope==="support")return handleSupportChat(req,res);','  if(scope==="support")return handleSupportChat(req,res);\n  if(scope==="reviews")return handleReviews(req,res);')

# app route
replace_once('client/src/App.tsx','const AdminSuporte = lazy(() => import("./pages/admin/Suporte"));','const AdminSuporte = lazy(() => import("./pages/admin/Suporte"));\nconst AdminAvaliacoes = lazy(() => import("./pages/admin/Avaliacoes"));')
replace_once('client/src/App.tsx','      <Route path={"/admin/suporte"} component={AdminSuporte} />','      <Route path={"/admin/suporte"} component={AdminSuporte} />\n      <Route path={"/admin/avaliacoes"} component={AdminAvaliacoes} />')

# admin navigation
p=Path('client/src/components/DashboardLayout.tsx'); s=p.read_text()
s=s.replace('Mail, Menu, MessageCircle, MoreHorizontal, Package, Settings, Shield,','Mail, Menu, MessageCircle, MoreHorizontal, Package, Settings, Shield, Star,')
needle='    { name: "Suporte", href: "/admin/suporte", icon: MessageCircle, show: Boolean(isSuperAdmin || user?.adminCanSupport) },'
insert=needle+'\n    { name: "Avaliações", href: "/admin/avaliacoes", icon: Star, show: Boolean(isSuperAdmin) },'
if 'href: "/admin/avaliacoes"' not in s:
    if needle not in s: raise SystemExit('admin nav point not found')
    s=s.replace(needle,insert,1)
p.write_text(s)

# profile review area
p=Path('client/src/pages/Perfil.tsx'); s=p.read_text()
s=s.replace('  Save,\n  ShieldCheck,','  Save,\n  ShieldCheck,\n  Star,')
needle='  const [error, setError] = useState("");'
insert='''  const [error, setError] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewPublished, setReviewPublished] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);'''
if 'reviewRating' not in s:
    if needle not in s: raise SystemExit('profile state point not found')
    s=s.replace(needle,insert,1)
needle='''  useEffect(() => {
    void load();
  }, []);'''
insert='''  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!profile?.commercial) return;
    fetch("/api/site-access?scope=reviews&action=mine", { credentials: "include", cache: "no-store" })
      .then(async response => ({ response, result: await response.json().catch(() => ({})) }))
      .then(({ response, result }) => {
        if (!response.ok || !result?.success) return;
        if (result.review) {
          setReviewRating(Number(result.review.rating || 0));
          setReviewComment(String(result.review.comment || ""));
          setReviewPublished(Boolean(result.review.published));
        }
      }).catch(() => {});
  }, [profile?.commercial]);

  const saveReview = async () => {
    if (!reviewRating) return toast.error("Escolha de 1 a 5 estrelas.");
    if (reviewComment.trim().length < 3) return toast.error("Escreva um comentário, sugestão ou elogio.");
    setReviewSaving(true);
    try {
      const response = await fetch("/api/site-access?scope=reviews&action=mine", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw new Error(result?.message || "Não foi possível enviar sua avaliação.");
      setReviewPublished(false);
      toast.success(result.message || "Avaliação enviada.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação."); }
    finally { setReviewSaving(false); }
  };'''
if 'const saveReview = async' not in s:
    if needle not in s: raise SystemExit('profile effect point not found')
    s=s.replace(needle,insert,1)
needle='''            {profile.canDeleteAccount && (
              <Card className="border-destructive/40">'''
insert='''            {profile.commercial && (
              <Card>
                <CardHeader>
                  <CardTitle>Avalie o Note Note</CardTitle>
                  <CardDescription>Sua opinião ajuda a melhorar o sistema. Dê até 5 estrelas e escreva uma sugestão ou elogio. O texto só aparece no site se for aprovado pelo Note Note.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">Sua nota</p>
                    <div className="flex gap-1.5">{[1,2,3,4,5].map(n => <button key={n} type="button" onMouseEnter={()=>setReviewHover(n)} onMouseLeave={()=>setReviewHover(0)} onClick={()=>setReviewRating(n)} aria-label={`${n} estrela${n>1?"s":""}`} className="rounded-lg p-1 transition hover:scale-110"><Star className={`h-8 w-8 ${n <= (reviewHover || reviewRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} /></button>)}</div>
                  </div>
                  <div>
                    <Label htmlFor="profile-review">Comentário, sugestão ou elogio</Label>
                    <textarea id="profile-review" value={reviewComment} onChange={e=>setReviewComment(e.target.value)} maxLength={1200} rows={5} placeholder="Conte o que você acha do Note Note ou deixe uma sugestão..." className="mt-2 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{reviewPublished ? "Este depoimento está publicado no site." : "Ao editar e reenviar, a avaliação volta para análise antes de ser publicada."}</span><span>{reviewComment.length}/1200</span></div>
                  </div>
                  <Button onClick={saveReview} disabled={reviewSaving || !reviewRating || reviewComment.trim().length < 3}>{reviewSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Star className="mr-2 h-4 w-4"/>}{reviewSaving ? "Enviando..." : "Enviar avaliação"}</Button>
                </CardContent>
              </Card>
            )}

            {profile.canDeleteAccount && (
              <Card className="border-destructive/40">'''
if 'Avalie o Note Note' not in s:
    if needle not in s: raise SystemExit('profile review insertion point not found')
    s=s.replace(needle,insert,1)
p.write_text(s)

# public testimonials on homepage
p=Path('client/src/pages/Home.tsx'); s=p.read_text()
s=s.replace('  ShieldCheck,\n  TrendingUp,','  ShieldCheck,\n  Star,\n  TrendingUp,')
needle='''export default function Home() {
  return ('''
insert='''export default function Home() {
  const [publicReviews, setPublicReviews] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/site-access?scope=reviews&action=published", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.success && Array.isArray(j.reviews)) setPublicReviews(j.reviews); })
      .catch(() => {});
  }, []);
  return ('''
if 'publicReviews' not in s:
    if needle not in s: raise SystemExit('home state point not found')
    s=s.replace(needle,insert,1)
needle='''        <section id="suporte" className="scroll-mt-24 px-5 py-20 lg:px-8">'''
insert='''        {publicReviews.length > 0 && <section id="avaliacoes" className="border-t border-slate-200 bg-white py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Opinião de quem usa</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">O que nossos clientes dizem</h2><p className="mt-4 text-slate-600">Avaliações enviadas por clientes do Note Note e publicadas após análise.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{publicReviews.slice(0,6).map(review => <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex gap-1">{[1,2,3,4,5].map(n=><Star key={n} className={`h-5 w-5 ${n<=Number(review.rating)?"fill-amber-400 text-amber-400":"text-slate-200"}`}/>)}</div><p className="mt-4 text-sm leading-7 text-slate-600">“{review.comment}”</p><p className="mt-5 font-extrabold text-slate-900">{review.name || "Cliente Note Note"}</p><p className="text-xs text-slate-400">Cliente Note Note</p></article>)}</div></div></section>}

        <section id="suporte" className="scroll-mt-24 px-5 py-20 lg:px-8">'''
if 'O que nossos clientes dizem' not in s:
    if needle not in s: raise SystemExit('home testimonials point not found')
    s=s.replace(needle,insert,1)
p.write_text(s)
print('customer reviews applied')
