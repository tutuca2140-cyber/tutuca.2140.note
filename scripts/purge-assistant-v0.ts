import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL ausente; limpeza do assistente antigo não executada.");
}

const sql = neon(connectionString);

console.log("[Assistant V0 cleanup] iniciando limpeza de dados e schema antigos");

await sql`DROP TABLE IF EXISTS olivia_conversations CASCADE`;
await sql`DROP TABLE IF EXISTS olivia_settings CASCADE`;
await sql`ALTER TABLE users DROP COLUMN IF EXISTS "oliviaEnabled"`;
await sql`ALTER TABLE users DROP COLUMN IF EXISTS "oliviaPlan"`;

await sql`
  DELETE FROM "auditLogs"
  WHERE lower(coalesce(entity, '')) LIKE '%olivia%'
     OR lower(coalesce(action, '')) LIKE '%olivia%'
     OR lower(coalesce(details, '')) LIKE '%olivia_settings%'
     OR lower(coalesce(details, '')) LIKE '%olivia_conversations%'
     OR lower(coalesce(details, '')) LIKE '%oliviaenabled%'
     OR lower(coalesce(details, '')) LIKE '%oliviaplan%'
`;

const remainingRelations = await sql`
  SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind AS object_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE lower(c.relname) LIKE '%olivia%'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
`;

const remainingColumns = await sql`
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE lower(table_name) LIKE '%olivia%'
     OR lower(column_name) LIKE '%olivia%'
`;

if (remainingRelations.length || remainingColumns.length) {
  console.error("[Assistant V0 cleanup] resíduos encontrados", {
    relationCount: remainingRelations.length,
    columnCount: remainingColumns.length,
  });
  throw new Error("A limpeza do assistente antigo deixou resíduos no schema.");
}

console.log("[Assistant V0 cleanup] concluído: 0 tabelas/índices/sequências/colunas residuais");
