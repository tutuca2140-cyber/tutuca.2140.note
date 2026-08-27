import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Bot, Check, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Draft = {
  enabled: boolean;
  allowClientQueries: boolean;
  allowContractQueries: boolean;
  allowPaymentQueries: boolean;
  allowDueDateQueries: boolean;
  allowSummaries: boolean;
  allowChanges: boolean;
  requireConfirmation: boolean;
};

const initial: Draft = {
  enabled: true,
  allowClientQueries: true,
  allowContractQueries: true,
  allowPaymentQueries: true,
  allowDueDateQueries: true,
  allowSummaries: true,
  allowChanges: false,
  requireConfirmation: true,
};

const permissions: Array<{
  key: keyof Draft;
  label: string;
  description: string;
}> = [
  {
    key: "enabled",
    label: "Olivia ativa",
    description: "Disponibiliza a assistente para usuários autorizados.",
  },
  {
    key: "allowClientQueries",
    label: "Consultar clientes",
    description: "Nomes, contatos e cadastros do banco selecionado.",
  },
  {
    key: "allowContractQueries",
    label: "Consultar contratos",
    description: "Empréstimos e financiamentos autorizados.",
  },
  {
    key: "allowPaymentQueries",
    label: "Consultar pagamentos",
    description: "Parcelas pagas e histórico financeiro.",
  },
  {
    key: "allowDueDateQueries",
    label: "Consultar vencimentos",
    description: "Parcelas de hoje, próximas e atrasadas.",
  },
  {
    key: "allowSummaries",
    label: "Gerar resumos",
    description: "Totais pagos, atrasados, em aberto e a receber.",
  },
  {
    key: "allowChanges",
    label: "Solicitar alterações",
    description:
      "Prepara ações dos planos superiores; nenhuma ocorre sem confirmação.",
  },
  {
    key: "requireConfirmation",
    label: "Exigir confirmação",
    description: "Bloqueio obrigatório antes de qualquer alteração.",
  },
];

const plans = [
  {
    name: "Basic",
    description: "Consultas e resumos",
    features: [
      "Chat interno",
      "Clientes e contratos",
      "Parcelas e vencimentos",
      "Resumos financeiros",
    ],
  },
  {
    name: "Basic +",
    description: "Consultas ampliadas",
    features: [
      "Tudo do Basic",
      "Histórico de ações",
      "Consultas operacionais ampliadas",
      "Preparado para ações confirmadas",
    ],
  },
  {
    name: "Plus",
    description: "Controle completo",
    features: [
      "Tudo do Basic +",
      "Ações permitidas pelo Super ADM",
      "Confirmação obrigatória",
      "Auditoria completa",
    ],
  },
];

export default function AdminConfiguracoes() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { data } = trpc.olivia.settings.useQuery(undefined, {
    enabled: isSuperAdmin,
  });
  const update = trpc.olivia.updateSettings.useMutation();
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (!data) return;
    setDraft({
      enabled: data.enabled,
      allowClientQueries: data.allowClientQueries,
      allowContractQueries: data.allowContractQueries,
      allowPaymentQueries: data.allowPaymentQueries,
      allowDueDateQueries: data.allowDueDateQueries,
      allowSummaries: data.allowSummaries,
      allowChanges: data.allowChanges,
      requireConfirmation: data.requireConfirmation,
    });
  }, [data]);

  const save = async () => {
    if (draft.allowChanges && !draft.requireConfirmation)
      return toast.error(
        "Alterações pela Olivia exigem confirmação obrigatória."
      );
    try {
      await update.mutateAsync(draft);
      toast.success("Configurações da Olivia salvas.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar."
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="mt-2 text-muted-foreground">
            Controle central da assistente virtual e das regras do sistema.
          </p>
        </div>
        {!isSuperAdmin ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <p>Somente o Super Administrador pode configurar a Olivia.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Olivia — planos disponíveis
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {plans.map((plan, index) => (
                  <div
                    key={plan.name}
                    className={`rounded-xl border p-5 ${index === 2 ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {index === 0 && <Badge>Versão inicial</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                    <div className="mt-4 space-y-2">
                      {plan.features.map(feature => (
                        <p
                          key={feature}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Check className="h-4 w-4 text-primary" />
                          {feature}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LockKeyhole className="h-5 w-5 text-primary" />
                  Permissões globais da Olivia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Estas regras limitam todos os planos. As permissões
                  individuais e os bancos vinculados ao usuário continuam
                  prevalecendo.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {permissions.map(permission => (
                    <div
                      key={permission.key}
                      className="flex items-start justify-between gap-4 rounded-xl border p-4"
                    >
                      <Label
                        htmlFor={`olivia-${permission.key}`}
                        className="cursor-pointer leading-normal"
                      >
                        <span className="block font-medium">
                          {permission.label}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {permission.description}
                        </span>
                      </Label>
                      <Switch
                        id={`olivia-${permission.key}`}
                        checked={draft[permission.key]}
                        onCheckedChange={checked =>
                          setDraft(current => ({
                            ...current,
                            [permission.key]: checked,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={save} disabled={update.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {update.isPending ? "Salvando..." : "Salvar configurações"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-start gap-3 py-5">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Segurança por padrão</p>
                  <p className="text-sm text-muted-foreground">
                    A chave de IA fica somente no servidor. A Olivia recebe
                    apenas os dados autorizados do banco ativo e registra as
                    consultas na auditoria.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
