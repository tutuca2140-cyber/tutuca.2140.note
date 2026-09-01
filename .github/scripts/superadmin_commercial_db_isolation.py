from pathlib import Path

def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected snippet not found in {path}")
    p.write_text(text.replace(old, new, 1))

replace_once('server/db.ts', '''export async function getDatabasesForUser(userId: number, role: string) {
  const db = await getDb();
  if (!db) return [];
  if (role === "super_admin") return getAllDatabases();
  const assigned = await db''', '''export async function getDatabasesForUser(userId: number, role: string) {
  const db = await getDb();
  if (!db) return [];
  if (role === "super_admin") {
    const rows = await db
      .select({ database: databases })
      .from(databases)
      .leftJoin(users, eq(databases.createdBy, users.id))
      .where(sql`COALESCE(${users.loginMethod}, 'local') NOT IN ('commercial_signup', 'commercial_subuser')`)
      .orderBy(desc(databases.createdAt));
    return rows.map(row => row.database);
  }
  const assigned = await db''')

replace_once('server/db.ts', '''export async function getAllDatabases() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(databases).orderBy(desc(databases.createdAt));
}

export async function getDatabasesForUser''', '''export async function getAllDatabases() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(databases).orderBy(desc(databases.createdAt));
}

export async function getCommercialCustomerDatabases() {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: databases.id,
      name: databases.name,
      description: databases.description,
      type: databases.type,
      isActive: databases.isActive,
      createdBy: databases.createdBy,
      createdAt: databases.createdAt,
      ownerName: users.name,
      ownerUsername: users.username,
      ownerEmail: users.email,
      ownerLoginMethod: users.loginMethod,
    })
    .from(databases)
    .innerJoin(users, eq(databases.createdBy, users.id))
    .where(eq(users.loginMethod, "commercial_signup"))
    .orderBy(desc(databases.createdAt));
}

export async function isCommercialCustomerDatabase(id: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: databases.id })
    .from(databases)
    .innerJoin(users, eq(databases.createdBy, users.id))
    .where(and(eq(databases.id, id), eq(users.loginMethod, "commercial_signup")))
    .limit(1);
  return Boolean(rows[0]);
}

export async function getDatabasesForUser''')

replace_once('server/routers.ts', '''    setActive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.setActiveDatabase(input.id);

        const dbInfo = await db.getDatabaseById(input.id);''', '''    setActive: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "super_admin" && (await db.isCommercialCustomerDatabase(input.id))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bancos de clientes não podem ser acessados pelo seletor Banco em operação. Use a área protegida Bancos de Clientes no Super Admin.",
          });
        }
        await db.setActiveDatabase(input.id);

        const dbInfo = await db.getDatabaseById(input.id);''')

replace_once('server/routers.ts', '''    getActive: protectedProcedure.query(async () => {
      return await db.getActiveDatabase();
    }),

    create: adminProcedure''', '''    getActive: protectedProcedure.query(async () => {
      return await db.getActiveDatabase();
    }),

    listCustomerDatabases: superAdminProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getUserById(ctx.user.id);
        if (!current?.passwordHash || !(await bcrypt.compare(input.password, current.passwordHash))) {
          await db.createAuditLog({
            userId: ctx.user.id,
            username: ctx.user.username || ctx.user.email || "Super Admin",
            action: "customer_database_access_denied",
            entity: "databases",
            details: "Senha do Super Admin inválida para acessar bancos de clientes.",
            status: "failed",
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha do Super Admin inválida." });
        }
        const rows = await db.getCommercialCustomerDatabases();
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.username || ctx.user.email || "Super Admin",
          action: "customer_database_list_access",
          entity: "databases",
          details: `Acesso protegido a ${rows.length} banco(s) de clientes.`,
          status: "success",
        });
        return rows;
      }),

    enterCustomerDatabase: superAdminProcedure
      .input(z.object({ id: z.number().int().positive(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getUserById(ctx.user.id);
        if (!current?.passwordHash || !(await bcrypt.compare(input.password, current.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha do Super Admin inválida." });
        }
        if (!(await db.isCommercialCustomerDatabase(input.id))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este banco não pertence a uma conta comercial de cliente." });
        }
        await db.setActiveDatabase(input.id);
        const dbInfo = await db.getDatabaseById(input.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          username: ctx.user.username || ctx.user.email || "Super Admin",
          action: "enter_customer_database",
          entity: "databases",
          entityId: input.id,
          databaseId: input.id,
          details: `Acesso protegido ao banco do cliente: ${dbInfo?.name || input.id}`,
          status: "success",
        });
        return { success: true, database: dbInfo };
      }),

    create: adminProcedure''')

replace_once('client/src/components/DashboardLayout.tsx', '''{availableDatabases.length > 0 && <div className="mt-2 lg:mt-3"><p className="mb-1 text-[11px] font-medium text-muted-foreground">Banco em operação</p><Select''', '''{availableDatabases.length > 0 && <div className="mt-2 lg:mt-3"><p className="mb-1 text-[11px] font-medium text-muted-foreground">Banco em operação</p>{isSuperAdmin ? <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">Bancos de clientes ficam protegidos em Super Admin → Bancos de Dados.</p> : null}<Select''')

p = Path('client/src/pages/admin/Bancos.tsx')
t = p.read_text()
t = t.replace('''  const [adminPending, setAdminPending] = useState(false);''', '''  const [adminPending, setAdminPending] = useState(false);
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerDatabases, setCustomerDatabases] = useState<any[]>([]);
  const [customerUnlocked, setCustomerUnlocked] = useState(false);''', 1)
t = t.replace('''  const setActiveMutation = trpc.databases.setActive.useMutation();
  const deleteMutation = trpc.databases.delete.useMutation();''', '''  const setActiveMutation = trpc.databases.setActive.useMutation();
  const deleteMutation = trpc.databases.delete.useMutation();
  const listCustomerDatabases = trpc.databases.listCustomerDatabases.useMutation();
  const enterCustomerDatabase = trpc.databases.enterCustomerDatabase.useMutation();''', 1)
marker = '''  return (
    <DashboardLayout>
      <div className="space-y-6">'''
insertion = '''  const unlockCustomerDatabases = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rows = await listCustomerDatabases.mutateAsync({ password: customerPassword });
      setCustomerDatabases(rows);
      setCustomerUnlocked(true);
      toast.success("Área protegida liberada.");
    } catch (error) {
      setCustomerUnlocked(false);
      toast.error(error instanceof Error ? error.message : "Não foi possível liberar os bancos de clientes.");
    }
  };

  const openCustomerDatabase = async (databaseId: number) => {
    if (!customerPassword) {
      toast.error("Digite novamente a senha do Super Admin.");
      return;
    }
    try {
      await enterCustomerDatabase.mutateAsync({ id: databaseId, password: customerPassword });
      await refreshDatabases();
      toast.success("Banco do cliente liberado para esta sessão administrativa.");
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível acessar o banco do cliente.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">'''
if marker not in t:
    raise SystemExit('AdminBancos return marker not found')
t = t.replace(marker, insertion, 1)
section_marker = '''        {isLoading ? ('''
section = '''        {user?.role === "super_admin" && (
          <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Bancos de Clientes — Área Protegida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Os bancos pertencentes a usuários que contrataram o Note Note não aparecem em “Banco em operação”. Para consultar um deles, confirme a senha do Super Admin nesta área específica.
              </p>
              {!customerUnlocked ? (
                <form onSubmit={unlockCustomerDatabases} className="flex flex-col gap-2 sm:flex-row">
                  <Input type="password" value={customerPassword} onChange={e => setCustomerPassword(e.target.value)} placeholder="Senha do Super Admin" autoComplete="current-password" required />
                  <Button type="submit" disabled={listCustomerDatabases.isPending}>{listCustomerDatabases.isPending ? "Verificando..." : "Liberar área protegida"}</Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Área liberada nesta tela.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCustomerUnlocked(false); setCustomerDatabases([]); setCustomerPassword(""); }}>Bloquear novamente</Button>
                  </div>
                  {customerDatabases.length ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {customerDatabases.map((db: any) => (
                        <div key={db.id} className="rounded-xl border bg-background p-4">
                          <p className="font-semibold">{db.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Cliente: {db.ownerName || db.ownerUsername || db.ownerEmail || "Conta comercial"}</p>
                          <p className="text-xs text-muted-foreground">{db.ownerEmail || "E-mail não informado"}</p>
                          <Button className="mt-3 w-full" size="sm" onClick={() => openCustomerDatabase(db.id)} disabled={enterCustomerDatabase.isPending}>Acessar com senha do Super Admin</Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Nenhum banco de cliente comercial encontrado.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? ('''
if section_marker not in t:
    raise SystemExit('AdminBancos list marker not found')
p.write_text(t.replace(section_marker, section, 1))
