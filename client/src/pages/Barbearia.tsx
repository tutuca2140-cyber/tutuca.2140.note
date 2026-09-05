import { useEffect, useState, useId } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Scissors,
  CalendarDays,
  Users,
  Wallet,
  Package,
  Settings,
  LayoutDashboard,
  Copy,
  MessageCircle,
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
const methods: any = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Crédito",
  debit: "Débito",
};
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
  const [location] = useLocation();
  const slug = location.startsWith("/b/")
    ? decodeURIComponent(location.slice(3))
    : "";
  const pub = !!slug;
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Dashboard");
  const [date, setDate] = useState(today),
    [barber, setBarber] = useState(""),
    [product, setProduct] = useState(""),
    [time, setTime] = useState(""),
    [client, setClient] = useState(""),
    [login, setLogin] = useState(false);
  const endpoint =
    "/api/barbershop" +
    (pub
      ? `?shop=${encodeURIComponent(slug)}&date=${date}&barber=${barber}&product=${product}`
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
  const names = (list: any[], id: string) =>
    list?.find(x => x.id === id)?.name || "—";
  const appointments = s?.appointments || [];
  const payments = s?.payments || [];
  const expenses = s?.expenses || [];
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
            productId: product,
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
      <SelectField
        label="Produto / serviço"
        required
        value={product}
        onChange={(e: any) => {
          setProduct(e.target.value);
          setTime("");
        }}
      >
        {s?.products?.map((p: any) => (
          <option key={p.id} value={p.id}>
            {p.name} · {money(p.price)} · {p.duration} min
          </option>
        ))}
      </SelectField>
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
      {pub && product && barber && !data?.slots?.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum horário livre nesta data. Escolha outro dia.
        </p>
      )}
      <Button
        disabled={busy || (pub && !data?.customer)}
        className="sm:col-span-2"
      >
        Reservar horário
      </Button>
    </form>
  );
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-600 p-3 text-white">
              <Scissors />
            </span>
            <div>
              <p className="text-sm font-semibold text-blue-600">
                Note Note · Barbearia
              </p>
              <h1 className="text-xl font-bold">
                {s?.name || "Sua barbearia"}
              </h1>
            </div>
          </div>
          {!pub && (
            <div className="text-sm">
              ID {data?.shop?.user?.supportId || data?.user?.supportId || "—"} ·
              R$ 14,99/mês{" "}
              <a className="ml-3 underline" href="/perfil">
                Minha conta
              </a>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
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
                    <Card>
                      <CardContent className="space-y-4 p-6">
                        <h2 className="text-xl font-bold">
                          {login
                            ? "Entre para agendar"
                            : "Cadastre-se para agendar"}
                        </h2>
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
                          <Button disabled={busy}>
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
                  <Card>
                    <CardContent className="space-y-5 p-6">
                      <h2 className="text-xl font-bold">Agende seu horário</h2>
                      {booking}
                    </CardContent>
                  </Card>
                  {!!data.appointments?.length && (
                    <Card>
                      <CardContent className="space-y-3 p-6">
                        <h2 className="font-bold">Meus agendamentos</h2>
                        {data.appointments.map((a: any) => (
                          <p key={a.id}>
                            {a.date.split("-").reverse().join("/")} · {a.time} ·{" "}
                            {a.productName} · {names(s.barbers, a.barberId)} ·{" "}
                            {a.status}
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <>
                  <nav className="flex flex-wrap gap-2">
                    {[
                      ["Dashboard", LayoutDashboard],
                      ["Barbeiros", Scissors],
                      ["Agenda", CalendarDays],
                      ["Clientes", Users],
                      ["Produtos", Package],
                      ["Caixa", Wallet],
                      ["Pagamento", Wallet],
                      ["Perfil", Settings],
                    ].map(([name, Icon]: any) => (
                      <Button
                        key={name}
                        variant={tab === name ? "default" : "outline"}
                        onClick={() => setTab(name)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {name}
                      </Button>
                    ))}
                  </nav>
                  {(tab === "Dashboard" || tab === "Caixa") && (
                    <>
                      <Field
                        label="Dia do fluxo"
                        type="date"
                        value={date}
                        onChange={(e: any) => setDate(e.target.value)}
                      />
                      <div className="grid gap-4 sm:grid-cols-4">
                        {[
                          ["Recebido", sum(dayPayments, "amount")],
                          ["Taxas", sum(dayPayments, "fee")],
                          ["Saídas", sum(dayExpenses, "amount")],
                          [
                            "Saldo diário",
                            sum(dayPayments, "net") -
                              sum(dayExpenses, "amount"),
                          ],
                        ].map(([label, value]) => (
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
                                · taxa {money(p.fee)} · líquido {money(p.net)}
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
                  {tab === "Barbeiros" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <h2 className="text-xl font-bold">
                          Barbeiros cadastrados
                        </h2>
                        <form
                          onSubmit={submit("barber")}
                          className="flex flex-wrap items-end gap-4"
                        >
                          <Field
                            label="Nome do barbeiro"
                            name="name"
                            required
                          />
                          <Button disabled={busy}>Cadastrar</Button>
                        </form>
                        {s.barbers.map((b: any) => (
                          <p key={b.id} className="rounded-lg border p-4">
                            {b.name}
                          </p>
                        ))}
                      </CardContent>
                    </Card>
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
                        <form
                          onSubmit={submit("product")}
                          className="grid gap-4 sm:grid-cols-3"
                        >
                          <Field
                            label="Nome do produto / serviço"
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
                            required
                          />
                          <Button disabled={busy}>Cadastrar</Button>
                        </form>
                        {s.products.map((p: any) => (
                          <div
                            key={p.id}
                            className="flex flex-wrap justify-between gap-3 rounded-lg border p-4"
                          >
                            <p>
                              {p.name} · {money(p.price)} · {p.duration} min
                            </p>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setProduct(p.id);
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
                  {(tab === "Agenda" || tab === "Dashboard") && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
                        <h2 className="text-xl font-bold">
                          {tab === "Agenda"
                            ? "Novo agendamento"
                            : "Agenda do dia"}
                        </h2>
                        {tab === "Agenda" && booking}
                        <h3 className="font-semibold">
                          {tab === "Agenda"
                            ? "Agendamentos dos próximos 7 dias"
                            : "Clientes agendados"}
                        </h3>
                        {appointments
                          .filter(
                            (a: any) =>
                              a.date >= date &&
                              (tab === "Dashboard"
                                ? a.date === date
                                : new Date(a.date + "T12:00:00").getTime() <
                                  new Date(date + "T12:00:00").getTime() +
                                    7 * 86400000) &&
                              (!barber || a.barberId === barber)
                          )
                          .sort((a: any, b: any) =>
                            (a.date + a.time).localeCompare(b.date + b.time)
                          )
                          .map((a: any) => {
                            const c = s.clients.find(
                              (c: any) => c.id === a.clientId
                            );
                            let phone = String(c?.whatsapp || "").replace(
                              /\D/g,
                              ""
                            );
                            if (phone.length <= 11) phone = "55" + phone;
                            const msg = `Olá, ${c?.name}! Confirmamos sua reserva na ${s.name} em ${a.date.split("-").reverse().join("/")} às ${a.time}, com ${names(s.barbers, a.barberId)}?`;
                            return (
                              <div
                                key={a.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                              >
                                <div>
                                  <p className="font-semibold">
                                    {a.date.split("-").reverse().join("/")} ·{" "}
                                    {a.time} · {c?.name}
                                  </p>
                                  <p>
                                    {names(s.barbers, a.barberId)} ·{" "}
                                    {a.productName} · {money(a.price)} ·{" "}
                                    {a.status}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <a
                                    href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-lg border p-2 text-sm"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                    Confirmar no WhatsApp
                                  </a>
                                  {a.status === "agendado" && (
                                    <Button
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() =>
                                        act("cancel", { id: a.id })
                                      }
                                    >
                                      Cancelar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </CardContent>
                    </Card>
                  )}
                  {tab === "Pagamento" && (
                    <Card>
                      <CardContent className="space-y-5 p-6">
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
                        <h2 className="font-bold">Receber atendimento</h2>
                        {appointments
                          .filter((a: any) => a.status === "agendado")
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
                              <p className="flex-1">
                                {names(s.clients, a.clientId)} · {a.date}{" "}
                                {a.time} · {a.productName} · {money(a.price)}
                              </p>
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
                          onSubmit={e => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            act("profile", {
                              name: f.get("name"),
                              open: f.get("open"),
                              close: f.get("close"),
                              days: f.getAll("days").map(Number),
                            });
                          }}
                        >
                          <Field
                            name="name"
                            label="Nome da barbearia"
                            defaultValue={s.name}
                            required
                          />
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
                </>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
