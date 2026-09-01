import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { BadgeDollarSign, Building2, Home, MapPin, Percent, Plus, ReceiptText, Trash2, UserRound, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const API = "/api/site-access?scope=properties";
const money = (value: any) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const typeLabel: Record<string, string> = { casa: "Casa", apartamento: "Apartamento", terreno: "Terreno", loja: "Loja" };
const today = () => new Date().toISOString().slice(0, 10);
const emptyProperty = () => ({ title: "", type: "casa", address: "", neighborhood: "", city: "", state: "", zipCode: "", areaM2: "", rooms: "0", bedrooms: "0", livingRooms: "0", kitchens: "0", bathrooms: "0", garages: "0", hasGarage: false, salePrice: "", notes: "" });
const emptyFinancing = () => ({ propertyId: "", clientId: "", salePrice: "", downPayment: "0", interestRate: "", installmentAmount: "", installments: "", startDate: today(), agentId: "", commissionPercentage: "", notes: "" });
const emptySale = () => ({ propertyId: "", clientId: "", amount: "", agentId: "", commissionPercentage: "", notes: "" });

export default function Imoveis() {
  const { user } = useAuth();
  const [data, setData] = useState<any>({ properties: [], clients: [], financings: [], financingPayments: [], sales: [], agents: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [openFinance, setOpenFinance] = useState(false);
  const [openSale, setOpenSale] = useState(false);
  const [form, setForm] = useState(emptyProperty);
  const [finance, setFinance] = useState(emptyFinancing);
  const [sale, setSale] = useState(emptySale);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(API, { credentials: "include" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message);
      setData(json);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar imóveis.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const post = async (body: any) => {
    const response = await fetch(API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || "Operação não concluída.");
    return json;
  };

  const summary = useMemo(() => ({
    total: data.properties.length,
    available: data.properties.filter((p: any) => p.status === "disponivel").length,
    rented: data.properties.filter((p: any) => p.status === "alugado").length,
    financed: data.properties.filter((p: any) => p.status === "financiado").length,
    sold: data.properties.filter((p: any) => p.status === "vendido").length,
  }), [data.properties]);

  const calculation = useMemo(() => {
    const price = Number(finance.salePrice || 0);
    const down = Number(finance.downPayment || 0);
    const installments = Number(finance.installments || 0);
    const principal = Math.max(0, price - down);
    if (!(principal > 0 && installments > 0)) return { principal, rate: 0, installment: 0, total: 0, mode: "" };
    if (finance.interestRate.trim() !== "") {
      const rate = Math.max(0, Number(finance.interestRate) || 0);
      const total = principal + (principal * rate / 100) * installments;
      return { principal, rate, installment: total / installments, total, mode: "rate" };
    }
    if (finance.installmentAmount.trim() !== "") {
      const installment = Math.max(0, Number(finance.installmentAmount) || 0);
      const total = installment * installments;
      const rate = Math.max(0, ((total / principal) - 1) * 100 / installments);
      return { principal, rate, installment, total, mode: "installment" };
    }
    return { principal, rate: 0, installment: 0, total: principal, mode: "" };
  }, [finance]);

  const chooseAgent = (target: "finance" | "sale", value: string) => {
    const agent = data.agents?.find((item: any) => String(item.id) === value);
    const agentId = value === "none" ? "" : value;
    const commissionPercentage = agent ? String(agent.defaultCommissionPercentage || 0) : "";
    target === "finance" ? setFinance(current => ({ ...current, agentId, commissionPercentage })) : setSale(current => ({ ...current, agentId, commissionPercentage }));
  };

  const saveProperty = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await post({ action: "create_property", ...form }); toast.success("Imóvel cadastrado."); setOpen(false); setForm(emptyProperty()); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao cadastrar imóvel."); }
  };
  const removeProperty = async (id: number) => {
    if (!window.confirm("Excluir este imóvel?")) return;
    try { await post({ action: "delete_property", id }); toast.success("Imóvel excluído."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao excluir imóvel."); }
  };
  const startFinance = (property: any) => { setFinance({ ...emptyFinancing(), propertyId: String(property.id), salePrice: String(property.salePrice || "") }); setOpenFinance(true); };
  const startSale = (property: any) => { setSale({ ...emptySale(), propertyId: String(property.id), amount: String(property.salePrice || "") }); setOpenSale(true); };

  const saveFinance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!finance.interestRate && !finance.installmentAmount) return toast.error("Informe a taxa de juros ou o valor desejado da parcela.");
    if (finance.installmentAmount && calculation.total < calculation.principal) return toast.error("O valor da parcela não cobre o principal financiado.");
    try {
      const result = await post({ action: "create_financing", ...finance });
      const rate = Number(result.calculatedInterestRate ?? (finance.interestRate || 0));
      const installment = Number(result.calculatedInstallmentAmount ?? (finance.installmentAmount || 0));
      toast.success(`Financiamento criado: ${rate.toFixed(4)}% a.m. · parcela ${money(installment)}.`);
      setOpenFinance(false); setFinance(emptyFinancing()); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao financiar imóvel."); }
  };

  const saveSale = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await post({ action: "sell_cash", ...sale }); toast.success("Venda registrada e valor lançado no caixa."); setOpenSale(false); setSale(emptySale()); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao vender imóvel."); }
  };

  const payFinancing = async (financing: any) => {
    const paid = (data.financingPayments || []).filter((p: any) => Number(p.financingId) === Number(financing.id)).map((p: any) => Number(p.installmentNumber));
    let next = 1; while (paid.includes(next) && next <= Number(financing.installments)) next++;
    if (next > Number(financing.installments)) return toast.info("Todas as parcelas já foram pagas.");
    if (!window.confirm(`Registrar a parcela ${next}/${financing.installments} de ${money(financing.installmentAmount)}?`)) return;
    try { await post({ action: "pay_financing", financingId: financing.id, installmentNumber: next, amount: financing.installmentAmount }); toast.success("Parcela recebida e lançada no caixa."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao registrar parcela."); }
  };

  const cancelFinancing = async (financing: any) => {
    if (!window.confirm(`Cancelar o financiamento de ${financing.propertyTitle}? O imóvel voltará a ficar disponível e o histórico financeiro será preservado.`)) return;
    try { await post({ action: "cancel_financing", financingId: financing.id }); toast.success("Financiamento cancelado. O imóvel voltou a ficar disponível."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao cancelar financiamento."); }
  };

  const deleteFinancing = async (financing: any) => {
    if (!window.confirm(`Excluir definitivamente o financiamento de ${financing.propertyTitle}? Esta ação não poderá ser desfeita.`)) return;
    try { await post({ action: "delete_financing", financingId: financing.id }); toast.success("Financiamento excluído."); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao excluir financiamento."); }
  };

  const AgentFields = ({ target }: { target: "finance" | "sale" }) => {
    const value = target === "finance" ? finance : sale;
    return <>
      <div><Label>Agente comissionado</Label><Select value={value.agentId || "none"} onValueChange={selected => chooseAgent(target, selected)}><SelectTrigger><SelectValue placeholder="Sem agente" /></SelectTrigger><SelectContent><SelectItem value="none">Sem agente comissionado</SelectItem>{data.agents?.map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name} · {Number(agent.defaultCommissionPercentage || 0).toFixed(2)}%</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Comissão (%)</Label><Input type="number" min="0" max="100" step="0.01" value={value.commissionPercentage} disabled={!value.agentId} onChange={event => target === "finance" ? setFinance(current => ({ ...current, commissionPercentage: event.target.value })) : setSale(current => ({ ...current, commissionPercentage: event.target.value }))} /></div>
    </>;
  };

  return <DashboardLayout><div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Building2 className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Imóveis</h1></div><p className="mt-1 text-muted-foreground">Casas, apartamentos, terrenos e lojas para aluguel, venda ou financiamento.</p></div>{user?.canInsert && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo imóvel</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Cadastrar imóvel</DialogTitle></DialogHeader><form onSubmit={saveProperty} className="grid gap-4 sm:grid-cols-2">
      <div><Label>Identificação *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
      <div><Label>Categoria *</Label><Select value={form.type} onValueChange={value => setForm({ ...form, type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="casa">Casa</SelectItem><SelectItem value="apartamento">Apartamento</SelectItem><SelectItem value="terreno">Terreno</SelectItem><SelectItem value="loja">Loja</SelectItem></SelectContent></Select></div>
      <div className="sm:col-span-2"><Label>Endereço *</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required /></div>
      <div><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} /></div><div><Label>Cidade</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
      <div><Label>Estado</Label><Input maxLength={2} value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div><div><Label>CEP</Label><Input value={form.zipCode} onChange={e => setForm({ ...form, zipCode: e.target.value })} /></div>
      <div><Label>Área (m²)</Label><Input type="number" min="0" step="0.01" value={form.areaM2} onChange={e => setForm({ ...form, areaM2: e.target.value })} /></div><div><Label>Valor de venda</Label><Input type="number" min="0" step="0.01" value={form.salePrice} onChange={e => setForm({ ...form, salePrice: e.target.value })} /></div>
      {[["rooms","Cômodos"],["bedrooms","Quartos"],["livingRooms","Salas"],["kitchens","Cozinhas"],["bathrooms","Banheiros"],["garages","Vagas de garagem"]].map(([key,label]) => <div key={key}><Label>{label}</Label><Input type="number" min="0" step="1" value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>)}
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={form.hasGarage} onChange={e => setForm({ ...form, hasGarage: e.target.checked })} /> Possui garagem</label>
      <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit">Salvar imóvel</Button></div>
    </form></DialogContent></Dialog>}</div>

    <div className="grid gap-3 sm:grid-cols-5">{[["Cadastrados",summary.total],["Disponíveis",summary.available],["Alugados",summary.rented],["Financiados",summary.financed],["Vendidos",summary.sold]].map(([label,value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div>

    {loading ? <div className="py-16 text-center text-muted-foreground">Carregando imóveis...</div> : data.properties.length === 0 ? <Card><CardContent className="py-16 text-center"><Home className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-semibold">Nenhum imóvel cadastrado</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{data.properties.map((property: any) => <Card key={property.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{property.title}</h3><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase">{property.status}</span></div><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{property.address}</p></div><span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{typeLabel[property.type] || property.type}</span></div>{property.salePrice && <div className="mt-4 rounded-xl bg-muted/40 p-3"><span className="text-xs text-muted-foreground">Valor de venda</span><div className="text-xl font-bold">{money(property.salePrice)}</div></div>}<div className="mt-4 flex flex-wrap gap-2">{user?.canInsert && property.status === "disponivel" && <><Button size="sm" onClick={() => startFinance(property)}><WalletCards className="mr-2 h-4 w-4" />Financiar</Button><Button size="sm" variant="secondary" onClick={() => startSale(property)}><BadgeDollarSign className="mr-2 h-4 w-4" />Vender à vista</Button></>}{user?.canDelete && <Button size="sm" variant="outline" className="text-destructive" onClick={() => removeProperty(property.id)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}</div></CardContent></Card>)}</div>}

    {data.financings?.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary" />Financiamentos de imóveis</CardTitle></CardHeader><CardContent className="space-y-3">{data.financings.map((financing: any) => { const paid = (data.financingPayments || []).filter((p: any) => Number(p.financingId) === Number(financing.id)).length; return <div key={financing.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{financing.propertyTitle}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${financing.status === "ativo" ? "bg-emerald-100 text-emerald-700" : financing.status === "cancelado" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{financing.status}</span></div><p className="text-sm text-muted-foreground">Cliente: {financing.clientName} · {paid}/{financing.installments} parcelas pagas</p>{financing.agentName && <p className="mt-1 flex items-center gap-1 text-xs text-primary"><UserRound className="h-3.5 w-3.5" />Agente: {financing.agentName} · {Number(financing.commissionPercentage || 0).toFixed(2)}%</p>}</div><div className="text-right"><p className="font-semibold">{money(financing.installmentAmount)} / parcela</p><p className="text-xs text-muted-foreground">Taxa: {Number(financing.interestRate || 0).toFixed(4)}% a.m.</p></div></div><div className="mt-3 flex flex-wrap justify-end gap-2">{user?.canEdit && financing.status === "ativo" && <><Button size="sm" onClick={() => payFinancing(financing)}>Registrar próxima parcela</Button><Button size="sm" variant="outline" onClick={() => cancelFinancing(financing)}>Cancelar financiamento</Button></>}{user?.canDelete && <Button size="sm" variant="outline" className="text-destructive" onClick={() => deleteFinancing(financing)}><Trash2 className="mr-2 h-4 w-4" />Excluir financiamento</Button>}</div>{Number(financing.downPayment || 0) > 0 || paid > 0 ? <p className="mt-2 text-right text-[11px] text-muted-foreground">Financiamentos com entrada ou parcelas pagas podem ser cancelados, mas não excluídos, para preservar o histórico financeiro.</p> : null}</div>; })}</CardContent></Card>}

    <Dialog open={openFinance} onOpenChange={setOpenFinance}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Financiamento de imóvel</DialogTitle></DialogHeader><form onSubmit={saveFinance} className="grid gap-4 sm:grid-cols-2">
      <div><Label>Cliente *</Label><Select value={finance.clientId} onValueChange={value => setFinance({ ...finance, clientId: value })}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{data.clients.map((client: any) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Valor da venda *</Label><Input type="number" min="0.01" step="0.01" value={finance.salePrice} onChange={e => setFinance({ ...finance, salePrice: e.target.value })} required /></div>
      <div><Label>Entrada *</Label><Input type="number" min="0" step="0.01" value={finance.downPayment} onChange={e => setFinance({ ...finance, downPayment: e.target.value })} required /></div>
      <div><Label>Número de parcelas *</Label><Input type="number" min="1" step="1" value={finance.installments} onChange={e => setFinance({ ...finance, installments: e.target.value })} required /></div>
      <div><Label>Juros ao mês (%)</Label><Input type="number" min="0" step="0.0001" value={finance.interestRate} onChange={e => setFinance({ ...finance, interestRate: e.target.value, installmentAmount: e.target.value ? "" : finance.installmentAmount })} placeholder="Informe a taxa" /></div>
      <div><Label>Ou valor desejado da parcela</Label><Input type="number" min="0.01" step="0.01" value={finance.installmentAmount} onChange={e => setFinance({ ...finance, installmentAmount: e.target.value, interestRate: e.target.value ? "" : finance.interestRate })} placeholder="Informe a parcela" /></div>
      <div><Label>Data inicial *</Label><Input type="date" value={finance.startDate} onChange={e => setFinance({ ...finance, startDate: e.target.value })} required /></div>
      <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-sm"><div className="flex items-center gap-2 font-semibold text-blue-800"><Percent className="h-4 w-4" />Cálculo inteligente</div><p className="mt-1 text-blue-700">Informe <b>a taxa</b> e o Note Note calcula a parcela. Ou deixe a taxa vazia, informe <b>a parcela que deseja receber</b> e o sistema calcula a taxa mensal equivalente.</p></div>
      <div className="sm:col-span-2 grid gap-2 rounded-xl border bg-muted/30 p-4 sm:grid-cols-4"><div><span className="text-xs text-muted-foreground">Financiado</span><b className="block">{money(calculation.principal)}</b></div><div><span className="text-xs text-muted-foreground">Taxa</span><b className="block">{calculation.rate.toFixed(4)}% a.m.</b></div><div><span className="text-xs text-muted-foreground">Total</span><b className="block">{money(calculation.total)}</b></div><div><span className="text-xs text-muted-foreground">Parcela</span><b className="block">{money(calculation.installment)}</b></div></div>
      <AgentFields target="finance" />
      <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={finance.notes} onChange={e => setFinance({ ...finance, notes: e.target.value })} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpenFinance(false)}>Cancelar</Button><Button type="submit">Criar financiamento</Button></div>
    </form></DialogContent></Dialog>

    <Dialog open={openSale} onOpenChange={setOpenSale}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Venda de imóvel à vista</DialogTitle></DialogHeader><form onSubmit={saveSale} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Cliente *</Label><Select value={sale.clientId} onValueChange={value => setSale({ ...sale, clientId: value })}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{data.clients.map((client: any) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="sm:col-span-2"><Label>Valor da venda *</Label><Input type="number" min="0.01" step="0.01" value={sale.amount} onChange={e => setSale({ ...sale, amount: e.target.value })} required /></div>
      <AgentFields target="sale" />
      <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={sale.notes} onChange={e => setSale({ ...sale, notes: e.target.value })} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpenSale(false)}>Cancelar</Button><Button type="submit">Confirmar venda</Button></div>
    </form></DialogContent></Dialog>
  </div></DashboardLayout>;
}
