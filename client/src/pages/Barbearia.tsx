import { useEffect, useState, useId } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Scissors,
  CalendarDays,
  Users,
  UserCheck,
  Wallet,
  Package,
  Settings,
  LayoutDashboard,
  Copy,
  ChevronRight,
  Menu,
  MessageCircle,
  ClipboardList,
  X,
} from "lucide-react";
import { toast } from "sonner";

const money = (n: number) =>
  (Number(n || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date()
  );
const weekDays = (value: string) => {
  const anchor = new Date(`${value}T12:00:00`);
  const mondayOffset = (anchor.getDay() + 6) % 7;
  anchor.setDate(anchor.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() + index);
    return day.toLocaleDateString("en-CA");
  });
};
const methods: any = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Crédito",
  debit: "Débito",
};
const addMinutes = (time: string, duration: number) => {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + Number(duration || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const readLogo = (file: File | null) =>
  new Promise<string>((resolve, reject) => {
    if (!file || file.size === 0) return resolve("");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1024 * 1024)
      return reject(new Error("A logo deve ser PNG, JPG ou WebP e ter no máximo 1 MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível carregar a logo."));
    reader.readAsDataURL(file);
  });
function Field({ label, ...props }: any) {
  const fieldId = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} {...props} />
    </div>
  );
}
function SelectField({ label, children, ...props }: any) {
  const fieldId = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <select id={fieldId}
        className="h-11 w-full rounded-lg border bg-background px-3"
        {...props}
      >
        <option value="">Selecione</option>
        {children}
      </select>
    </div>
  );
}
export default function Barbearia() {
  const { user } = useAuth();
  const [location] = useLocation();
  const slug = location.startsWith("/b/")
    ? decodeURIComponent(location.slice(3))
    : "";
  const pub = !!slug;
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Dashboard"),
    [drawerOpen, setDrawerOpen] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [newItemType, setNewItemType] = useState<"service" | "convenience">("service");
  const [date, setDate] = useState(today),
    [barber, setBarber] = useState(""),
    [selectedProducts, setSelectedProducts] = useState<string[]>([]),
    [time, setTime] = useState(""),
    [client, setClient] = useState(""),
    [login, setLogin] = useState(false);
  const endpoint =
    "/api/barbershop" +
    (pub
      ? `?shop=${encodeURIComponent(slug)}&date=${date}&barber=${barber}&products=${encodeURIComponent(selectedProducts.join(","))}`
      : "");
  async function load() {
    try {
      const r = await fetch(endpoint, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, [endpoint]);
  async function act(action: string, body: any) {
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      await load();
      toast.success("Salvo com sucesso.");
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function submit(action: string) {
    return async (e: any) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fields = Object.fromEntries(new FormData(form));
      if (await act(action, fields)) form.reset();
    };
  }
  const s = pub ? data?.shop : data?.shop?.data;
  const branding = s?.branding || {};
  const isBarberUser = data?.access?.role === "barber";
  const navigation = ([
    ["Dashboard", LayoutDashboard],
    ["Barbeiros", Scissors],
    ["Agenda", CalendarDays],
    ["Confirmações", UserCheck],
    ["Comandas", ClipboardList],
    ["Clientes", Users],
    ["Produtos", Package],
    ["Caixa", Wallet],
    ["Pagamento", Wallet],
    ["Perfil", Settings],
  ] as const).filter(([name]) =>
    !isBarberUser ||
    ["Dashboard", "Agenda", "Confirmações", "Comandas", "Clientes", "Pagamento"].includes(name)
  );
  const names = (list: any[], id: string) =>
    list?.find(x => x.id === id)?.name || "—";
  const appointments = s?.appointments || [];
  const selectedItems = s?.products?.filter((p: any) => selectedProducts.includes(p.id)) || [];
  const hasSelectedService = selectedItems.some((p: any) => (p.itemType || "service") === "service");
  const convenienceProducts = s?.products?.filter(
    (p: any) => p.active && p.itemType === "convenience"
  ) || [];
  const calendarDays = weekDays(date);
  const statusLabel: Record<string, string> = {
    agendado: "Aguardando confirmação",
    confirmado: "Confirmado",
    "check-in": "Cliente chegou",
    concluido: "Concluído",
    cancelado: "Cancelado",
  };
  const payments = s?.payments || [];
  const openCommands = appointments.filter(
    (a: any) =>
      a.date === today() &&
      ["confirmado", "check-in"].includes(a.status) &&
      !payments.some((payment: any) => payment.appointmentId === a.id)
  );
  const expenses = s?.expenses || [];
  const blocks = s?.blocks || [];
  const dayPayments = payments.filter(
    (p: any) =>
      new Date(p.date).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }) === date
  );
  const dayExpenses = expenses.filter(
    (p: any) =>
      new Date(p.date).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }) === date
  );
  const sum = (list: any[], key: string) =>
    list.reduce((n: number, p: any) => n + Number(p[key] || 0), 0);
  const options = (list: any[]) =>
    list?.map(x => (
      <option key={x.id} value={x.id}>
        {x.name}
      </option>
    ));
  const booking = (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async e => {
        e.preventDefault();
        if (
          await act("book", {
            date,
            time,
            barberId: barber,
            productIds: selectedProducts,
            clientId: client,
          })
        )
          setTime("");
      }}
    >
      {!pub && (
        <SelectField
          label="Cliente"
          required
          value={client}
          onChange={(e: any) => setClient(e.target.value)}
        >
          {options(s?.clients)}
        </SelectField>
      )}
      <SelectField
        label="Barbeiro"
        required
        value={barber}
        onChange={(e: any) => {
          setBarber(e.target.value);
          setTime("");
        }}
      >
        {options(s?.barbers)}
      </SelectField>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Serviços do atendimento</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {s?.products
            ?.filter(
              (p: any) =>
                p.active && (p.itemType || "service") === "service"
            )
            .map((p: any) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selectedProducts.includes(p.id) ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-slate-200 bg-background hover:border-blue-300 dark:border-slate-700"}`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={selectedProducts.includes(p.id)}
                onChange={e => {
                  setSelectedProducts(current =>
                    e.target.checked
                      ? [...current, p.id]
                      : current.filter(id => id !== p.id)
                  );
                  setTime("");
                }}
              />
              <span>
                <strong className="block text-sm">{p.name}</strong>
                <span className="text-xs text-muted-foreground">
                  {money(p.price)} · {p.duration} min
                </span>
              </span>
            </label>
            ))}
        </div>
        {selectedProducts.length > 0 ? (
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
            Total: {money(selectedItems.reduce((total: number, p: any) => total + p.price, 0))} · {selectedItems.reduce((total: number, p: any) => total + Number(p.duration || 0), 0)} minutos na agenda
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Selecione um ou mais serviços.
          </p>
        )}
      </fieldset>
      <Field
        label="Dia"
        type="date"
        required
        min={today()}
        value={date}
        onChange={(e: any) => {
          setDate(e.target.value);
          setTime("");
        }}
      />
      {pub ? (
        <SelectField
          label="Horários livres"
          required
          value={time}
          onChange={(e: any) => setTime(e.target.value)}
        >
          {data?.slots?.map((t: string) => (
            <option key={t}>{t}</option>
          ))}
        </SelectField>
      ) : (
        <Field
          label="Horário"
          type="time"
          required
          value={time}
          onChange={(e: any) => setTime(e.target.value)}
        />
      )}
      {pub && selectedProducts.length > 0 && barber && !data?.slots?.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum horário livre nesta data. Escolha outro dia.
        </p>
      )}
      {selectedProducts.length > 0 && !hasSelectedService && (
        <p className="text-sm text-amber-700 sm:col-span-2">
          Escolha pelo menos um serviço. Produtos de conveniência não ocupam horário e são adicionados junto ao atendimento.
        </p>
      )}
      <Button
        disabled={
          busy || selectedProducts.length === 0 || !hasSelectedService || (pub && !data?.customer)
        }
        className={`sm:col-span-2 ${pub ? "shop-primary-button" : ""}`}
      >
        Reservar horário
      </Button>
    </form>
  );
  return (
    <div
      className={`${pub ? "public-shop" : ""} min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100`}
      style={pub ? ({ "--shop-primary": branding.primaryColor || "#2563eb", "--shop-accent": branding.accentColor || "#4f46e5", "--shop-bg": branding.backgroundColor || "#f8fafc", backgroundColor: "var(--shop-bg)" } as any) : undefined}
    >
      {pub && <style>{`.public-shop .shop-primary-button{background:var(--shop-primary)!important;color:white!important}.public-shop .shop-card{border-color:color-mix(in srgb,var(--shop-primary) 28%,white)} `}</style>}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95" style={pub ? { borderColor: branding.primaryColor || "#2563eb" } : undefined}>
        <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {!pub && s ? (
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Abrir menu da barbearia"
              >
                <Menu className="h-5 w-5" />
              </Button>
            ) : null}
            {pub && branding.logo ? (
              <img src={branding.logo} alt={`Logo ${s?.name || "da barbearia"}`} className="h-12 w-12 rounded-2xl border bg-white object-cover shadow-lg" />
            ) : (
              <span className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3 text-white shadow-lg shadow-blue-600/20" style={pub ? { background: `linear-gradient(135deg, ${branding.primaryColor || "#2563eb"}, ${branding.accentColor || "#4f46e5"})` } : undefined}>
                <Scissors />
              </span>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600" style={pub ? { color: branding.primaryColor || "#2563eb" } : undefined}>
                Note Note · Barbearia
              </p>
              <h1 className="text-xl font-bold">
                {s?.name || "Sua barbearia"}
              </h1>
              {!pub && s ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tab}
                </p>
              ) : null}
            </div>
          </div>
          {!pub && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
              {user?.role === "super_admin" ? (
                <>
                  <span className="rounded-full bg-violet-100 px-3 py-1 font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-200">
                    Visualização do Super ADM
                  </span>
                  <a
                    className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 font-bold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    href="/admin/controle"
                  >
                    Voltar ao Painel de Controle
                  </a>
                </>
              ) : isBarberUser ? (
                <span className="rounded-full bg-blue-100 px-3 py-1 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                  Acesso do barbeiro · {s?.barbers?.[0]?.name || user?.name}
                </span>
              ) : (
                <>
                  <span>
                    ID {data?.shop?.user?.supportId || data?.user?.supportId || "—"} · R$ 14,99/mês
                  </span>
                  <a className="underline" href="/perfil">
                    Minha conta
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </header>
      <main className={`${pub ? "mx-auto max-w-7xl" : "mx-auto max-w-[1600px]"} space-y-6 p-4 sm:p-6 lg:p-8`}>
        {error ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <p role="alert">{error}</p>
              <a href="/login" className="text-blue-600 underline">
                Entrar no Note Note
              </a>
              <Button variant="outline" onClick={load}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : !data ? (
          <p>Carregando...</p>
        ) : data.setup ? (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-5 text-xl font-bold">
                Configure sua barbearia
              </h2>
              <form onSubmit={submit("profile")} className="max-w-lg space-y-4">
                <Field label="Nome da barbearia" name="name" required />
                <Field
                  label="Nome no link (exemplo: barbearia-do-joao)"
                  name="slug"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Seu link será notenote.com.br/b/nome-da-barbearia.
                </p>
                <Button disabled={busy}>Criar barbearia</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          s && (
            <>
              {pub ? (
                <div className="mx-auto max-w-2xl space-y-6">
                  <p>
                    Escolha seu barbeiro e reserve um horário. Atendimento das{" "}
                    {s.open} às {s.close}.
                  </p>
                  {!data.customer ? (
                    <Card className="shop-card">
                      <CardContent className="space-y-4 p-6">
                        <h2 className="text-xl font-bold">
                          {login
                            ? "Entre para agendar"
                            : "Cadastre-se para agendar"}
                        </h2>
                        {!login ? (
                          <p className="text-sm text-muted-foreground">
                            Informe seu e-mail e WhatsApp para reservar o corte e acompanhar a confirmação e o check-in.
                          </p>
                        ) : null}
                        <form
                          onSubmit={submit(login ? "login" : "register")}
                          className="space-y-4"
                        >
                          {!login && (
                            <>
                              <Field label="Nome" name="name" required />
                              <Field
                                label="WhatsApp com DDD"
                                name="whatsapp"
                                type="tel"
                                required
                              />
                            </>
                          )}
                          <Field
                            label="E-mail"
                            name="email"
                            type="email"
                            required
                          />
                          <Field
                            label="Senha"
                            name="password"
                            type="password"
                            minLength={8}
                            maxLength={128}
                            required
                          />
                          <Button disabled={busy} className="shop-primary-button">
                            {login ? "Entrar" : "Criar cadastro"}
                          </Button>
                        </form>
                        <Button variant="link" onClick={() => setLogin(!login)}>
                          {login
                            ? "Ainda não tenho cadastro"
                            : "Já tenho cadastro"}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <p className="font-semibold">Olá, {data.customer.name}!</p>
                  )}
                  <Card className="shop-card">
                    <CardContent className="space-y-5 p-6">
                      <h2 className="text-xl font-bold">Agende seu horário</h2>
                      {booking}
                    </CardContent>
                  </Card>
                  {!!data.appointments?.length && (
                    <Card className="shop-card">
                      <CardContent className="space-y-5 p-6">
                        <div>
                          <h2 className="text-xl font-bold">Minha conta e comanda</h2>
                          <p className="mt-1 text-sm text-muted-foreground">Acompanhe o atendimento e adicione produtos para pagar tudo junto.</p>
                        </div>
                        {data.appointments.map((a: any) => {
                          const commandOpen = a.date === today() && ["confirmado", "check-in"].includes(a.status);
                          return (
                            <div key={a.id} className="space-y-4 rounded-2xl border p-4">
                              <div>
                                <p className="font-bold">{a.date.split("-").reverse().join("/")} · {a.time} · {a.productName}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{names(s.barbers, a.barberId)} · {statusLabel[a.status] || a.status}</p>
                              </div>
                              {!!a.convenienceItems?.length && (
                                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                                  <p className="mb-2 text-sm font-bold">Produtos na comanda</p>
                                  {a.convenienceItems.map((item: any) => (
                                    <p key={item.productId} className="text-sm">{item.quantity}× {item.name} · {money(Number(item.unitPrice) * Number(item.quantity))}</p>
                                  ))}
                                </div>
                              )}
                              <p className="text-lg font-black">Total para pagar: {money(a.price)}</p>
                              {commandOpen && convenienceProducts.length > 0 && (
                                <div>
                                  <p className="mb-3 text-sm font-bold">Pedir produto</p>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {convenienceProducts.map((product: any) => (
                                      <Button key={product.id} type="button" variant="outline" disabled={busy} onClick={() => act("orderProduct", { appointmentId: a.id, productId: product.id })}>
                                        + {product.name} · {money(product.price)}
                                      </Button>
                                    ))}
                                  </div>
                                  <p className="mt-3 text-xs text-muted-foreground">Cada toque adiciona uma unidade. O valor será cobrado junto com os serviços.</p>
                                </div>
                              )}
                              {!commandOpen && a.date === today() && a.status === "agendado" && (
                                <p className="text-sm text-amber-700">A comanda será liberada quando a barbearia confirmar sua reserva ou fizer o check-in.</p>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <>
                  {drawerOpen ? (
                    <>
                      <button
                        type="button"
                        aria-label="Fechar menu"
                        className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm lg:hidden"
                        onClick={() => setDrawerOpen(false)}
                      />
                      <aside className="fixed inset-y-0 left-0 z-[60] flex w-[min(86vw,320px)] flex-col bg-slate-950 p-4 text-white shadow-2xl lg:hidden">
                        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
                              Menu
                            </p>
                            <p className="mt-1 font-bold">{s.name}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white hover:bg-white/10 hover:text-white"
                            onClick={() => setDrawerOpen(false)}
                            aria-label="Fechar menu"
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                        <nav className="space-y-1 overflow-y-auto">
                          {navigation.map(([name, Icon]) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                setTab(name);
                                setDrawerOpen(false);
                              }}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${tab === name ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="flex-1">{name}</span>
                              <ChevronRight className="h-4 w-4 opacity-60" />
                            </button>
                          ))}
                        </nav>
                      </aside>
                    </>
                  ) : null}
                  <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="sticky top-24 hidden rounded-3xl bg-slate-950 p-4 text-white shadow-xl lg:block">
                      <div className="mb-4 border-b border-white/10 px-2 pb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
                          Gestão da barbearia
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          Escolha uma área para gerenciar.
                        </p>
                      </div>
                      <nav className="space-y-1">
                        {navigation.map(([name, Icon]) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setTab(name)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${tab === name ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="flex-1">{name}</span>
                            <ChevronRight className="h-4 w-4 opacity-60" />
                          </button>
                        ))}
                      </nav>
                    </aside>
                    <section className="min-w-0 space-y-6 [&_[data-slot=card]]:rounded-2xl [&_[data-slot=card]]:border-slate-200/80 [&_[data-slot=card]]:shadow-sm dark:[&_[data-slot=card]]:border-slate-800">
                  {(tab === "Dashboard" || tab === "Caixa") && (
                    <>
                      {tab === "Dashboard" ? (
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                          <div>
                            <p className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                              Link de agendamento ativo
                            </p>
                            <a className="mt-1 block break-all text-sm text-emerald-700 underline dark:text-emerald-300" href={`/b/${data.shop.slug}`} target="_blank" rel="noreferrer">
                              {window.location.origin}/b/{data.shop.slug}
                            </a>
                          </div>
                          <Button variant="outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/b/${data.shop.slug}`).then(() => toast.success("Link copiado."))}>
                            <Copy className="mr-2 h-4 w-4" /> Copiar link
                          </Button>
                        </div>
                      ) : null}
                      <Field
                        label="Dia do fluxo"
                        type="date"
                        value={date}
                        onChange={(e: any) => setDate(e.target.value)}
                      />
                      <div className={`grid gap-4 sm:grid-cols-2 ${isBarberUser ? "xl:grid-cols-2" : "xl:grid-cols-5"}`}>
                        {(isBarberUser ? [
                          ["Meu faturamento", sum(dayPayments, "amount")],
                          ["Minha comissão", sum(dayPayments, "commission")],
                        ] : [
                          ["Recebido", sum(dayPayments, "amount")],
                          ["Taxas", sum(dayPayments, "fee")],
                          ["Comissões", sum(dayPayments, "commission")],
                          ["Saídas", sum(dayExpenses, "amount")],
                          [
                            "Saldo diário",
                            dayPayments.reduce(
                              (total: number, payment: any) =>
                                total + Number(payment.businessNet ?? payment.net ?? 0),
                              0
                            ) -
                              sum(dayExpenses, "amount"),
                          ],
                        ]).map(([label, value]) => (
                          <Card key={String(label)}>
                            <CardContent className="p-5">
                              <p className="text-sm text-muted-foreground">
                                {label}
                              </p>
                              <p className="mt-2 text-2xl font-bold">
                                {money(Number(value))}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                      <p>
                        {
                          appointments.filter(
                            (a: any) =>
                              a.date === date && a.status !== "cancelado"
                          ).length
                        }{" "}
                        agendamentos no dia
                      </p>
                      {tab === "Caixa" && (
                        <Card>
                          <CardContent className="space-y-4 p-6">
                            <h2 className="font-bold">Registrar saída</h2>
                            <form
                              onSubmit={submit("expense")}
                              className="grid gap-4 sm:grid-cols-3"
                            >
                              <Field
                                name="description"
                                label="Descrição"
                                required
                              />
                              <Field
                                name="amount"
                                label="Valor (R$)"
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                              />
                              <Button disabled={busy}>Registrar saída</Button>
                            </form>
                            {dayPayments.map((p: any) => (
                              <p key={p.id}>
                                {names(s.clients, p.clientId)} ·{" "}
                                {methods[p.method]} · recebido {money(p.amount)}{" "}
                                · taxa {money(p.fee)} · comissão {money(p.commission || 0)} · líquido da barbearia {money(p.businessNet ?? p.net)}
                              </p>
                            ))}
                            {dayExpenses.map((e: any) => (
                              <p key={e.id}>
                                {e.description} · saída {money(e.amount)}
                              </p>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                  {tab === "Barbeiros" && !isBarberUser && (
                    <div className="space-y-6">
                      {!isBarberUser && <Card>
                        <CardContent className="space-y-5 p-6">
                          <div>
                            <h2 className="text-xl font-bold">Cadastrar barbeiro</h2>
                            <p className="mt-1 text-sm text-muted-foreground">Defina a jornada e o intervalo. A comissão é opcional.</p>
                          </div>
                          <form
                            onSubmit={async e => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const f = new FormData(form);
                              if (await act("barber", {
                                name: f.get("name"), username: f.get("username"), password: f.get("password"), commissionType: f.get("commissionType"), commissionValue: f.get("commissionValue"),
                                open: f.get("open"), close: f.get("close"), breakStart: f.get("breakStart"), breakEnd: f.get("breakEnd"),
                                days: f.getAll("days").map(Number),
                              })) form.reset();
                            }}
                            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                          >
                            <Field label="Nome" name="name" required />
                            <Field label="Usuário de acesso" name="username" minLength="3" maxLength="40" pattern="[a-zA-Z0-9._-]+" placeholder="Ex.: joao.barbeiro" autoComplete="off" required />
                            <Field label="Senha inicial" name="password" type="password" minLength="8" placeholder="Maiúscula, número e 8 caracteres" autoComplete="new-password" required />
                            <SelectField label="Comissão (opcional)" name="commissionType" defaultValue="none">
                              <option value="none">Sem comissão</option>
                              <option value="percent">Porcentagem</option>
                              <option value="fixed">Valor fixo por atendimento</option>
                            </SelectField>
                            <Field label="Valor da comissão (% ou R$)" name="commissionValue" type="number" min="0" step="0.01" placeholder="Deixe vazio se não houver" />
                            <Field label="Entrada" name="open" type="time" defaultValue={s.open} required />
                            <Field label="Saída" name="close" type="time" defaultValue={s.close} required />
                            <Field label="Início do intervalo" name="breakStart" type="time" />
                            <Field label="Fim do intervalo" name="breakEnd" type="time" />
                            <fieldset className="sm:col-span-2 xl:col-span-4">
                              <legend className="mb-2 text-sm font-medium">Dias de trabalho</legend>
                              <div className="flex flex-wrap gap-3">
                                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, index) => (
                                  <label key={label} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                                    <input type="checkbox" name="days" value={index} defaultChecked={s.days.includes(index)} /> {label}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <Button disabled={busy} className="sm:col-span-2 xl:col-span-4">Cadastrar barbeiro</Button>
                          </form>
                        </CardContent>
                      </Card>}
                      {s.barbers.map((professional: any) => {
                        const commissionTotal = dayPayments.reduce((total: number, payment: any) => {
                          const appointment = appointments.find((item: any) => item.id === payment.appointmentId);
                          return (payment.barberId || appointment?.barberId) === professional.id ? total + Number(payment.commission || 0) : total;
                        }, 0);
                        return (
                          <Card key={professional.id}>
                            <CardContent className="space-y-5 p-6">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-lg font-bold">{professional.name}</h3>
                                  <p className="text-sm text-muted-foreground">Usuário: {professional.username || "conta não vinculada"} · Comissão no dia selecionado</p>
                                </div>
                                <p className="text-2xl font-black text-emerald-600">{money(commissionTotal)}</p>
                              </div>
                              <form
                                onSubmit={e => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  void act("updateBarber", {
                                    id: professional.id, name: f.get("name"), commissionType: f.get("commissionType"), commissionValue: f.get("commissionValue"),
                                    open: f.get("open"), close: f.get("close"), breakStart: f.get("breakStart"), breakEnd: f.get("breakEnd"),
                                    days: f.getAll("days").map(Number),
                                  });
                                }}
                                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                              >
                                <Field label="Nome" name="name" defaultValue={professional.name} required />
                                <SelectField label="Comissão (opcional)" name="commissionType" defaultValue={professional.commissionType || "none"}>
                                  <option value="none">Sem comissão</option>
                                  <option value="percent">Porcentagem</option>
                                  <option value="fixed">Valor fixo</option>
                                </SelectField>
                                <Field label="Valor da comissão (% ou R$)" name="commissionValue" type="number" min="0" step="0.01" defaultValue={professional.commissionType === "fixed" ? Number(professional.commissionValue || 0) / 100 : Number(professional.commissionValue || 0) || ""} placeholder="Deixe vazio se não houver" />
                                <Field label="Entrada" name="open" type="time" defaultValue={professional.open || s.open} required />
                                <Field label="Saída" name="close" type="time" defaultValue={professional.close || s.close} required />
                                <Field label="Início do intervalo" name="breakStart" type="time" defaultValue={professional.breakStart || ""} />
                                <Field label="Fim do intervalo" name="breakEnd" type="time" defaultValue={professional.breakEnd || ""} />
                                <fieldset className="sm:col-span-2 xl:col-span-4">
                                  <legend className="mb-2 text-sm font-medium">Dias de trabalho</legend>
                                  <div className="flex flex-wrap gap-3">
                                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, index) => (
                                      <label key={label} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                                        <input type="checkbox" name="days" value={index} defaultChecked={(professional.days || s.days).includes(index)} /> {label}
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                                <Button disabled={busy} className="sm:col-span-2 xl:col-span-4">Salvar configurações</Button>
                              </form>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  {tab === "Clientes" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <h2 className="text-xl font-bold">
                          Clientes cadastrados
                        </h2>
                        <form
                          onSubmit={submit("client")}
                          className="grid gap-4 sm:grid-cols-3"
                        >
                          <Field label="Nome" name="name" required />
                          <Field label="E-mail" name="email" type="email" />
                          <Field label="WhatsApp" name="whatsapp" required />
                          <Button disabled={busy}>Adicionar cliente</Button>
                        </form>
                        {s.clients.map((c: any) => (
                          <p key={c.id} className="rounded-lg border p-4">
                            {c.name} · {c.email} · {c.whatsapp}
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Produtos" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <h2 className="text-xl font-bold">
                          Produtos e serviços
                        </h2>
                        <form onSubmit={submit("product")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <SelectField label="Tipo" name="itemType" value={newItemType} onChange={(e: any) => setNewItemType(e.target.value)} required>
                            <option value="service">Serviço</option>
                            <option value="convenience">Produto de conveniência</option>
                          </SelectField>
                          <Field
                            label={newItemType === "service" ? "Nome do serviço" : "Nome do produto"}
                            name="name"
                            required
                          />
                          <Field
                            label="Valor (R$)"
                            name="price"
                            type="number"
                            min="0"
                            step="0.01"
                            required
                          />
                          <Field
                            label="Duração na agenda (minutos)"
                            name="duration"
                            type="number"
                            min="5"
                            max="480"
                            defaultValue="30"
                            required={newItemType === "service"}
                            disabled={newItemType === "convenience"}
                          />
                          <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">
                            Produtos como água, café, cerveja e refrigerante ficam com duração zero e não bloqueiam espaço na agenda.
                          </p>
                          <Button disabled={busy}>{newItemType === "service" ? "Cadastrar serviço" : "Cadastrar produto"}</Button>
                        </form>
                        {s.products.map((p: any) => (
                          <div
                            key={p.id}
                            className="flex flex-wrap justify-between gap-3 rounded-lg border p-4"
                          >
                            <p>
                              {p.name} · {money(p.price)} · {(p.itemType || "service") === "convenience" ? "Conveniência · não ocupa agenda" : `Serviço · ${p.duration} min`}
                            </p>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedProducts([p.id]);
                                setTab("Agenda");
                              }}
                            >
                              Adicionar cliente / agendar
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Agenda" && (
                    <>
                      {!isBarberUser && <Card>
                        <CardContent className="space-y-5 p-6">
                          <div>
                            <h2 className="text-xl font-bold">Novo agendamento</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Selecione quantos serviços o cliente desejar no mesmo horário.
                            </p>
                          </div>
                          {booking}
                        </CardContent>
                      </Card>}
                      {!isBarberUser && <Card>
                        <CardContent className="space-y-5 p-6">
                          <div>
                            <h2 className="text-xl font-bold">Bloquear horário</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Reserve períodos para almoço, folga, compromisso ou ausência.
                            </p>
                          </div>
                          <form onSubmit={submit("block")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                            <SelectField label="Barbeiro" name="barberId" required>{options(s.barbers)}</SelectField>
                            <Field label="Data" name="date" type="date" min={today()} required />
                            <Field label="Início" name="start" type="time" required />
                            <Field label="Fim" name="end" type="time" required />
                            <Field label="Motivo" name="reason" placeholder="Ex.: almoço" required />
                            <Button disabled={busy} className="sm:col-span-2 xl:col-span-5">Bloquear período</Button>
                          </form>
                          {blocks.filter((block: any) => block.date >= today()).map((block: any) => (
                            <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                              <p className="text-sm">
                                <strong>{names(s.barbers, block.barberId)}</strong> · {block.date.split("-").reverse().join("/")} · {block.start}–{block.end} · {block.reason}
                              </p>
                              <Button variant="outline" disabled={busy} onClick={() => act("unblock", { id: block.id })}>Liberar horário</Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>}
                      <Card>
                        <CardContent className="space-y-5 p-6">
                          <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                              <h2 className="text-xl font-bold">Agenda semanal</h2>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Visualize a semana completa e filtre por barbeiro.
                              </p>
                            </div>
                            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
                              <Field
                                label="Semana"
                                type="date"
                                value={date}
                                onChange={(e: any) => setDate(e.target.value)}
                              />
                              <SelectField
                                label="Barbeiro"
                                value={barber}
                                onChange={(e: any) => setBarber(e.target.value)}
                              >
                                {options(s.barbers)}
                              </SelectField>
                            </div>
                          </div>
                          <div className="overflow-x-auto pb-2">
                            <div className="grid min-w-[980px] grid-cols-7 gap-3">
                              {calendarDays.map(day => {
                                const dayAppointments = appointments
                                  .filter(
                                    (a: any) =>
                                      a.date === day &&
                                      a.status !== "cancelado" &&
                                      (!barber || a.barberId === barber)
                                  )
                                  .sort((a: any, b: any) =>
                                    a.time.localeCompare(b.time)
                                  );
                                return (
                                  <div key={day} className="min-h-72 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                                      <p className="text-xs font-bold uppercase text-blue-600">
                                        {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })}
                                      </p>
                                      <p className="font-bold">
                                        {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                                      </p>
                                    </div>
                                    <div className="space-y-2">
                                      {dayAppointments.length ? (
                                        dayAppointments.map((a: any) => (
                                          <div key={a.id} className={`rounded-xl border-l-4 bg-white p-3 shadow-sm dark:bg-slate-950 ${a.status === "check-in" ? "border-l-emerald-500" : a.status === "confirmado" ? "border-l-blue-500" : "border-l-amber-500"}`}>
                                            <p className="text-sm font-black">{a.time}–{addMinutes(a.time, Number(a.duration) || 30)}</p>
                                            <p className="mt-1 truncate text-sm font-semibold">
                                              {names(s.clients, a.clientId)}
                                            </p>
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                              {a.productName} · {Number(a.duration) || 30} min ocupados
                                            </p>
                                            <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                              {names(s.barbers, a.barberId)}
                                            </p>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="py-6 text-center text-xs text-muted-foreground">Livre</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                  {tab === "Dashboard" && (
                    <Card>
                      <CardContent className="space-y-4 p-6">
                        <h2 className="text-xl font-bold">Agenda do dia</h2>
                        {appointments
                          .filter((a: any) => a.date === date && a.status !== "cancelado")
                          .sort((a: any, b: any) => a.time.localeCompare(b.time))
                          .map((a: any) => (
                            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                              <div>
                                <p className="font-bold">{a.time} · {names(s.clients, a.clientId)}</p>
                                <p className="text-sm text-muted-foreground">
                                  {names(s.barbers, a.barberId)} · {a.productName} · {money(a.price)}
                                </p>
                              </div>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                                {statusLabel[a.status] || a.status}
                              </span>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Confirmações" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <div>
                          <h2 className="text-xl font-bold">Confirmações e check-in</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Confirme a reserva e registre a chegada do cliente.
                          </p>
                        </div>
                        {appointments
                          .filter((a: any) => a.date >= today() && !["cancelado", "concluido"].includes(a.status))
                          .sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time))
                          .map((a: any) => {
                            const c = s.clients.find((clientItem: any) => clientItem.id === a.clientId);
                            let phone = String(c?.whatsapp || "").replace(/\D/g, "");
                            if (phone.length <= 11) phone = "55" + phone;
                            const msg = `Olá, ${c?.name}! Sua reserva na ${s.name} está marcada para ${a.date.split("-").reverse().join("/")} às ${a.time}, com ${names(s.barbers, a.barberId)}. Podemos confirmar?`;
                            return (
                              <div key={a.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-bold">{c?.name} · {a.date.split("-").reverse().join("/")} às {a.time}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{a.productName} · {names(s.barbers, a.barberId)} · {money(a.price)}</p>
                                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-blue-600">{statusLabel[a.status] || a.status}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold">
                                      <MessageCircle className="h-4 w-4" /> WhatsApp
                                    </a>
                                    {a.status === "agendado" ? (
                                      <Button disabled={busy} onClick={() => act("confirm", { id: a.id })}>Confirmar</Button>
                                    ) : null}
                                    {["agendado", "confirmado"].includes(a.status) ? (
                                      <Button variant="outline" disabled={busy} onClick={() => act("checkin", { id: a.id })}>Fazer check-in</Button>
                                    ) : null}
                                    {!isBarberUser && ["agendado", "confirmado"].includes(a.status) ? (
                                      <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy} onClick={() => act("cancel", { id: a.id })}>Cancelar</Button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Comandas" && (
                    <div className="space-y-5">
                      <div>
                        <h2 className="text-xl font-bold">Comandas abertas</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Controle os consumos dos clientes presentes e encaminhe o total para o pagamento.</p>
                      </div>
                      {openCommands.length ? openCommands.map((a: any) => (
                        <Card key={a.id}>
                          <CardContent className="space-y-5 p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-black">{names(s.clients, a.clientId)}</h3>
                                <p className="text-sm text-muted-foreground">{a.time} · {names(s.barbers, a.barberId)} · {a.productName}</p>
                              </div>
                              <p className="text-2xl font-black text-emerald-600">{money(a.price)}</p>
                            </div>
                            <div className="rounded-2xl border p-4">
                              <p className="mb-3 font-bold">Itens da comanda</p>
                              {a.convenienceItems?.length ? a.convenienceItems.map((item: any) => (
                                <div key={item.productId} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
                                  <div>
                                    <p className="font-semibold">{item.quantity}× {item.name}</p>
                                    <p className="text-sm text-muted-foreground">{money(Number(item.unitPrice) * Number(item.quantity))}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act("removeProduct", { appointmentId: a.id, productId: item.productId })}>− 1</Button>
                                    <Button type="button" size="sm" disabled={busy} onClick={() => act("orderProduct", { appointmentId: a.id, productId: item.productId })}>+ 1</Button>
                                  </div>
                                </div>
                              )) : <p className="text-sm text-muted-foreground">Nenhum produto consumido.</p>}
                            </div>
                            {!!convenienceProducts.length && (
                              <div>
                                <p className="mb-3 font-bold">Adicionar produto</p>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {convenienceProducts.map((product: any) => (
                                    <Button key={product.id} type="button" variant="outline" disabled={busy} onClick={() => act("orderProduct", { appointmentId: a.id, productId: product.id })}>
                                      + {product.name} · {money(product.price)}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                              <p className="font-black">Serviços e produtos: {money(a.price)}</p>
                              <Button type="button" onClick={() => setTab("Pagamento")}>Ir para pagamento</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )) : (
                        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma comanda aberta. Confirme a reserva ou faça o check-in do cliente para liberar a comanda.</CardContent></Card>
                      )}
                    </div>
                  )}
                  {tab === "Pagamento" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        {!isBarberUser && <>
                        <h2 className="text-xl font-bold">Taxas de cartão</h2>
                        <form
                          onSubmit={submit("rates")}
                          className="grid gap-4 sm:grid-cols-3"
                        >
                          <Field
                            label="Crédito (%)"
                            name="credit"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            defaultValue={s.rates.credit}
                          />
                          <Field
                            label="Débito (%)"
                            name="debit"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            defaultValue={s.rates.debit}
                          />
                          <Button disabled={busy}>Salvar taxas</Button>
                        </form>
                        </>}
                        <h2 className="font-bold">Receber atendimento</h2>
                        {appointments
                          .filter((a: any) =>
                            ["agendado", "confirmado", "check-in"].includes(
                              a.status
                            )
                          )
                          .map((a: any) => (
                            <form
                              key={a.id}
                              className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
                              onSubmit={e => {
                                e.preventDefault();
                                act("pay", {
                                  id: a.id,
                                  method: new FormData(e.currentTarget).get(
                                    "method"
                                  ),
                                });
                              }}
                            >
                              <div className="min-w-[260px] flex-1">
                                <p className="font-bold">{names(s.clients, a.clientId)} · {a.date} {a.time}</p>
                                <p className="text-sm text-muted-foreground">{a.productName}</p>
                                {!!a.convenienceItems?.length && (
                                  <p className="mt-1 text-sm">Comanda: {a.convenienceItems.map((item: any) => `${item.quantity}× ${item.name}`).join(" · ")}</p>
                                )}
                                <p className="mt-2 font-black">Total: {money(a.price)}</p>
                                <p className="text-xs text-muted-foreground">Comissão de {names(s.barbers, a.barberId)}: {(() => {
                                  const professional = s.barbers.find((item: any) => item.id === a.barberId);
                                  if (!professional?.commissionType || professional.commissionType === "none") return "sem comissão";
                                  return professional?.commissionType === "fixed"
                                    ? money(Math.min(Number(a.servicePrice ?? a.price), Number(professional.commissionValue || 0)))
                                    : `${Number(professional?.commissionValue || 0)}%`;
                                })()}</p>
                              </div>
                              <SelectField
                                label="Forma de pagamento"
                                name="method"
                                required
                              >
                                {Object.entries(methods).map(([k, v]: any) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </SelectField>
                              <Button disabled={busy}>Lançar pagamento</Button>
                            </form>
                          ))}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Perfil" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <h2 className="text-xl font-bold">
                          Perfil da barbearia
                        </h2>
                        <div className="flex flex-wrap items-center gap-3">
                          <a
                            className="break-all text-blue-600 underline"
                            href={`/b/${data.shop.slug}`}
                          >
                            {window.location.origin}/b/{data.shop.slug}
                          </a>
                          <Button
                            variant="outline"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(
                                  `${window.location.origin}/b/${data.shop.slug}`
                                )
                                .then(() => toast.success("Link copiado."))
                                .catch(() =>
                                  toast.error("Não foi possível copiar.")
                                )
                            }
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar link
                          </Button>
                        </div>
                        <form
                          className="space-y-4"
                          onSubmit={async e => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            try {
                              const logo = await readLogo(f.get("logo") instanceof File ? f.get("logo") as File : null);
                              await act("profile", {
                                name: f.get("name"), open: f.get("open"), close: f.get("close"),
                                days: f.getAll("days").map(Number), logo,
                                removeLogo: f.get("removeLogo") === "on",
                                primaryColor: f.get("primaryColor"), accentColor: f.get("accentColor"),
                                backgroundColor: f.get("backgroundColor"),
                              });
                            } catch (error: any) {
                              toast.error(error.message);
                            }
                          }}
                        >
                          <Field
                            name="name"
                            label="Nome da barbearia"
                            defaultValue={s.name}
                            required
                          />
                          <div className="rounded-2xl border p-4">
                            <Label htmlFor="barbershop-logo">Logo da barbearia (opcional)</Label>
                            <div className="mt-3 flex flex-wrap items-center gap-4">
                              {(logoPreview || branding.logo) && (
                                <img src={logoPreview || branding.logo} alt="Prévia da logo" className="h-20 w-20 rounded-2xl border bg-white object-cover" />
                              )}
                              <Input
                                id="barbershop-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
                                onChange={(event: any) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return setLogoPreview("");
                                  readLogo(file).then(setLogoPreview).catch((error: Error) => { event.target.value = ""; toast.error(error.message); });
                                }}
                              />
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">PNG, JPG ou WebP de até 1 MB. A imagem aparecerá no link dos clientes.</p>
                            {branding.logo && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" /> Remover logo atual</label>}
                          </div>
                          <div className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">
                            <Field name="primaryColor" label="Cor principal" type="color" defaultValue={branding.primaryColor || "#2563eb"} />
                            <Field name="accentColor" label="Cor de destaque" type="color" defaultValue={branding.accentColor || "#4f46e5"} />
                            <Field name="backgroundColor" label="Cor do fundo" type="color" defaultValue={branding.backgroundColor || "#f8fafc"} />
                            <p className="text-sm text-muted-foreground sm:col-span-3">Essas cores personalizam o cabeçalho, os botões e o fundo da página pública.</p>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                              name="open"
                              label="Abre às"
                              type="time"
                              defaultValue={s.open}
                              required
                            />
                            <Field
                              name="close"
                              label="Fecha às"
                              type="time"
                              defaultValue={s.close}
                              required
                            />
                          </div>
                          <div className="flex flex-wrap gap-4">
                            {[
                              "Dom",
                              "Seg",
                              "Ter",
                              "Qua",
                              "Qui",
                              "Sex",
                              "Sáb",
                            ].map((d, i) => (
                              <label key={d} className="flex gap-2">
                                <input
                                  type="checkbox"
                                  name="days"
                                  value={i}
                                  defaultChecked={s.days.includes(i)}
                                />
                                {d}
                              </label>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Horários de Brasília.
                          </p>
                          <Button disabled={busy}>Salvar perfil</Button>
                        </form>
                      </CardContent>
                    </Card>
                  )}
                    </section>
                  </div>
                </>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
