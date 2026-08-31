import { getSql, readCookie, readJsonBody, sendJson, SESSION_COOKIE_NAME } from "../api/auth/_shared.js";

type SessionUser={id:number;username?:string;email?:string;role:string;isActive:boolean;canView:boolean;canInsert:boolean;canEdit:boolean;canDelete:boolean};
const PROPERTY_TYPES=["casa","apartamento","terreno","loja"] as const;
let ensurePromise:Promise<void>|null=null;

function ensureTables(){
  if(ensurePromise)return ensurePromise;
  const sql=getSql();
  ensurePromise=(async()=>{
    await sql`CREATE TABLE IF NOT EXISTS properties (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,title varchar(255) NOT NULL,type varchar(40) NOT NULL,address text NOT NULL,
      neighborhood varchar(120),city varchar(120),state varchar(2),"zipCode" varchar(12),"areaM2" numeric(12,2),rooms integer DEFAULT 0 NOT NULL,
      bedrooms integer DEFAULT 0 NOT NULL,"livingRooms" integer DEFAULT 0 NOT NULL,kitchens integer DEFAULT 0 NOT NULL,bathrooms integer DEFAULT 0 NOT NULL,
      garages integer DEFAULT 0 NOT NULL,"hasGarage" boolean DEFAULT false NOT NULL,"salePrice" numeric(15,2),status varchar(40) DEFAULT 'disponivel' NOT NULL,
      notes text,"createdBy" integer NOT NULL,"createdAt" timestamptz DEFAULT NOW() NOT NULL,"updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS properties_database_idx ON properties("databaseId")`;
    await sql`CREATE TABLE IF NOT EXISTS property_rentals (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,"propertyId" bigint NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      "clientId" integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,"monthlyRent" numeric(15,2) NOT NULL,"dueDay" integer NOT NULL,
      "startDate" date NOT NULL,"endDate" date,status varchar(30) DEFAULT 'ativo' NOT NULL,notes text,"createdBy" integer NOT NULL,
      "createdAt" timestamptz DEFAULT NOW() NOT NULL,"updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS property_rental_payments (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,"rentalId" bigint NOT NULL REFERENCES property_rentals(id) ON DELETE CASCADE,
      "referenceMonth" varchar(7) NOT NULL,amount numeric(15,2) NOT NULL,"dueDate" date NOT NULL,"paymentDate" timestamptz,status varchar(30) DEFAULT 'pendente' NOT NULL,
      "cashFlowId" integer,"createdBy" integer NOT NULL,"createdAt" timestamptz DEFAULT NOW() NOT NULL,UNIQUE("rentalId","referenceMonth")
    )`;
    await sql`CREATE TABLE IF NOT EXISTS property_financings (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,"propertyId" bigint NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      "clientId" integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,"salePrice" numeric(15,2) NOT NULL,"downPayment" numeric(15,2) DEFAULT 0 NOT NULL,
      "interestRate" numeric(8,4) DEFAULT 0 NOT NULL,installments integer NOT NULL,"installmentAmount" numeric(15,2) NOT NULL,"totalAmount" numeric(15,2) NOT NULL,
      "startDate" date NOT NULL,status varchar(30) DEFAULT 'ativo' NOT NULL,notes text,"createdBy" integer NOT NULL,
      "createdAt" timestamptz DEFAULT NOW() NOT NULL,"updatedAt" timestamptz DEFAULT NOW() NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS property_financing_payments (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,"financingId" bigint NOT NULL REFERENCES property_financings(id) ON DELETE CASCADE,
      "installmentNumber" integer NOT NULL,amount numeric(15,2) NOT NULL,"dueDate" date NOT NULL,"paymentDate" timestamptz NOT NULL DEFAULT NOW(),
      "cashFlowId" integer,"createdBy" integer NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT NOW(),UNIQUE("financingId","installmentNumber")
    )`;
    await sql`CREATE TABLE IF NOT EXISTS property_sales (
      id bigserial PRIMARY KEY,"databaseId" integer NOT NULL,"propertyId" bigint NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      "clientId" integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,amount numeric(15,2) NOT NULL,"saleDate" timestamptz NOT NULL DEFAULT NOW(),
      "cashFlowId" integer,notes text,"createdBy" integer NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS property_rentals_database_idx ON property_rentals("databaseId")`;
    await sql`CREATE INDEX IF NOT EXISTS property_financings_database_idx ON property_financings("databaseId")`;
  })().catch(e=>{ensurePromise=null;throw e});
  return ensurePromise;
}

async function getUser(req:any):Promise<SessionUser|null>{
  const token=readCookie(req,SESSION_COOKIE_NAME);if(!token)return null;const sql=getSql();
  const rows=await sql`SELECT u.id,u.username,u.email,u.role,u."isActive",u."canView",u."canInsert",u."canEdit",u."canDelete" FROM local_sessions s JOIN users u ON u.id=s."userId" WHERE s.token=${token} AND s."expiresAt">NOW() LIMIT 1`;
  const u=rows[0] as any;return u?.isActive?u:null;
}
async function activeDatabase(user:SessionUser){const sql=getSql();if(user.role!=="super_admin"){const active=await sql`SELECT d.id,d.name FROM user_database_access a JOIN databases d ON d.id=a."databaseId" WHERE a."userId"=${user.id} AND a."isActive"=true LIMIT 1`;if(active[0])return active[0] as any;const fallback=await sql`SELECT d.id,d.name FROM user_database_access a JOIN databases d ON d.id=a."databaseId" WHERE a."userId"=${user.id} ORDER BY a.id LIMIT 1`;if(fallback[0])return fallback[0] as any;if(user.role!=="admin")return null;}const rows=await sql`SELECT id,name FROM databases WHERE "isActive"=true LIMIT 1`;return (rows[0] as any)||null;}
const num=(v:any)=>Number(v);const text=(v:any,max=2000)=>String(v??"").trim().slice(0,max);
function requirePerm(u:SessionUser,k:"canView"|"canInsert"|"canEdit"|"canDelete"){if(u.role==="super_admin"||u[k])return;throw Object.assign(new Error("Você não tem permissão para esta operação."),{statusCode:403});}
function validType(value:any){const t=text(value,40).toLowerCase();return PROPERTY_TYPES.includes(t as any)?t:null;}
async function cashEntry(databaseId:number,amount:number,category:string,description:string,clientId:number|null,userId:number){if(!(amount>0))return null;const sql=getSql();const rows=await sql`INSERT INTO cash_flow ("databaseId",type,category,description,amount,"movementDate","clientId",responsible,notes,"createdBy") VALUES (${databaseId},'ENTRADA',${category},${description},${amount},NOW(),${clientId},'Imóveis','Gerado automaticamente pelo módulo de imóveis',${userId}) RETURNING id`;return Number((rows[0] as any)?.id)||null;}
function installmentDue(startDate:string,n:number){const d=new Date(`${startDate}T12:00:00`);d.setMonth(d.getMonth()+Math.max(0,n-1));return d.toISOString().slice(0,10);}

async function listAll(databaseId:number){const sql=getSql();const [properties,rentals,financings,clients,payments,financingPayments,sales]=await Promise.all([
  sql`SELECT * FROM properties WHERE "databaseId"=${databaseId} ORDER BY "createdAt" DESC`,
  sql`SELECT r.*,p.title AS "propertyTitle",p.type AS "propertyType",p.address AS "propertyAddress",c.name AS "clientName",c.phone AS "clientPhone",c.whatsapp AS "clientWhatsapp" FROM property_rentals r JOIN properties p ON p.id=r."propertyId" JOIN clients c ON c.id=r."clientId" WHERE r."databaseId"=${databaseId} ORDER BY r."createdAt" DESC`,
  sql`SELECT f.*,p.title AS "propertyTitle",p.type AS "propertyType",c.name AS "clientName",COALESCE((SELECT SUM(fp.amount) FROM property_financing_payments fp WHERE fp."financingId"=f.id),0) AS "totalPaid" FROM property_financings f JOIN properties p ON p.id=f."propertyId" JOIN clients c ON c.id=f."clientId" WHERE f."databaseId"=${databaseId} ORDER BY f."createdAt" DESC`,
  sql`SELECT id,name,phone,whatsapp,email FROM clients WHERE "databaseId"=${databaseId} ORDER BY name`,
  sql`SELECT rp.*,r."propertyId",r."clientId" FROM property_rental_payments rp JOIN property_rentals r ON r.id=rp."rentalId" WHERE rp."databaseId"=${databaseId} ORDER BY rp."dueDate" DESC`,
  sql`SELECT * FROM property_financing_payments WHERE "databaseId"=${databaseId} ORDER BY "paymentDate" DESC`,
  sql`SELECT s.*,p.title AS "propertyTitle",p.type AS "propertyType",c.name AS "clientName" FROM property_sales s JOIN properties p ON p.id=s."propertyId" JOIN clients c ON c.id=s."clientId" WHERE s."databaseId"=${databaseId} ORDER BY s."saleDate" DESC`
]);return {properties,rentals,financings,clients,payments,financingPayments,sales,currentMonth:new Date().toISOString().slice(0,7),propertyTypes:PROPERTY_TYPES};}

export async function handlePropertiesV2(req:any,res:any){
  try{
    const user=await getUser(req);if(!user)return sendJson(res,401,{success:false,message:"Sessão expirada."});const db=await activeDatabase(user);if(!db)return sendJson(res,400,{success:false,message:"Selecione um banco de dados para trabalhar."});await ensureTables();const databaseId=Number(db.id);const sql=getSql();
    if(req.method==="GET"){requirePerm(user,"canView");return sendJson(res,200,{success:true,database:db,...await listAll(databaseId)});}
    if(req.method!=="POST")return sendJson(res,405,{success:false,message:"Método não permitido."});
    const body=await readJsonBody(req);const action=text(body?.action,60);
    if(action==="create_property"){
      requirePerm(user,"canInsert");const title=text(body.title,255),type=validType(body.type),address=text(body.address,1000);if(!title||!type||!address)return sendJson(res,400,{success:false,message:"Informe identificação, categoria e endereço do imóvel."});const garages=Math.max(0,Math.trunc(num(body.garages)||0));
      const rows=await sql`INSERT INTO properties ("databaseId",title,type,address,neighborhood,city,state,"zipCode","areaM2",rooms,bedrooms,"livingRooms",kitchens,bathrooms,garages,"hasGarage","salePrice",notes,"createdBy") VALUES (${databaseId},${title},${type},${address},${text(body.neighborhood,120)||null},${text(body.city,120)||null},${text(body.state,2).toUpperCase()||null},${text(body.zipCode,12)||null},${body.areaM2===""||body.areaM2==null?null:num(body.areaM2)},${Math.max(0,Math.trunc(num(body.rooms)||0))},${Math.max(0,Math.trunc(num(body.bedrooms)||0))},${Math.max(0,Math.trunc(num(body.livingRooms)||0))},${Math.max(0,Math.trunc(num(body.kitchens)||0))},${Math.max(0,Math.trunc(num(body.bathrooms)||0))},${garages},${Boolean(body.hasGarage)||garages>0},${body.salePrice===""||body.salePrice==null?null:num(body.salePrice)},${text(body.notes,4000)||null},${user.id}) RETURNING *`;return sendJson(res,201,{success:true,property:rows[0]});
    }
    if(action==="delete_property"){
      requirePerm(user,"canDelete");const id=Math.trunc(num(body.id));const linked=await sql`SELECT (SELECT COUNT(*) FROM property_rentals WHERE "propertyId"=${id} AND status='ativo')::int rentals,(SELECT COUNT(*) FROM property_financings WHERE "propertyId"=${id} AND status='ativo')::int financings`;if(Number((linked[0] as any)?.rentals)>0||Number((linked[0] as any)?.financings)>0)return sendJson(res,409,{success:false,message:"Encerre o aluguel ou financiamento ativo antes de excluir o imóvel."});await sql`DELETE FROM properties WHERE id=${id} AND "databaseId"=${databaseId}`;return sendJson(res,200,{success:true});
    }
    if(action==="create_rental"){
      requirePerm(user,"canInsert");const propertyId=Math.trunc(num(body.propertyId)),clientId=Math.trunc(num(body.clientId)),monthlyRent=num(body.monthlyRent),dueDay=Math.trunc(num(body.dueDay)),startDate=text(body.startDate,10);if(!propertyId||!clientId||monthlyRent<=0||dueDay<1||dueDay>31||!startDate)return sendJson(res,400,{success:false,message:"Preencha imóvel, cliente, valor, dia de pagamento e data inicial."});const prop=await sql`SELECT status FROM properties WHERE id=${propertyId} AND "databaseId"=${databaseId} LIMIT 1`;if(!prop[0])return sendJson(res,404,{success:false,message:"Imóvel não encontrado."});if(String((prop[0] as any).status)!=="disponivel")return sendJson(res,409,{success:false,message:"Este imóvel não está disponível para aluguel."});const rows=await sql`INSERT INTO property_rentals ("databaseId","propertyId","clientId","monthlyRent","dueDay","startDate",notes,"createdBy") VALUES (${databaseId},${propertyId},${clientId},${monthlyRent},${dueDay},${startDate},${text(body.notes,4000)||null},${user.id}) RETURNING *`;await sql`UPDATE properties SET status='alugado',"updatedAt"=NOW() WHERE id=${propertyId}`;return sendJson(res,201,{success:true,rental:rows[0]});
    }
    if(action==="end_rental"){
      requirePerm(user,"canEdit");const id=Math.trunc(num(body.id));const rows=await sql`SELECT "propertyId" FROM property_rentals WHERE id=${id} AND "databaseId"=${databaseId} LIMIT 1`;if(!rows[0])return sendJson(res,404,{success:false,message:"Aluguel não encontrado."});await sql`UPDATE property_rentals SET status='encerrado',"endDate"=CURRENT_DATE,"updatedAt"=NOW() WHERE id=${id}`;await sql`UPDATE properties SET status='disponivel',"updatedAt"=NOW() WHERE id=${Number((rows[0] as any).propertyId)}`;return sendJson(res,200,{success:true});
    }
    if(action==="pay_rent"){
      requirePerm(user,"canEdit");const rentalId=Math.trunc(num(body.rentalId)),reference=text(body.referenceMonth,7);if(!/^\d{4}-\d{2}$/.test(reference))return sendJson(res,400,{success:false,message:"Mês de referência inválido."});const rent=await sql`SELECT r.*,p.title,c.name AS "clientName" FROM property_rentals r JOIN properties p ON p.id=r."propertyId" JOIN clients c ON c.id=r."clientId" WHERE r.id=${rentalId} AND r."databaseId"=${databaseId} LIMIT 1`;const r=rent[0] as any;if(!r)return sendJson(res,404,{success:false,message:"Aluguel não encontrado."});const existing=await sql`SELECT id FROM property_rental_payments WHERE "rentalId"=${rentalId} AND "referenceMonth"=${reference} LIMIT 1`;if(existing[0])return sendJson(res,409,{success:false,message:"Este aluguel já foi pago neste mês."});const [year,month]=reference.split("-").map(Number),lastDay=new Date(year,month,0).getDate(),dueDate=`${reference}-${String(Math.min(Number(r.dueDay),lastDay)).padStart(2,"0")}`,amount=num(body.amount)||num(r.monthlyRent);const cashFlowId=await cashEntry(databaseId,amount,"ALUGUEL_IMOVEL",`Aluguel ${reference} - ${r.title} - ${r.clientName}`,Number(r.clientId),user.id);await sql`INSERT INTO property_rental_payments ("databaseId","rentalId","referenceMonth",amount,"dueDate","paymentDate",status,"cashFlowId","createdBy") VALUES (${databaseId},${rentalId},${reference},${amount},${dueDate},NOW(),'pago',${cashFlowId},${user.id})`;return sendJson(res,200,{success:true});
    }
    if(action==="create_financing"){
      requirePerm(user,"canInsert");const propertyId=Math.trunc(num(body.propertyId)),clientId=Math.trunc(num(body.clientId)),salePrice=num(body.salePrice),down=num(body.downPayment)||0,rate=num(body.interestRate)||0,installments=Math.trunc(num(body.installments)),startDate=text(body.startDate,10);if(!propertyId||!clientId||salePrice<=0||down<0||down>=salePrice||rate<0||installments<1||!startDate)return sendJson(res,400,{success:false,message:"Dados do financiamento imobiliário inválidos."});const prop=await sql`SELECT id,title,type,status FROM properties WHERE id=${propertyId} AND "databaseId"=${databaseId} LIMIT 1`;const p=prop[0] as any;if(!p)return sendJson(res,404,{success:false,message:"Imóvel não encontrado."});if(String(p.status)!=="disponivel")return sendJson(res,409,{success:false,message:"Este imóvel não está disponível para financiamento."});const principal=salePrice-down,total=principal+(principal*rate/100)*installments,installmentAmount=total/installments;const rows=await sql`INSERT INTO property_financings ("databaseId","propertyId","clientId","salePrice","downPayment","interestRate",installments,"installmentAmount","totalAmount","startDate",notes,"createdBy") VALUES (${databaseId},${propertyId},${clientId},${salePrice},${down},${rate},${installments},${installmentAmount},${total},${startDate},${text(body.notes,4000)||null},${user.id}) RETURNING *`;await sql`UPDATE properties SET status='financiado',"salePrice"=${salePrice},"updatedAt"=NOW() WHERE id=${propertyId}`;if(down>0)await cashEntry(databaseId,down,"ENTRADA_FINANCIAMENTO_IMOVEL",`Entrada financiamento - ${p.title}`,clientId,user.id);return sendJson(res,201,{success:true,financing:rows[0]});
    }
    if(action==="pay_financing"){
      requirePerm(user,"canEdit");const financingId=Math.trunc(num(body.financingId)),installmentNumber=Math.trunc(num(body.installmentNumber));const rows=await sql`SELECT f.*,p.title,c.name AS "clientName" FROM property_financings f JOIN properties p ON p.id=f."propertyId" JOIN clients c ON c.id=f."clientId" WHERE f.id=${financingId} AND f."databaseId"=${databaseId} LIMIT 1`;const f=rows[0] as any;if(!f)return sendJson(res,404,{success:false,message:"Financiamento não encontrado."});if(installmentNumber<1||installmentNumber>Number(f.installments))return sendJson(res,400,{success:false,message:"Número de parcela inválido."});const existing=await sql`SELECT id FROM property_financing_payments WHERE "financingId"=${financingId} AND "installmentNumber"=${installmentNumber} LIMIT 1`;if(existing[0])return sendJson(res,409,{success:false,message:"Esta parcela já foi paga."});const amount=num(body.amount)||num(f.installmentAmount),dueDate=installmentDue(String(f.startDate).slice(0,10),installmentNumber);const cashFlowId=await cashEntry(databaseId,amount,"PARCELA_FINANCIAMENTO_IMOVEL",`Parcela ${installmentNumber}/${f.installments} - ${f.title} - ${f.clientName}`,Number(f.clientId),user.id);await sql`INSERT INTO property_financing_payments ("databaseId","financingId","installmentNumber",amount,"dueDate","cashFlowId","createdBy") VALUES (${databaseId},${financingId},${installmentNumber},${amount},${dueDate},${cashFlowId},${user.id})`;const count=await sql`SELECT COUNT(*)::int AS total FROM property_financing_payments WHERE "financingId"=${financingId}`;if(Number((count[0] as any)?.total)>=Number(f.installments)){await sql`UPDATE property_financings SET status='pago',"updatedAt"=NOW() WHERE id=${financingId}`;await sql`UPDATE properties SET status='vendido',"updatedAt"=NOW() WHERE id=${Number(f.propertyId)}`;}return sendJson(res,200,{success:true});
    }
    if(action==="sell_cash"){
      requirePerm(user,"canInsert");const propertyId=Math.trunc(num(body.propertyId)),clientId=Math.trunc(num(body.clientId)),amount=num(body.amount);if(!propertyId||!clientId||amount<=0)return sendJson(res,400,{success:false,message:"Informe imóvel, cliente e valor da venda."});const prop=await sql`SELECT title,status FROM properties WHERE id=${propertyId} AND "databaseId"=${databaseId} LIMIT 1`;const p=prop[0] as any;if(!p)return sendJson(res,404,{success:false,message:"Imóvel não encontrado."});if(String(p.status)!=="disponivel")return sendJson(res,409,{success:false,message:"Este imóvel não está disponível para venda."});const cashFlowId=await cashEntry(databaseId,amount,"VENDA_IMOVEL",`Venda à vista - ${p.title}`,clientId,user.id);await sql`INSERT INTO property_sales ("databaseId","propertyId","clientId",amount,"cashFlowId",notes,"createdBy") VALUES (${databaseId},${propertyId},${clientId},${amount},${cashFlowId},${text(body.notes,4000)||null},${user.id})`;await sql`UPDATE properties SET status='vendido',"salePrice"=${amount},"updatedAt"=NOW() WHERE id=${propertyId}`;return sendJson(res,201,{success:true});
    }
    return sendJson(res,400,{success:false,message:"Ação inválida."});
  }catch(e:any){console.error("[properties-v2]",e);return sendJson(res,Number(e?.statusCode||500),{success:false,message:e instanceof Error?e.message:"Erro ao processar imóveis."});}
}
