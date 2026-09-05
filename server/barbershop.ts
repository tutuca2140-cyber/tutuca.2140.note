import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  getSql,
  readCookie,
  readJsonBody,
  sendJson,
  SESSION_COOKIE_NAME,
} from "../api/auth/_shared.js";

const fail = (message: string, statusCode = 400): never => {
  throw Object.assign(new Error(message), { statusCode });
};
const str = (v: unknown, max = 160) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const id = () => crypto.randomUUID();
const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const cents = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) fail("Valor inválido.");
  return Math.round(n * 100);
};
export function minutes(v: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail("Horário inválido.");
  return Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
}
export function slotFree(
  state: any,
  barberId: string,
  date: string,
  time: string,
  duration: number
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(duration) ||
    duration < 5 ||
    duration > 480
  )
    return false;
  const day = new Date(`${date}T12:00:00-03:00`);
  if (Number.isNaN(day.getTime()) || !state.days.includes(day.getUTCDay()))
    return false;
  const start = minutes(time),
    end = start + duration;
  if (
    start < minutes(state.open) ||
    end > minutes(state.close) ||
    new Date(`${date}T${time}:00-03:00`).getTime() <= Date.now()
  )
    return false;
  return !state.appointments.some(
    (a: any) =>
      a.barberId === barberId &&
      a.date === date &&
      a.status !== "cancelado" &&
      start < minutes(a.time) + a.duration &&
      end > minutes(a.time)
  );
}
let ready: Promise<unknown> | null = null;
async function ensure() {
  if (!ready) {
    const sql = getSql();
    ready = Promise.all([
      sql`CREATE TABLE IF NOT EXISTS barber_shops (owner_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, slug varchar(100) UNIQUE NOT NULL, version integer NOT NULL DEFAULT 0, data jsonb NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS barber_login_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires timestamptz NOT NULL)`,
    ]).catch(e => {
      ready = null;
      throw e;
    });
  }
  await ready;
}
async function owner(req: any) {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) fail("Entre na sua conta.", 401);
  const sql = getSql();
  const rows =
    await sql`SELECT u.id,u.name,u."supportId", cs.plan,cs.status FROM local_sessions s JOIN users u ON u.id=s."userId" JOIN commercial_subscriptions cs ON cs."userId"=u.id WHERE s.token=${token} AND s."expiresAt">NOW() AND u."isActive"=true LIMIT 1`;
  const u = rows[0];
  if (
    !u ||
    u.plan !== "barber" ||
    !["active", "paid"].includes(String(u.status))
  )
    fail("Acesso exclusivo ao plano Barbearia ativo.", 403);
  return u;
}
function publicState(s: any) {
  return {
    name: s.name,
    open: s.open,
    close: s.close,
    days: s.days,
    barbers: s.barbers.filter((b: any) => b.active),
    products: s.products.filter((p: any) => p.active),
  };
}
export default async function handler(req: any, res: any) {
  try {
    if (!["GET", "POST"].includes(req.method))
      fail("Método não permitido.", 405);
    if (
      req.method === "POST" &&
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      fail("Origem inválida.", 403);
    await ensure();
    const sql = getSql();
    const slug = str(req.query?.shop, 100);
    const pub = Boolean(slug);
    const u = pub ? null : await owner(req);
    let rows = pub
      ? await sql`SELECT b.* FROM barber_shops b JOIN users u ON u.id=b.owner_id JOIN commercial_subscriptions c ON c."userId"=b.owner_id WHERE b.slug=${slug} AND u."isActive"=true AND c.plan='barber' AND c.status IN ('active','paid')`
      : await sql`SELECT * FROM barber_shops WHERE owner_id=${u!.id}`;
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const action = str(body.action);
    if (!rows.length) {
      if (pub) fail("Barbearia indisponível.", 404);
      if (action !== "profile")
        return sendJson(res, 200, { success: true, setup: true, user: u });
      const name = str(body.name);
      const newSlug = str(body.slug, 80).toLowerCase();
      if (name.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug))
        fail(
          "Informe o nome e um endereço usando letras minúsculas, números e hífens."
        );
      const state = {
        name,
        open: "09:00",
        close: "19:00",
        days: [1, 2, 3, 4, 5, 6],
        barbers: [],
        products: [],
        clients: [],
        appointments: [],
        payments: [],
        expenses: [],
        rates: { credit: 0, debit: 0 },
      };
      rows =
        await sql`INSERT INTO barber_shops(owner_id,slug,data) VALUES(${u!.id},${newSlug},${JSON.stringify(state)}::jsonb) RETURNING *`;
      return sendJson(res, 200, {
        success: true,
        shop: { ...rows[0], user: u },
      });
    }
    const row = rows[0];
    const state = row.data as any;
    const cookieName = `barber_${row.owner_id}`;
    const token = readCookie(req, cookieName);
    const customer = state.clients.find(
      (c: any) =>
        c.tokenHash &&
        c.tokenHash === hash(token || "") &&
        c.expires > Date.now()
    );
    if (req.method === "GET") {
      if (!pub)
        return sendJson(res, 200, {
          success: true,
          shop: {
            ...row,
            data: {
              ...state,
              clients: state.clients.map(
                ({ passwordHash, tokenHash, expires, ...c }: any) => c
              ),
            },
            user: u,
          },
        });
      const date = str(req.query.date);
      const barberId = str(req.query.barber);
      const product = state.products.find(
        (p: any) => p.id === str(req.query.product) && p.active
      );
      const slots = [];
      if (
        product &&
        state.barbers.some((b: any) => b.id === barberId && b.active)
      )
        for (
          let m = minutes(state.open);
          m + product.duration <= minutes(state.close);
          m += 15
        ) {
          const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          if (slotFree(state, barberId, date, time, product.duration))
            slots.push(time);
        }
      return sendJson(res, 200, {
        success: true,
        shop: publicState(state),
        slots,
        customer: customer ? { name: customer.name, id: customer.id } : null,
        appointments: customer
          ? state.appointments.filter((a: any) => a.clientId === customer.id)
          : [],
      });
    }
    const allowedPublic = ["register", "login", "book"];
    if (pub && !allowedPublic.includes(action))
      fail("Ação não permitida.", 403);
    if (action === "register" || action === "login") {
      const email = str(body.email).toLowerCase(),
        password = str(body.password, 128);
      const key = hash(`${row.owner_id}:${email}`);
      const limits =
        await sql`INSERT INTO barber_login_limits(key,attempts,expires) VALUES(${key},1,NOW()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN barber_login_limits.expires<NOW() THEN 1 ELSE barber_login_limits.attempts+1 END,expires=CASE WHEN barber_login_limits.expires<NOW() THEN NOW()+interval '15 minutes' ELSE barber_login_limits.expires END RETURNING attempts`;
      if (Number(limits[0].attempts) > 10)
        fail("Muitas tentativas. Aguarde 15 minutos.", 429);
      const existing = state.clients.find((c: any) => c.email === email);
      if (action === "register") {
        if (existing) fail("E-mail já cadastrado. Entre com sua senha.");
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          password.length < 8 ||
          str(body.name).length < 2 ||
          str(body.whatsapp).replace(/\D/g, "").length < 10
        )
          fail(
            "Preencha nome, e-mail, WhatsApp e senha de pelo menos 8 caracteres."
          );
      } else if (
        !existing?.passwordHash ||
        !(await bcrypt.compare(password, existing.passwordHash))
      )
        fail("E-mail ou senha inválidos.", 401);
      const c = existing || {
        id: id(),
        name: str(body.name),
        email,
        whatsapp: str(body.whatsapp),
        passwordHash: await bcrypt.hash(password, 12),
      };
      const newToken = crypto.randomBytes(32).toString("hex");
      c.tokenHash = hash(newToken);
      c.expires = Date.now() + 7 * 86400000;
      if (!existing) state.clients.push(c);
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${newToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );
    } else if (action === "profile") {
      const open = str(body.open),
        close = str(body.close);
      if (
        minutes(open) >= minutes(close) ||
        !Array.isArray(body.days) ||
        !body.days.length ||
        body.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        fail("Confira os dias e horários de funcionamento.");
      state.name = str(body.name) || state.name;
      state.open = open;
      state.close = close;
      state.days = body.days;
    } else if (action === "barber") {
      if (str(body.name).length < 2) fail("Informe o nome do barbeiro.");
      state.barbers.push({ id: id(), name: str(body.name), active: true });
    } else if (action === "product") {
      const duration = Number(body.duration);
      if (
        str(body.name).length < 2 ||
        !Number.isInteger(duration) ||
        duration < 5 ||
        duration > 480
      )
        fail("Informe nome e duração de 5 a 480 minutos.");
      state.products.push({
        id: id(),
        name: str(body.name),
        price: cents(body.price),
        duration,
        active: true,
      });
    } else if (action === "client") {
      if (
        str(body.name).length < 2 ||
        str(body.whatsapp).replace(/\D/g, "").length < 10
      )
        fail("Informe nome e WhatsApp.");
      state.clients.push({
        id: id(),
        name: str(body.name),
        email: str(body.email).toLowerCase(),
        whatsapp: str(body.whatsapp),
      });
    } else if (action === "book") {
      const c = pub
        ? customer
        : state.clients.find((c: any) => c.id === body.clientId);
      if (!c) fail("Cadastre-se ou entre antes de agendar.", 401);
      const p = state.products.find(
        (p: any) => p.id === body.productId && p.active
      );
      if (
        !p ||
        !state.barbers.some((b: any) => b.id === body.barberId && b.active)
      )
        fail("Escolha um serviço e um barbeiro.");
      if (
        !slotFree(
          state,
          body.barberId,
          str(body.date),
          str(body.time),
          p.duration
        )
      )
        fail("Horário indisponível. Escolha outro horário.", 409);
      state.appointments.push({
        id: id(),
        clientId: c.id,
        barberId: body.barberId,
        productId: p.id,
        productName: p.name,
        price: p.price,
        duration: p.duration,
        date: str(body.date),
        time: str(body.time),
        status: "agendado",
      });
    } else if (action === "cancel") {
      const a = state.appointments.find((a: any) => a.id === body.id);
      if (!a || state.payments.some((p: any) => p.appointmentId === a.id))
        fail("Reserva não encontrada ou já paga.");
      a.status = "cancelado";
    } else if (action === "rates") {
      for (const key of ["credit", "debit"]) {
        const n = Number(body[key]);
        if (!Number.isFinite(n) || n < 0 || n > 100)
          fail("Taxa deve estar entre 0 e 100%.");
        state.rates[key] = n;
      }
    } else if (action === "pay") {
      const a = state.appointments.find(
        (a: any) => a.id === body.id && a.status !== "cancelado"
      );
      if (!a || state.payments.some((p: any) => p.appointmentId === a.id))
        fail("Reserva inválida ou pagamento já registrado.", 409);
      const method = str(body.method);
      if (!["cash", "pix", "credit", "debit"].includes(method))
        fail("Forma de pagamento inválida.");
      const rate = state.rates[method] || 0;
      const fee = Math.round((a.price * rate) / 100);
      state.payments.push({
        id: id(),
        appointmentId: a.id,
        clientId: a.clientId,
        amount: a.price,
        fee,
        net: a.price - fee,
        rate,
        method,
        date: new Date().toISOString(),
      });
      a.status = "concluido";
    } else if (action === "expense") {
      if (!str(body.description) || cents(body.amount) <= 0)
        fail("Informe descrição e valor da saída.");
      state.expenses.push({
        id: id(),
        description: str(body.description),
        amount: cents(body.amount),
        date: new Date().toISOString(),
      });
    } else fail("Ação inválida.");
    const updated =
      await sql`UPDATE barber_shops SET data=${JSON.stringify(state)}::jsonb,version=version+1 WHERE owner_id=${row.owner_id} AND version=${row.version} RETURNING version`;
    if (!updated.length)
      fail(
        "A agenda mudou enquanto você salvava. Atualize e tente novamente.",
        409
      );
    return sendJson(res, 200, { success: true });
  } catch (e: any) {
    return sendJson(res, e.statusCode || (e.code === "23505" ? 409 : 500), {
      success: false,
      message:
        e.code === "23505"
          ? "Este endereço já está em uso."
          : e.statusCode
            ? e.message
            : "Não foi possível salvar. Tente novamente.",
    });
  }
}
