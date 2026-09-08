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
  const barber = state.barbers?.find((b: any) => b.id === barberId);
  const workingDays = barber?.days?.length ? barber.days : state.days;
  const openingTime = barber?.open || state.open;
  const closingTime = barber?.close || state.close;
  if (
    Number.isNaN(day.getTime()) ||
    !workingDays.includes(day.getUTCDay())
  )
    return false;
  const start = minutes(time),
    end = start + duration;
  if (
    start < minutes(openingTime) ||
    end > minutes(closingTime) ||
    new Date(`${date}T${time}:00-03:00`).getTime() <= Date.now()
  )
    return false;
  if (
    barber?.breakStart &&
    barber?.breakEnd &&
    start < minutes(barber.breakEnd) &&
    end > minutes(barber.breakStart)
  )
    return false;
  if (
    (state.blocks || []).some(
      (block: any) =>
        block.barberId === barberId &&
        block.date === date &&
        start < minutes(block.end) &&
        end > minutes(block.start)
    )
  )
    return false;
  return !state.appointments.some((a: any) => {
    const appointmentDuration = Number(a.duration) || (a.productIds || [a.productId])
      .map((productId: string) => state.products?.find((p: any) => p.id === productId))
      .reduce((total: number, product: any) => total + Number(product?.duration || 0), 0) || 30;
    return (
      a.barberId === barberId &&
      a.date === date &&
      a.status !== "cancelado" &&
      start < minutes(a.time) + appointmentDuration &&
      end > minutes(a.time)
    );
  });
}
function expenseDueOn(schedule: any, date: string) {
  if (!schedule?.active || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.startDate)) return false;
  const target = new Date(`${date}T12:00:00Z`);
  const start = new Date(`${schedule.startDate}T12:00:00Z`);
  if (target < start) return false;
  if (schedule.frequency === "once") return date === schedule.startDate;
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const expectedDay = Math.min(start.getUTCDate(), lastDay);
  if (schedule.frequency === "monthly") return target.getUTCDate() === expectedDay;
  if (schedule.frequency === "yearly") {
    return target.getUTCMonth() === start.getUTCMonth() && target.getUTCDate() === expectedDay;
  }
  return false;
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
async function owner(req: any): Promise<any> {
  const token = readCookie(req, SESSION_COOKIE_NAME);
  if (!token) fail("Entre na sua conta.", 401);
  const sql = getSql();
  const rows =
    await sql`SELECT u.id,u.name,u."supportId",u.role,u."loginMethod",u."accountOwnerId",parent_u.role AS "ownerRole",COALESCE(cs.plan,parent_cs.plan) AS plan,COALESCE(cs.status,parent_cs.status) AS status,COALESCE(cs."priceCents",parent_cs."priceCents") AS "priceCents",COALESCE(cs."billingMethod",parent_cs."billingMethod") AS "billingMethod" FROM local_sessions s JOIN users u ON u.id=s."userId" LEFT JOIN users parent_u ON parent_u.id=u."accountOwnerId" LEFT JOIN commercial_subscriptions cs ON cs."userId"=u.id LEFT JOIN commercial_subscriptions parent_cs ON parent_cs."userId"=u."accountOwnerId" WHERE s.token=${token} AND s."expiresAt">NOW() AND u."isActive"=true LIMIT 1`;
  const u = rows[0];
  const isSuperAdmin = u?.role === "super_admin";
  if (
    !u ||
    (!isSuperAdmin &&
      u.ownerRole !== "super_admin" &&
      (u.plan !== "barber" ||
        !["active", "paid"].includes(String(u.status))))
  )
    fail("Acesso exclusivo ao plano Barbearia ativo.", 403);
  return {
    ...u,
    shopOwnerId:
      u.loginMethod === "commercial_subuser" && Number(u.accountOwnerId) > 0
        ? Number(u.accountOwnerId)
        : Number(u.id),
  };
}
function publicState(s: any) {
  return {
    name: s.name,
    open: s.open,
    close: s.close,
    days: s.days,
    barbers: s.barbers.filter((b: any) => b.active),
    products: s.products.filter((p: any) => p.active),
    branding: s.branding || {},
  };
}
export async function handleBarbershop(req: any, res: any) {
  let createdBarberUserId: number | null = null;
  let barberUserToDeactivate: number | null = null;
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
    const shopOwnerId = pub ? null : Number(u!.shopOwnerId);
    let rows = pub
      ? await sql`SELECT b.* FROM barber_shops b JOIN users u ON u.id=b.owner_id LEFT JOIN commercial_subscriptions c ON c."userId"=b.owner_id WHERE b.slug=${slug} AND u."isActive"=true AND (u.role='super_admin' OR (c.plan='barber' AND c.status IN ('active','paid')))`
      : await sql`SELECT * FROM barber_shops WHERE owner_id=${shopOwnerId}`;
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
        expenseSchedules: [],
        blocks: [],
        rates: { credit: 0, debit: 0 },
      };
      rows =
        await sql`INSERT INTO barber_shops(owner_id,slug,data) VALUES(${shopOwnerId},${newSlug},${JSON.stringify(state)}::jsonb) RETURNING *`;
      return sendJson(res, 200, {
        success: true,
        shop: { ...rows[0], user: u },
      });
    }
    const row = rows[0];
    const state = row.data as any;
    const currentBarber =
      !pub && u!.loginMethod === "commercial_subuser"
          ? state.barbers.find(
            (barber: any) =>
              barber.active && Number(barber.userId) === Number(u!.id)
          )
        : null;
    const isBarberUser = Boolean(currentBarber);
    if (!pub && u!.loginMethod === "commercial_subuser" && !currentBarber)
      fail("Este usuário não está vinculado a um barbeiro ativo.", 403);
    const cookieName = `barber_${row.owner_id}`;
    const token = readCookie(req, cookieName);
    const customer = state.clients.find(
      (c: any) =>
        c.tokenHash &&
        c.tokenHash === hash(token || "") &&
        c.expires > Date.now()
    );
    if (req.method === "GET") {
      if (!pub) {
        const visibleAppointments = isBarberUser
          ? state.appointments.filter(
              (appointment: any) => appointment.barberId === currentBarber.id
            )
          : state.appointments;
        const visibleClientIds = new Set(
          visibleAppointments.map((appointment: any) => appointment.clientId)
        );
        const visibleClients = isBarberUser
          ? state.clients.filter(
              (client: any) =>
                visibleClientIds.has(client.id) ||
                client.createdByBarberId === currentBarber.id
            )
          : state.clients;
        const visiblePayments = isBarberUser
          ? state.payments.filter(
              (payment: any) =>
                payment.barberId === currentBarber.id ||
                visibleAppointments.some(
                  (appointment: any) =>
                    appointment.id === payment.appointmentId
                )
            )
          : state.payments;
        return sendJson(res, 200, {
          success: true,
          access: {
            role: isBarberUser ? "barber" : "owner",
            barberId: currentBarber?.id || null,
            canCorrectPayments: !isBarberUser,
          },
          shop: {
            ...row,
            data: {
              ...state,
              barbers: isBarberUser ? [currentBarber] : state.barbers,
              appointments: visibleAppointments,
              payments: visiblePayments,
              expenses: isBarberUser ? [] : state.expenses,
              expenseSchedules: isBarberUser ? [] : (state.expenseSchedules || []),
              blocks: isBarberUser
                ? (state.blocks || []).filter(
                    (block: any) => block.barberId === currentBarber.id
                  )
                : state.blocks,
              clients: visibleClients.map(
                ({ passwordHash, tokenHash, expires, ...c }: any) => c
              ),
            },
            user: u,
          },
        });
      }
      const date = str(req.query.date);
      const barberId = str(req.query.barber);
      const requestedProductIds = str(
        req.query.products || req.query.product,
        1200
      )
        .split(",")
        .filter(Boolean);
      const selectedProducts = state.products.filter(
        (p: any) =>
          requestedProductIds.includes(p.id) &&
          p.active &&
          (p.itemType || "service") === "service"
      );
      const totalDuration = selectedProducts.reduce(
        (total: number, p: any) => total + Number(p.duration || 0),
        0
      );
      const slots = [];
      if (
        selectedProducts.length > 0 &&
        state.barbers.some((b: any) => b.id === barberId && b.active)
      )
        for (
          let m = minutes(state.open);
          m + totalDuration <= minutes(state.close);
          m += 15
        ) {
          const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          if (slotFree(state, barberId, date, time, totalDuration))
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
    const allowedPublic = ["register", "login", "book", "orderProduct"];
    if (pub && !allowedPublic.includes(action))
      fail("Ação não permitida.", 403);
    if (!pub && isBarberUser) {
      const allowedBarberActions = [
        "client",
        "updateClient",
        "deleteClient",
        "book",
        "updateAppointment",
        "deleteAppointment",
        "orderProduct",
        "removeProduct",
        "confirm",
        "checkin",
        "pay",
      ];
      if (!allowedBarberActions.includes(action))
        fail("Esta função é exclusiva do dono da barbearia.", 403);
      if (action === "book" && body.barberId !== currentBarber.id)
        fail("Você só pode agendar clientes na sua própria agenda.", 403);
      const appointmentId = ["orderProduct", "removeProduct"].includes(action)
        ? body.appointmentId
        : ["confirm", "checkin", "pay", "updateAppointment", "deleteAppointment"].includes(action)
          ? body.id
          : null;
      if (
        appointmentId &&
        !state.appointments.some(
          (appointment: any) =>
            appointment.id === appointmentId &&
            appointment.barberId === currentBarber.id
        )
      )
        fail("Você só pode alterar atendimentos da sua própria agenda.", 403);
      if (["updateClient", "deleteClient"].includes(action)) {
        const client = state.clients.find((item: any) => item.id === body.id);
        if (!client || client.createdByBarberId !== currentBarber.id)
          fail("Você só pode alterar clientes cadastrados por você.", 403);
      }
    }
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
      const color = (value: unknown, fallback: string) => {
        const parsed = str(value, 7);
        return /^#[0-9a-f]{6}$/i.test(parsed) ? parsed : fallback;
      };
      const logo = str(body.logo, 1500000);
      if (logo && !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo))
        fail("Envie uma logo PNG, JPG ou WebP válida.");
      state.branding = {
        primaryColor: color(body.primaryColor, state.branding?.primaryColor || "#2563eb"),
        accentColor: color(body.accentColor, state.branding?.accentColor || "#4f46e5"),
        backgroundColor: color(body.backgroundColor, state.branding?.backgroundColor || "#f8fafc"),
        logo: logo || (body.removeLogo ? "" : state.branding?.logo || ""),
      };
    } else if (action === "barber") {
      if (str(body.name).length < 2) fail("Informe o nome do barbeiro.");
      const subscriptionPrice = Number(u.priceCents || 0);
      const barberLimit = [2590, 21756].includes(subscriptionPrice) ? 8 : 3;
      if (state.barbers.filter((barber: any) => barber.active).length >= barberLimit)
        fail(`Seu plano permite cadastrar até ${barberLimit} barbeiros.`, 403);
      const username = str(body.username, 40).toLowerCase();
      const password = String(body.password || "");
      if (!/^[a-z0-9._-]{3,40}$/.test(username))
        fail("O usuário deve ter de 3 a 40 caracteres e usar letras, números, ponto, hífen ou sublinhado.");
      if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password))
        fail("A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.");
      const existingUser = await sql`SELECT id FROM users WHERE lower(username)=lower(${username}) LIMIT 1`;
      if (existingUser.length) fail("Este nome de usuário já está em uso.", 409);
      const commissionType = body.commissionType === "fixed" ? "fixed" : body.commissionType === "percent" ? "percent" : "none";
      const commissionValue =
        commissionType === "fixed" ? cents(body.commissionValue || 0) : Number(body.commissionValue || 0);
      if (commissionType === "percent" && (!Number.isFinite(commissionValue) || commissionValue < 0 || commissionValue > 100))
        fail("A comissão percentual deve estar entre 0 e 100%.");
      const days = Array.isArray(body.days) && body.days.length ? body.days.map(Number) : state.days;
      const open = str(body.open) || state.open;
      const close = str(body.close) || state.close;
      if (minutes(open) >= minutes(close)) fail("Confira o horário do barbeiro.");
      const passwordHash = await bcrypt.hash(password, 12);
      const createdUser = await sql`
        INSERT INTO users (
          username,"passwordHash",name,email,"loginMethod","accountOwnerId",role,
          "canView","canInsert","canEdit","canDelete","canGenerateReports",
          "canAccessSettings","dashboardOnly","canManageUsers","canManageDatabases",
          "canDeleteCashFlow","failedLoginAttempts","isActive","emailVerified",
          "createdAt","updatedAt","lastSignedIn"
        ) VALUES (
          ${username},${passwordHash},${str(body.name)},${null},'commercial_subuser',${shopOwnerId},'user',
          false,false,false,false,false,false,false,false,false,false,0,true,true,NOW(),NOW(),NOW()
        ) RETURNING id
      `;
      createdBarberUserId = Number(createdUser[0].id);
      state.barbers.push({
        id: id(),
        userId: createdBarberUserId,
        username,
        name: str(body.name),
        active: true,
        commissionType,
        commissionValue,
        days,
        open,
        close,
        breakStart: str(body.breakStart) || null,
        breakEnd: str(body.breakEnd) || null,
      });
    } else if (action === "updateBarber") {
      const professional = state.barbers.find((b: any) => b.id === body.id);
      if (!professional) fail("Barbeiro não encontrado.", 404);
      const commissionType = body.commissionType === "fixed" ? "fixed" : body.commissionType === "percent" ? "percent" : "none";
      const commissionValue = commissionType === "fixed" ? cents(body.commissionValue || 0) : Number(body.commissionValue || 0);
      if (commissionType === "percent" && (!Number.isFinite(commissionValue) || commissionValue < 0 || commissionValue > 100))
        fail("A comissão percentual deve estar entre 0 e 100%.");
      const days = Array.isArray(body.days) && body.days.length ? body.days.map(Number) : state.days;
      const open = str(body.open) || state.open;
      const close = str(body.close) || state.close;
      if (minutes(open) >= minutes(close)) fail("Confira o horário do barbeiro.");
      Object.assign(professional, {
        name: str(body.name) || professional.name,
        commissionType,
        commissionValue,
        days,
        open,
        close,
        breakStart: str(body.breakStart) || null,
        breakEnd: str(body.breakEnd) || null,
      });
      if (professional.userId)
        await sql`UPDATE users SET name=${professional.name},"updatedAt"=NOW() WHERE id=${Number(professional.userId)} AND "accountOwnerId"=${shopOwnerId}`;
    } else if (action === "deleteBarber") {
      const professional = state.barbers.find((b: any) => b.id === body.id);
      if (!professional) fail("Barbeiro não encontrado.", 404);
      if (state.appointments.some((appointment: any) => appointment.barberId === professional.id))
        fail("Exclua os agendamentos vinculados antes de excluir este barbeiro.", 409);
      state.blocks = (state.blocks || []).filter((block: any) => block.barberId !== professional.id);
      state.barbers = state.barbers.filter((b: any) => b.id !== professional.id);
      barberUserToDeactivate = Number(professional.userId) || null;
    } else if (action === "block") {
      const start = str(body.start), end = str(body.end), blockDate = str(body.date);
      if (!state.barbers.some((b: any) => b.id === body.barberId) || !/^\d{4}-\d{2}-\d{2}$/.test(blockDate) || minutes(start) >= minutes(end))
        fail("Confira o barbeiro, a data e o período do bloqueio.");
      state.blocks ||= [];
      state.blocks.push({ id: id(), barberId: body.barberId, date: blockDate, start, end, reason: str(body.reason) || "Horário indisponível" });
    } else if (action === "unblock") {
      state.blocks ||= [];
      state.blocks = state.blocks.filter((block: any) => block.id !== body.id);
    } else if (action === "product") {
      const itemType = body.itemType === "convenience" ? "convenience" : "service";
      const duration = itemType === "convenience" ? 0 : Number(body.duration);
      if (
        str(body.name).length < 2 ||
        (itemType === "service" &&
          (!Number.isInteger(duration) || duration < 5 || duration > 480))
      )
        fail("Informe o nome e, para serviços, uma duração de 5 a 480 minutos.");
      state.products.push({
        id: id(),
        name: str(body.name),
        price: cents(body.price),
        duration,
        itemType,
        active: true,
      });
    } else if (action === "updateProduct") {
      const product = state.products.find((item: any) => item.id === body.id);
      if (!product) fail("Produto ou serviço não encontrado.", 404);
      const itemType = body.itemType === "convenience" ? "convenience" : "service";
      const duration = itemType === "convenience" ? 0 : Number(body.duration);
      if (str(body.name).length < 2 || (itemType === "service" && (!Number.isInteger(duration) || duration < 5 || duration > 480)))
        fail("Informe o nome e, para serviços, uma duração de 5 a 480 minutos.");
      Object.assign(product, { name: str(body.name), price: cents(body.price), duration, itemType });
    } else if (action === "deleteProduct") {
      const product = state.products.find((item: any) => item.id === body.id);
      if (!product) fail("Produto ou serviço não encontrado.", 404);
      state.products = state.products.filter((item: any) => item.id !== product.id);
    } else if (action === "client") {
      const clientEmail = str(body.email).toLowerCase();
      if (
        str(body.name).length < 2 ||
        str(body.whatsapp).replace(/\D/g, "").length < 10 ||
        (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail))
      )
        fail(
          clientEmail
            ? "Informe um e-mail válido ou deixe o campo vazio."
            : "Informe nome e WhatsApp."
        );
      state.clients.push({
        id: id(),
        name: str(body.name),
        email: clientEmail,
        whatsapp: str(body.whatsapp),
        createdByBarberId: isBarberUser ? currentBarber.id : null,
      });
    } else if (action === "updateClient") {
      const client = state.clients.find((item: any) => item.id === body.id);
      const email = str(body.email).toLowerCase();
      if (!client) fail("Cliente não encontrado.", 404);
      if (str(body.name).length < 2 || str(body.whatsapp).replace(/\D/g, "").length < 10 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        fail("Informe nome, WhatsApp e, se preenchido, um e-mail válido.");
      Object.assign(client, { name: str(body.name), email, whatsapp: str(body.whatsapp) });
    } else if (action === "deleteClient") {
      const client = state.clients.find((item: any) => item.id === body.id);
      if (!client) fail("Cliente não encontrado.", 404);
      if (state.appointments.some((appointment: any) => appointment.clientId === client.id))
        fail("Exclua os agendamentos vinculados antes de excluir este cliente.", 409);
      state.clients = state.clients.filter((item: any) => item.id !== client.id);
    } else if (action === "book") {
      const c = pub
        ? customer
        : state.clients.find((c: any) => c.id === body.clientId);
      if (!c) fail("Cadastre-se ou entre antes de agendar.", 401);
      const requestedProductIds = Array.isArray(body.productIds)
        ? Array.from(
            new Set<string>(
              body.productIds.map((value: unknown) => str(value))
            )
          )
        : [str(body.productId)].filter(Boolean);
      const selectedProducts = state.products.filter(
        (p: any) =>
          requestedProductIds.includes(p.id) &&
          p.active &&
          (p.itemType || "service") === "service"
      );
      const selectedServices = selectedProducts.filter(
        (p: any) => (p.itemType || "service") === "service"
      );
      if (
        !selectedProducts.length ||
        selectedProducts.length !== requestedProductIds.length ||
        !selectedServices.length ||
        !state.barbers.some((b: any) => b.id === body.barberId && b.active)
      )
        fail("Escolha pelo menos um serviço e um barbeiro. Produtos de conveniência ficam disponíveis somente na comanda.");
      const totalDuration = selectedProducts.reduce(
        (total: number, p: any) => total + Number(p.duration || 0),
        0
      );
      const totalPrice = selectedProducts.reduce(
        (total: number, p: any) => total + Number(p.price || 0),
        0
      );
      const servicePrice = selectedServices.reduce(
        (total: number, p: any) => total + Number(p.price || 0),
        0
      );
      const convenienceItems = selectedProducts
        .filter((p: any) => p.itemType === "convenience")
        .map((p: any) => ({ productId: p.id, name: p.name, quantity: 1, unitPrice: p.price }));
      if (
        !slotFree(
          state,
          body.barberId,
          str(body.date),
          str(body.time),
          totalDuration
        )
      )
        fail("Horário indisponível. Escolha outro horário.", 409);
      state.appointments.push({
        id: id(),
        clientId: c.id,
        barberId: body.barberId,
        productId: selectedProducts[0].id,
        productIds: selectedProducts.map((p: any) => p.id),
        productName: selectedServices.map((p: any) => p.name).join(" + "),
        convenienceItems,
        price: totalPrice,
        servicePrice,
        duration: totalDuration,
        date: str(body.date),
        time: str(body.time),
        status: "agendado",
      });
    } else if (action === "updateAppointment") {
      const appointment = state.appointments.find((item: any) => item.id === body.id);
      if (!appointment) fail("Agendamento não encontrado.", 404);
      if (state.payments.some((payment: any) => payment.appointmentId === appointment.id))
        fail("Agendamentos pagos não podem ser alterados.", 409);
      const clientId = str(body.clientId) || appointment.clientId;
      const barberId = isBarberUser ? currentBarber.id : str(body.barberId) || appointment.barberId;
      const appointmentDate = str(body.date) || appointment.date;
      const appointmentTime = str(body.time) || appointment.time;
      if (!state.clients.some((client: any) => client.id === clientId) || !state.barbers.some((barber: any) => barber.id === barberId && barber.active))
        fail("Confira o cliente e o barbeiro.");
      const originalAppointments = state.appointments;
      state.appointments = originalAppointments.filter((item: any) => item.id !== appointment.id);
      const available = slotFree(state, barberId, appointmentDate, appointmentTime, Number(appointment.duration) || 30);
      state.appointments = originalAppointments;
      if (!available) fail("O novo horário está indisponível.", 409);
      Object.assign(appointment, { clientId, barberId, date: appointmentDate, time: appointmentTime });
    } else if (action === "deleteAppointment") {
      const appointment = state.appointments.find((item: any) => item.id === body.id);
      if (!appointment) fail("Agendamento não encontrado.", 404);
      if (state.payments.some((payment: any) => payment.appointmentId === appointment.id))
        fail("Agendamentos pagos não podem ser excluídos.", 409);
      state.appointments = state.appointments.filter((item: any) => item.id !== appointment.id);
    } else if (action === "orderProduct") {
      if (pub && !customer) fail("Entre na sua conta para usar a comanda.", 401);
      const appointment = state.appointments.find(
        (a: any) =>
          a.id === body.appointmentId && (!pub || a.clientId === customer.id)
      );
      const product = state.products.find(
        (p: any) => p.id === body.productId && p.active && p.itemType === "convenience"
      );
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
      if (
        !appointment ||
        appointment.date !== localDate ||
        !["confirmado", "check-in"].includes(appointment.status) ||
        state.payments.some((p: any) => p.appointmentId === appointment.id)
      )
        fail("A comanda fica disponível no dia do atendimento, após a confirmação ou o check-in.", 409);
      if (!product) fail("Produto de conveniência indisponível.", 404);
      appointment.convenienceItems ||= [];
      const ordered = appointment.convenienceItems.find(
        (item: any) => item.productId === product.id
      );
      if (ordered) {
        if (Number(ordered.quantity || 0) >= 20)
          fail("Limite de 20 unidades por produto atingido.", 409);
        ordered.quantity = Number(ordered.quantity || 0) + 1;
      } else {
        appointment.convenienceItems.push({
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
        });
      }
      appointment.price = Number(appointment.price || 0) + Number(product.price || 0);
    } else if (action === "removeProduct") {
      if (pub) fail("Ação disponível somente para a barbearia.", 403);
      const appointment = state.appointments.find((a: any) => a.id === body.appointmentId);
      const ordered = appointment?.convenienceItems?.find(
        (item: any) => item.productId === body.productId
      );
      if (
        !appointment ||
        !ordered ||
        Number(ordered.quantity || 0) < 1 ||
        state.payments.some((p: any) => p.appointmentId === appointment.id)
      )
        fail("Item não encontrado ou comanda já paga.", 409);
      ordered.quantity = Number(ordered.quantity) - 1;
      appointment.price = Math.max(
        Number(appointment.servicePrice || 0),
        Number(appointment.price || 0) - Number(ordered.unitPrice || 0)
      );
      if (ordered.quantity === 0)
        appointment.convenienceItems = appointment.convenienceItems.filter(
          (item: any) => item.productId !== body.productId
        );
    } else if (action === "confirm") {
      const a = state.appointments.find((a: any) => a.id === body.id);
      if (!a || a.status !== "agendado")
        fail("Somente agendamentos pendentes podem ser confirmados.", 409);
      a.status = "confirmado";
      a.confirmedAt = new Date().toISOString();
    } else if (action === "checkin") {
      const a = state.appointments.find((a: any) => a.id === body.id);
      if (!a || !["agendado", "confirmado"].includes(a.status))
        fail("Este cliente não pode fazer check-in agora.", 409);
      a.status = "check-in";
      a.checkedInAt = new Date().toISOString();
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
      const professional = state.barbers.find((b: any) => b.id === a.barberId);
      const convenienceTotal = (a.convenienceItems || []).reduce(
        (total: number, item: any) => total + Number(item.unitPrice || 0) * Number(item.quantity || 0),
        0
      );
      const commissionBase = Number.isFinite(Number(a.servicePrice))
        ? Number(a.servicePrice)
        : Math.max(0, Number(a.price || 0) - convenienceTotal);
      const commission = professional?.commissionType === "fixed"
        ? Math.min(commissionBase, Number(professional.commissionValue || 0))
        : Math.round((commissionBase * Number(professional?.commissionValue || 0)) / 100);
      state.payments.push({
        id: id(),
        appointmentId: a.id,
        clientId: a.clientId,
        amount: a.price,
        fee,
        net: a.price - fee,
        businessNet: a.price - fee - commission,
        commission,
        barberId: a.barberId,
        rate,
        method,
        date: new Date().toISOString(),
      });
      a.status = "concluido";
    } else if (action === "expenseSchedule") {
      const frequency = ["once", "monthly", "yearly"].includes(body.frequency) ? body.frequency : "once";
      const startDate = str(body.startDate);
      if (!str(body.description) || cents(body.amount) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
        fail("Informe descrição, valor, frequência e primeiro vencimento.");
      state.expenseSchedules ||= [];
      state.expenseSchedules.push({ id: id(), description: str(body.description), amount: cents(body.amount), frequency, startDate, active: true });
    } else if (action === "deleteExpenseSchedule") {
      state.expenseSchedules ||= [];
      const schedule = state.expenseSchedules.find((item: any) => item.id === body.id);
      if (!schedule) fail("Despesa não encontrada.", 404);
      schedule.active = false;
    } else if (action === "payExpense") {
      state.expenseSchedules ||= [];
      const schedule = state.expenseSchedules.find((item: any) => item.id === body.id);
      const occurrenceDate = str(body.occurrenceDate);
      if (!schedule || !expenseDueOn(schedule, occurrenceDate)) fail("Este vencimento não está disponível para pagamento.", 409);
      const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      if (occurrenceDate > currentDate) fail("A despesa só pode ser autorizada no vencimento.", 409);
      if (state.expenses.some((item: any) => item.scheduleId === schedule.id && item.occurrenceDate === occurrenceDate))
        fail("Esta despesa já foi paga.", 409);
      state.expenses.push({ id: id(), scheduleId: schedule.id, occurrenceDate, description: schedule.description, amount: schedule.amount, date: `${occurrenceDate}T12:00:00-03:00` });
      if (schedule.frequency === "once") schedule.active = false;
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
    if (barberUserToDeactivate)
      await sql`UPDATE users SET "isActive"=false,"updatedAt"=NOW() WHERE id=${barberUserToDeactivate} AND "accountOwnerId"=${shopOwnerId}`;
    return sendJson(res, 200, { success: true });
  } catch (e: any) {
    if (createdBarberUserId) {
      try {
        const sql = getSql();
        await sql`DELETE FROM users WHERE id=${createdBarberUserId} AND "loginMethod"='commercial_subuser'`;
      } catch {}
    }
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

export default handleBarbershop;
