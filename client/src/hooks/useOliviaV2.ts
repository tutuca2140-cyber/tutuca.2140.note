import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

const INTERESTED_KEY = "note-note:olivia-interested:v2";

type V2Result = { reply: string; category: string } | null;

type UnknownRow = Record<string, unknown>;

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const parseAmount = (text: string) => {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil|k)?/i);
  if (!match) return null;
  let value = Number(match[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  if (match[2]) value *= 1000;
  return value;
};

const parsePeriods = (text: string) => {
  const match = text.match(/(\d{1,3})\s*(?:mes(?:es)?|parcelas?|x)\b/i);
  return match ? Math.max(1, Number(match[1])) : null;
};

const parseRates = (text: string) =>
  [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
    .map(match => Number(match[1].replace(",", ".")))
    .filter(value => Number.isFinite(value) && value >= 0);

const calculate = (principal: number, ratePercent: number, periods: number, compound: boolean) => {
  const rate = ratePercent / 100;
  const total = compound
    ? principal * Math.pow(1 + rate, periods)
    : principal * (1 + rate * periods);
  const totalAmount = roundMoney(total);
  return {
    principal: roundMoney(principal),
    totalAmount,
    interest: roundMoney(totalAmount - principal),
    installment: roundMoney(totalAmount / periods),
  };
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const loadInterested = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(INTERESTED_KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const saveInterested = (values: string[]) => {
  localStorage.setItem(INTERESTED_KEY, JSON.stringify(Array.from(new Set(values))));
};

export function useOliviaV2(enabled: boolean) {
  const { data: clients = [] } = trpc.clients.list.useQuery(undefined, { enabled });
  const { data: loans = [] } = trpc.loans.list.useQuery(undefined, { enabled });
  const { data: payments = [] } = trpc.payments.list.useQuery(undefined, { enabled });
  const { data: financings = [] } = trpc.vehicleFinancings.list.useQuery(undefined, { enabled });
  const { data: cashFlow = [] } = trpc.cashFlow.list.useQuery(undefined, { enabled });

  const tryHandle = useCallback((message: string): V2Result => {
    if (!enabled) return null;
    const text = normalize(message);

    if (/\b(interessad[oa]s?|lead|prospect)\b/.test(text)) {
      if (/\b(listar|mostrar|quem|quais)\b/.test(text)) {
        const names = loadInterested();
        return {
          category: "commercial_leads",
          reply: names.length
            ? `Clientes interessados acompanhados neste dispositivo:\n${names.map(name => `• ${name}`).join("\n")}`
            : "Ainda não há clientes marcados como interessados neste dispositivo.",
        };
      }
      const match = message.match(/(?:marcar|acompanhar|adicionar|registrar)\s+(.+?)\s+como\s+interessad[oa]/i)
        ?? message.match(/interessad[oa]\s*[:\-]\s*(.+)$/i);
      if (match?.[1]) {
        const name = match[1].trim();
        const names = loadInterested();
        saveInterested([...names, name]);
        return {
          category: "commercial_leads",
          reply: `${name} foi marcado como interessado para acompanhamento pela Olivia neste dispositivo. Nenhuma informação financeira ou cadastral foi alterada no Note Note.`,
        };
      }
    }

    const wantsProposal = /\b(proposta|orcamento comercial)\b/.test(text);
    const wantsSimulation = /\b(simul|calcular parcel|emprestimo|financiamento|juros simples|juros compost)/.test(text);
    const wantsCompare = /\b(compar|cenario|taxas?|prazos?)\b/.test(text) && /%|mes|parcela/.test(text);

    if (wantsSimulation || wantsProposal || wantsCompare) {
      const amount = parseAmount(text);
      const periods = parsePeriods(text);
      const rates = parseRates(text);
      const rate = rates[0] ?? null;
      if (!amount || !periods || rate === null) {
        return {
          category: "commercial_simulation",
          reply:
            "Para simular ou criar uma proposta, informe valor, prazo e taxa. Exemplo: “Simule R$ 10.000 em 12 meses a 3% ao mês com juros compostos”. A simulação é apenas informativa e nunca representa aprovação automática de crédito.",
        };
      }

      const compoundRequested = /compost/.test(text);
      const simpleRequested = /simples/.test(text);
      const scenarios = wantsCompare && rates.length > 1
        ? rates.flatMap(r => [
            { rate: r, compound: false, label: "simples" },
            { rate: r, compound: true, label: "compostos" },
          ])
        : simpleRequested
          ? [{ rate, compound: false, label: "simples" }]
          : compoundRequested
            ? [{ rate, compound: true, label: "compostos" }]
            : [
                { rate, compound: false, label: "simples" },
                { rate, compound: true, label: "compostos" },
              ];

      const rows = scenarios.map(scenario => {
        const plan = calculate(amount, scenario.rate, periods, scenario.compound);
        return `• ${scenario.rate}% a.m. · juros ${scenario.label}: ${periods}x de ${money(plan.installment)} · juros ${money(plan.interest)} · total ${money(plan.totalAmount)}`;
      });

      const title = wantsProposal ? "Proposta comercial simulada" : wantsCompare ? "Comparação de cenários" : "Simulação comercial";
      return {
        category: wantsProposal ? "commercial_proposal" : wantsCompare ? "commercial_compare" : "commercial_simulation",
        reply:
          `${title}\nValor: ${money(amount)}\nPrazo: ${periods} meses\n${rows.join("\n")}\n\nObservação: esta é uma simulação informativa. A Olivia não concede, aprova ou libera crédito automaticamente; a decisão final é humana e deve seguir as regras definidas pelo administrador.`,
      };
    }

    if (/\b(cobranca|cobrar|negociacao|negociar|acordo)\b/.test(text)) {
      const overdue = (payments as UnknownRow[]).filter(payment => normalize(payment.status) === "atrasado");
      const total = overdue.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return {
        category: "commercial_collection",
        reply: overdue.length
          ? `Há ${overdue.length} parcela(s) marcada(s) como atrasada(s), somando ${money(total)}. Sugestão: priorize contato cordial, confirme o motivo do atraso e ofereça somente alternativas autorizadas pelo administrador. A Olivia não altera vencimentos, juros, descontos ou condições sem uma operação humana autorizada.`
          : "Não encontrei parcelas marcadas como atrasadas nos dados atualmente autorizados. Posso sugerir uma mensagem de cobrança preventiva sem alterar nenhum dado.",
      };
    }

    if (/\b(risco|duplicad|pagamento.*duas|contrato.*sem parcela|fora do padrao|movimentacao incomum|anomali|inconsisten)\b/.test(text)) {
      const alerts: string[] = [];
      const clientRows = clients as UnknownRow[];
      const paymentRows = payments as UnknownRow[];
      const loanRows = loans as UnknownRow[];
      const financingRows = financings as UnknownRow[];
      const cashRows = cashFlow as UnknownRow[];

      const clientKeys = new Map<string, UnknownRow[]>();
      for (const client of clientRows) {
        const key = [normalize(client.name), normalize(client.phone || client.whatsapp)].filter(Boolean).join("|");
        if (!key) continue;
        clientKeys.set(key, [...(clientKeys.get(key) ?? []), client]);
      }
      const duplicateClients = [...clientKeys.values()].filter(group => group.length > 1);
      if (duplicateClients.length) alerts.push(`Cadastros possivelmente duplicados: ${duplicateClients.length} grupo(s).`);

      const paymentKeys = new Map<string, number>();
      for (const payment of paymentRows) {
        const date = payment.paymentDate ? new Date(String(payment.paymentDate)).toISOString().slice(0, 10) : "";
        const key = [payment.loanId ?? "", payment.vehicleFinancingId ?? "", payment.installmentNumber ?? "", Number(payment.amount || 0).toFixed(2), date].join("|");
        paymentKeys.set(key, (paymentKeys.get(key) ?? 0) + 1);
      }
      const duplicatePayments = [...paymentKeys.values()].filter(count => count > 1).length;
      if (duplicatePayments) alerts.push(`Pagamentos possivelmente lançados em duplicidade: ${duplicatePayments} ocorrência(s).`);

      const contractsWithoutInstallments = [...loanRows, ...financingRows].filter(row => !Number(row.installments || 0));
      if (contractsWithoutInstallments.length) alerts.push(`Contratos sem quantidade válida de parcelas: ${contractsWithoutInstallments.length}.`);

      const invalidDatesOrValues = paymentRows.filter(row => {
        const amount = Number(row.amount || 0);
        const due = row.dueDate ? new Date(String(row.dueDate)) : null;
        return !Number.isFinite(amount) || amount <= 0 || (due ? Number.isNaN(due.getTime()) : true);
      });
      if (invalidDatesOrValues.length) alerts.push(`Pagamentos com valor ou data fora do padrão mínimo: ${invalidDatesOrValues.length}.`);

      const cashValues = cashRows.map(row => Math.abs(Number(row.amount || 0))).filter(value => value > 0);
      const cashMedian = median(cashValues);
      const unusualCash = cashMedian > 0
        ? cashRows.filter(row => Math.abs(Number(row.amount || 0)) > cashMedian * 4)
        : [];
      if (unusualCash.length) alerts.push(`Movimentações muito acima do padrão recente: ${unusualCash.length}.`);

      return {
        category: "risk_review",
        reply: alerts.length
          ? `Revisão preventiva de riscos:\n${alerts.map(alert => `• ${alert}`).join("\n")}\n\nEsses alertas indicam pontos para conferência humana; não bloqueiam operações nem concedem ou recusam crédito automaticamente.`
          : "Não identifiquei alertas evidentes nas verificações preventivas disponíveis. Isso não substitui análise humana nem representa aprovação de crédito.",
      };
    }

    return null;
  }, [cashFlow, clients, enabled, financings, loans, payments]);

  return { tryHandle };
}
