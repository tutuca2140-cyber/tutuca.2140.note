import { trpc } from "@/lib/trpc";
import { useState } from "react";

type PendingAction = {
  action: "create_client" | "update_client" | "create_loan" | "record_payment";
  payload: any;
  summary: string;
};

export function useOliviaActions(enabled: boolean) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const createClient = trpc.clients.create.useMutation();
  const updateClient = trpc.clients.update.useMutation();
  const createLoan = trpc.loans.create.useMutation();
  const createPayment = trpc.payments.create.useMutation();

  const plan = async (message: string) => {
    if (!enabled) return null;
    const response = await fetch("/api/olivia-action-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.blocked || data.question) return data;
    if (data.action && data.payload && data.summary) {
      const next = data as PendingAction;
      setPending(next);
      return {
        ...data,
        reply: `${data.summary}\n\nSe estiver correto, responda **CONFIRMAR**. Qualquer outra resposta cancela esta ação.`,
      };
    }
    return data;
  };

  const cancel = () => setPending(null);

  const confirm = async () => {
    const current = pending;
    if (!current) return null;
    setPending(null);
    switch (current.action) {
      case "create_client":
        await createClient.mutateAsync(current.payload);
        return "Pronto. O cliente foi cadastrado com sucesso.";
      case "update_client":
        await updateClient.mutateAsync(current.payload);
        return "Pronto. Os dados do cliente foram atualizados com sucesso.";
      case "create_loan":
        await createLoan.mutateAsync(current.payload);
        return "Pronto. O empréstimo foi criado com sucesso.";
      case "record_payment":
        await createPayment.mutateAsync(current.payload);
        return "Pronto. O pagamento foi registrado com sucesso.";
      default:
        return null;
    }
  };

  return {
    pending,
    plan,
    confirm,
    cancel,
    isPending:
      createClient.isPending || updateClient.isPending || createLoan.isPending || createPayment.isPending,
  };
}
