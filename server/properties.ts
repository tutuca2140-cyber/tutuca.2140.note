import { getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME } from "../api/auth/_shared.js";

type SessionUser = {
  id:number; username?:string; email?:string; role:string; isActive:boolean;
  canView:boolean; canInsert:boolean; canEdit:boolean; canDelete:boolean;
};

let ensurePromise:Promise<void>|null=null;
function ensureTables(){
  if(ensurePromise)return ensurePromise;
  const sql=getSql();
  ensurePromise=(async()=>{
    await sql`CREATE TABLE IF NOT EXISTS properties (
      id bigserial PRIMARY KEY,
      "databaseId" integer NOT NULL,
      title varchar(255) NOT NULL,
      type varchar(40) NOT NULL,
      address text NOT NULL,
      neighborhood varchar(120), city varchar(120), state varchar(2), "zipCode" varchar(12),
      "areaM2" numeric(12,2), rooms integer DEFAULT 0 NOT NULL, bedrooms integer DEFAULT 0 NOT NULL,
      "livingRooms" integer DEFAULT 0 NOT NULL, kitchens integer DEFAULT 0 NOT NULL, bathrooms integer DEFAULT 0 NOT NULL,
      garages integer DEFAULT 0 NOT NULL, "hasGarage" boolean DEFAULT false NOT NULL,
      "salePrice" numeric(15,2), status varchar(40) DEFAULT 'disponivel' NOT NULL,
      notes text, "createdBy" integer NOT NULL, "createdAt" timestamptz DEFAULT NOW() NOT NULL,
      "updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS properties_database_idx ON properties("databaseId")`;
    await sql`CREATE TABLE IF NOT EXISTS property_rentals (
      id bigserial PRIMARY KEY,
      "databaseId" integer NOT NULL,
      "propertyId" bigint NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      "clientId" integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      "monthlyRent" numeric(15,2) NOT NULL,
      "dueDay" integer NOT NULL,
      "startDate" date NOT NULL,
      "endDate" date,
      status varchar(30) DEFAULT 'ativo' NOT NULL,
      notes text,
      "createdBy" integer NOT NULL,
      "createdAt" timestamptz DEFAULT NOW() NOT NULL,
      "updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS property_rentals_database_idx ON property_rentals("databaseId")`;
    await sql`CREATE TABLE IF NOT EXISTS property_rental_payments (
      id bigserial PRIMARY KEY,
      "databaseId" integer NOT NULL,
      "rentalId" bigint NOT NULL REFERENCES property_rentals(id) ON DELETE CASCADE,
      "referenceMonth" varchar(7) NOT NULL,
      amount numeric(15,2) NOT NULL,
      "dueDate" date NOT NULL,
      "paymentDate" timestamptz,
      status varchar(30) DEFAULT 'pendente' NOT NULL,
      "cashFlowId" integer,
      "createdBy" integer NOT NULL,
      "createdAt" timestamptz DEFAULT NOW() NOT NULL,
      UNIQUE("rentalId","referenceMonth")
    )`;
    await sql`CREATE TABLE IF NOT EXISTS property_financings (
      id bigserial PRIMARY KEY,
      "databaseId" integer NOT NULL,
      "propertyId" bigint NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      "clientId" integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      "salePrice" numeric(15,2) NOT NULL,
      "downPayment" numeric(15,2) DEFAULT 0 NOT NULL,
      "interestRate" numeric(8,4) DEFAULT 0 NOT NULL,
      installments integer NOT NULL,
      "installmentAmount" numeric(15,2) NOT NULL,
      "totalAmount" numeric(15,2) NOT NULL,
      "startDate" date NOT NULL,
      status varchar(30) DEFAULT 'ativo' NOT NULL,
      notes text,
      "createdBy" integer NOT NULL,
      "createdAt" timestamptz DEFAULT NOW() NOT NULL,
      "updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS property_financings_database_idx ON property_financings("databaseId")`;
  })().catch(e=>{ensurePromise=null;throw e});
  return ensurePromise;
}

async function getUser(req:any):Promise<SessionUser|null>{
  const token=readCookie(req,SESSION_COOKIE_NAME); if(!token)return null;
  const sql=getSql();
  const rows=await sql`SELECT u.id,u.username,u.email,u.role,u."isActive",u."canView",u."canInsert",u."canEdit",u."canDelete"
    FROM local_sessions s JOIN users u ON u.id=s."userId"
    WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;
  const u=rows[0] as any; return u?.isActive?u:null;
}

async function activeDatabase(user:SessionUser){
  const sql=getSql();
  if(user.role!=="super_admin"){
    const active=await sql`SELECT d.id,d.name FROM user_database_access a JOIN databases d ON d.id=a."databaseId"
      WHERE a."userId"=${user.id} AND a."isActive"=true LIMIT 1`;
    if(active[0])return active[0] as any;
    const fallback=await sql`SELECT d.id,d.name FROM user_database_access a JOIN databases d ON d.id=a."databaseId"
      WHERE a."userId"=${user.id} ORDER BY a.id LIMIT 1`;
    if(fallback[0])return fallback[0] as any;
    if(user.role!=="admin")return null;
  }
  const rows=await sql`SELECT id,name FROM databases WHERE "isActive"=true LIMIT 1`;
  return (rows[0] as any)||null;
}

const num=(v:any)=>Number(v);
const text=(v:any,max=2000)=>String(v??"").trim().slice(0,max);
function requirePerm(user:SessionUser,key:"canView"|"canInsert"|"canEdit"|"canDelete"){
  if(user.role==="super_admin"||user[key])return;
  throw Object.assign(new Error("Você não tem permissão para esta operação."),{statusCode:403});
}

async function listAll(databaseId:number){
  const sql=getSql();
  const [properties,rentals,financings,clients]=await Promise.all([
    sql`SELECT * FROM properties WHERE "databaseId"=${databaseId} ORDER BY "createdAt" DESC`,
    sql`SELECT r.*,p.title AS "propertyTitle",p.address AS "propertyAddress",c.name AS "clientName",c.phone AS "clientPhone",c.whatsapp AS "clientWhatsapp"
      FROM property_rentals r JOIN properties p ON p.id=r."propertyId" JOIN clients c ON c.id=r."clientId"
      WHERE r."databaseId"=${databaseId} ORDER BY r."createdAt" DESC`,
    sql`SELECT f.*,p.title AS "propertyTitle",c.name AS "clientName" FROM property_financings f
      JOIN properties p ON p.id=f."propertyId" JOIN clients c ON c.id=f."clientId"
      WHERE f."databaseId"=${databaseId} ORDER BY f."createdAt" DESC`,
    sql`SELECT id,name,phone,whatsapp,email FROM clients WHERE "databaseId"=${databaseId} ORDER BY name`
  ]);
  const payments=await sql`SELECT rp.*,r."propertyId",r."clientId" FROM property_rental_payments rp
    JOIN property_rentals r ON r.id=rp."rentalId" WHERE rp."databaseId"=${databaseId} ORDER BY rp."dueDate" DESC`;
  const today=new Date(); const ym=today.toISOString().slice(0,7);
  return {properties,rentals,financings,clients,payments,currentMonth:ym};
}

export async function handleProperties(req:any,res:any){
  try{
    const user=await getUser(req); if(!user)return sendJson(res,401,{success:false,message:"Sessão expirada."});
    const db=await activeDatabase(user); if(!db)return sendJson(res,400,{success:false,message:"Selecione um banco de dados para trabalhar."});
    await ensureTables();
    if(req.method==="GET"){
      requirePerm(user,"canView");
      return sendJson(res,200,{success:true,database:db,...await listAll(Number(db.id))});
    }
    if(req.method!=="POST")return sendJson(res,405,{success:false,message:"Método não permitido."});
    const body=await readJsonBody(req); const action=text(body?.action,60); const databaseId=Number(db.id); const sql=getSql();

    if(action==="create_property"){
      requirePerm(user,"canInsert");
      const title=text(body.title,255),type=text(body.type,40),address=text(body.address,1000);
      if(!title||!type||!address)return sendJson(res,400,{success:false,message:"Informe nome, tipo e endereço do imóvel."});
      const area=body.areaM2===""||body.areaM2==null?null:num(body.areaM2); const sale=body.salePrice===""||body.salePrice==null?null:num(body.salePrice);
      const garages=Math.max(0,Math.trunc(num(body.garages)||0));
      const rows=await sql`INSERT INTO properties ("databaseId",title,type,address,neighborhood,city,state,"zipCode","areaM2",rooms,bedrooms,"livingRooms",kitchens,bathrooms,garages,"hasGarage","salePrice",notes,"createdBy")
        VALUES (${databaseId},${title},${type},${address},${text(body.neighborhood,120)||null},${text(body.city,120)||null},${text(body.state,2).toUpperCase()||null},${text(body.zipCode,12)||null},${area},${Math.max(0,Math.trunc(num(body.rooms)||0))},${Math.max(0,Math.trunc(num(body.bedrooms)||0))},${Math.max(0,Math.trunc(num(body.livingRooms)||0))},${Math.max(0,Math.trunc(num(body.kitchens)||0))},${Math.max(0,Math.trunc(num(body.bathrooms)||0))},${garages},${Boolean(body.hasGarage)||garages>0},${sale},${text(body.notes,4000)||null},${user.id}) RETURNING *`;
      return sendJson(res,201,{success:true,property:rows[0]});
    }

    if(action==="update_property"){
      requirePerm(user,"canEdit"); const id=Math.trunc(num(body.id));
      const found=await sql`SELECT id FROM properties WHERE id=${id} AND "databaseId"=${databaseId} LIMIT 1`; if(!found[0])return sendJson(res,404,{success:false,message:"Imóvel não encontrado."});
      const garages=Math.max(0,Math.trunc(num(body.garages)||0));
      await sql`UPDATE properties SET title=${text(body.title,255)},type=${text(body.type,40)},address=${text(body.address,1000)},neighborhood=${text(body.neighborhood,120)||null},city=${text(body.city,120)||null},state=${text(body.state,2).toUpperCase()||null},"zipCode"=${text(body.zipCode,12)||null},"areaM2"=${body.areaM2===""||body.areaM2==null?null:num(body.areaM2)},rooms=${Math.max(0,Math.trunc(num(body.rooms)||0))},bedrooms=${Math.max(0,Math.trunc(num(body.bedrooms)||0))},"livingRooms"=${Math.max(0,Math.trunc(num(body.livingRooms)||0))},kitchens=${Math.max(0,Math.trunc(num(body.kitchens)||0))},bathrooms=${Math.max(0,Math.trunc(num(body.bathrooms)||0))},garages=${garages},"hasGarage"=${Boolean(body.hasGarage)||garages>0},"salePrice"=${body.salePrice===""||body.salePrice==null?null:num(body.salePrice)},notes=${text(body.notes,4000)||null},"updatedAt"=NOW() WHERE id=${id} AND "databaseId"=${databaseId}`;
      return sendJson(res,200,{success:true});
    }

    if(action==="delete_property"){
      requirePerm(user,"canDelete"); const id=Math.trunc(num(body.id));
      const linked=await sql`SELECT (SELECT COUNT(*) FROM property_rentals WHERE "propertyId"=${id} AND status='ativo')::int AS rentals,(SELECT COUNT(*) FROM property_financings WHERE "propertyId"=${id} AND status='ativo')::int AS financings`;
      if(Number((linked[0] as any)?.rentals)>0||Number((linked[0] as any)?.financings)>0)return sendJson(res,409,{success:false,message:"Encerre o aluguel ou financiamento ativo antes de excluir o imóvel."});
      await sql`DELETE FROM properties WHERE id=${id} AND "databaseId"=${databaseId}`; return sendJson(res,200,{success:true});
    }

    if(action==="create_rental"){
      requirePerm(user,"canInsert"); const propertyId=Math.trunc(num(body.propertyId)),clientId=Math.trunc(num(body.clientId)),monthlyRent=num(body.monthlyRent),dueDay=Math.trunc(num(body.dueDay)),startDate=text(body.startDate,10);
      if(!propertyId||!clientId||!Number.isFinite(monthlyRent)||monthlyRent<=0||dueDay<1||dueDay>31||!startDate)return sendJson(res,400,{success:false,message:"Preencha imóvel, cliente, valor, dia de pagamento e data inicial."});
      const prop=await sql`SELECT id,status FROM properties WHERE id=${propertyId} AND "databaseId"=${databaseId} LIMIT 1`; if(!prop[0])return sendJson(res,404,{success:false,message:"Imóvel não encontrado."});
      if(["alugado","financiado","vendido"].includes(String((prop[0] as any).status)))return sendJson(res,409,{success:false,message:"Este imóvel não está disponível para aluguel."});
      const rows=await sql`INSERT INTO property_rentals ("databaseId","propertyId","clientId","monthlyRent","dueDay","startDate",notes,"createdBy") VALUES (${databaseId},${propertyId},${clientId},${monthlyRent},${dueDay},${startDate},${text(body.notes,4000)||null},${user.id}) RETURNING *`;
      await sql`UPDATE properties SET status='alugado',"updatedAt"=NOW() WHERE id=${propertyId}`;
      return sendJson(res,201,{success:true,rental:rows[0]});
    }

    if(action==="end_rental"){
      requirePerm(user,"canEdit"); const id=Math.trunc(num(body.id)); const rows=await sql`SELECT "propertyId" FROM property_rentals WHERE id=${id} AND "databaseId"=${databaseId} LIMIT 1`; if(!rows[0])return sendJson(res,404,{success:false,message:"Aluguel não encontrado."});
      await sql`UPDATE property_rentals SET status='encerrado',"endDate"=CURRENT_DATE,"updatedAt"=NOW() WHERE id=${id}`; await sql`UPDATE properties SET status='disponivel',"updatedAt"=NOW() WHERE id=${Number((rows[0] as any).propertyId)}`;
      return sendJson(res,200,{success:true});
    }

    if(action==="pay_rent"){
      requirePerm(user,"canEdit"); const rentalId=Math.trunc(num(body.rentalId)),reference=text(body.referenceMonth,7);
      if(!/^\d{4}-\d{2}$/.test(reference))return sendJson(res,400,{success:false,message:"Mês de referência inválido."});
      const rent=await sql`SELECT r.*,p.title,c.name AS "clientName" FROM property_rentals r JOIN properties p ON p.id=r."propertyId" JOIN clients c ON c.id=r."clientId" WHERE r.id=${rentalId} AND r."databaseId"=${databaseId} LIMIT 1`; const r=rent[0] as any; if(!r)return sendJson(res,404,{success:false,message:"Aluguel não encontrado."});
      const [year,month]=reference.split("-").map(Number); const lastDay=new Date(year,month,0).getDate(); const dueDay=Math.min(Number(r.dueDay),lastDay); const dueDate=`${reference}-${String(dueDay).padStart(2,"0")}`; const amount=num(body.amount)||num(r.monthlyRent); const paymentDate=new Date().toISOString();
      const existing=await sql`SELECT id,"cashFlowId" FROM property_rental_payments WHERE "rentalId"=${rentalId} AND "referenceMonth"=${reference} LIMIT 1`; if(existing[0])return sendJson(res,409,{success:false,message:"Este aluguel já foi registrado como pago neste mês."});
      let cashFlowId:number|null=null;
      try{
        const cf=await sql`INSERT INTO cash_flow ("databaseId",type,category,description,amount,"movementDate","clientId",responsible,notes,"createdBy","createdAt","updatedAt") VALUES (${databaseId},'ENTRADA','Aluguel',${`Aluguel ${reference} - ${r.title}`},${amount},${paymentDate},${Number(r.clientId)},${user.username||user.email||"Usuário"},${`Recebimento de aluguel de ${r.clientName}`},${user.id},NOW(),NOW()) RETURNING id`;
        cashFlowId=Number((cf[0] as any)?.id)||null;
      }catch(e){console.warn("[properties/rent-cash-flow]",e);}
      await sql`INSERT INTO property_rental_payments ("databaseId","rentalId","referenceMonth",amount,"dueDate","paymentDate",status,"cashFlowId","createdBy") VALUES (${databaseId},${rentalId},${reference},${amount},${dueDate},${paymentDate},'pago',${cashFlowId},${user.id})`;
      return sendJson(res,200,{success:true});
    }

    if(action==="create_financing"){
      requirePerm(user,"canInsert"); const propertyId=Math.trunc(num(body.propertyId)),clientId=Math.trunc(num(body.clientId)),salePrice=num(body.salePrice),down=num(body.downPayment)||0,rate=num(body.interestRate)||0,installments=Math.trunc(num(body.installments)),startDate=text(body.startDate,10);
      if(!propertyId||!clientId||salePrice<=0||down<0||down>=salePrice||rate<0||installments<1||!startDate)return sendJson(res,400,{success:false,message:"Dados do financiamento imobiliário inválidos."});
      const prop=await sql`SELECT id,status FROM properties WHERE id=${propertyId} AND "databaseId"=${databaseId} LIMIT 1`; if(!prop[0])return sendJson(res,404,{success:false,message:"Imóvel não encontrado."}); if(["alugado","financiado","vendido"].includes(String((prop[0] as any).status)))return sendJson(res,409,{success:false,message:"Este imóvel não está disponível para financiamento."});
      const principal=salePrice-down,total=principal+(principal*rate/100)*installments,installmentAmount=total/installments;
      const rows=await sql`INSERT INTO property_financings ("databaseId","propertyId","clientId","salePrice","downPayment","interestRate",installments,"installmentAmount","totalAmount","startDate",notes,"createdBy") VALUES (${databaseId},${propertyId},${clientId},${salePrice},${down},${rate},${installments},${installmentAmount},${total},${startDate},${text(body.notes,4000)||null},${user.id}) RETURNING *`;
      await sql`UPDATE properties SET status='financiado',"salePrice"=${salePrice},"updatedAt"=NOW() WHERE id=${propertyId}`;
      return sendJson(res,201,{success:true,financing:rows[0]});
    }

    return sendJson(res,400,{success:false,message:"Ação inválida."});
  }catch(e:any){console.error("[properties]",e);return sendJson(res,Number(e?.statusCode||500),{success:false,message:e instanceof Error?e.message:"Erro ao processar imóveis."});}
}
