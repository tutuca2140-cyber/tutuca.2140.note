from pathlib import Path
p=Path('server/db.ts')
t=p.read_text()
marker='// ==================== PRODUCTS ====================\nexport async function getProductsByDatabase(databaseId: number) {'
helper='''// ==================== PRODUCTS ====================
let productInventorySchemaPromise: Promise<void> | null = null;
async function ensureProductInventorySchema(db: any) {
  if (productInventorySchemaPromise) return productInventorySchemaPromise;
  productInventorySchemaPromise = (async () => {
    await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "color" varchar(80)`);
    await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stockQuantity" numeric(15,3) DEFAULT '0.000' NOT NULL`);
    await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stockUnit" varchar(20) DEFAULT 'unit' NOT NULL`);
  })().catch((error: unknown) => {
    productInventorySchemaPromise = null;
    throw error;
  });
  return productInventorySchemaPromise;
}

export async function getProductsByDatabase(databaseId: number) {'''
if marker not in t: raise SystemExit('products section marker not found')
t=t.replace(marker,helper,1)
replacements=[
('''export async function getProductsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db''','''export async function getProductsByDatabase(databaseId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureProductInventorySchema(db);
  return db'''),
('''export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db''','''export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureProductInventorySchema(db);
  const rows = await db'''),
('''export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db''','''export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureProductInventorySchema(db);
  const [created] = await db''')]
for old,new in replacements:
    if old not in t: raise SystemExit('expected product function snippet not found')
    t=t.replace(old,new,1)
p.write_text(t)
