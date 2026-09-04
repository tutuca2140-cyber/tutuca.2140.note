import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Car, CreditCard, Package, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

const normalize = (value: unknown) =>
  String(value || "").toLocaleLowerCase("pt-BR");

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data: clients = [] } = trpc.clients.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: loans = [] } = trpc.loans.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: financings = [] } = trpc.vehicleFinancings.list.useQuery(
    undefined,
    { enabled: open }
  );
  const { data: vehicles = [] } = trpc.vehicles.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: products = [] } = trpc.products.list.useQuery(undefined, {
    enabled: open,
  });

  const results = useMemo(() => {
    const term = normalize(query.trim());
    if (term.length < 2) return [];
    const clientName = (id: number) =>
      clients.find(client => client.id === id)?.name || `Cliente #${id}`;
    return [
      ...clients
        .filter(client =>
          [client.name, client.email, client.phone, client.whatsapp].some(
            value => normalize(value).includes(term)
          )
        )
        .map(client => ({
          key: `client-${client.id}`,
          title: client.name,
          detail: client.phone || client.email || "Cliente",
          href: "/clientes",
          icon: Users,
        })),
      ...loans
        .filter(loan =>
          normalize(`${loan.id} ${clientName(loan.clientId)}`).includes(term)
        )
        .map(loan => ({
          key: `loan-${loan.id}`,
          title: `Empréstimo #${loan.id}`,
          detail: clientName(loan.clientId),
          href: "/emprestimos",
          icon: CreditCard,
        })),
      ...financings
        .filter(item =>
          normalize(`${item.id} ${clientName(item.clientId)}`).includes(term)
        )
        .map(item => ({
          key: `financing-${item.id}`,
          title: `Financiamento #${item.id}`,
          detail: clientName(item.clientId),
          href: "/financiamentos",
          icon: CreditCard,
        })),
      ...vehicles
        .filter(vehicle =>
          normalize(
            `${vehicle.brand} ${vehicle.model} ${vehicle.plate}`
          ).includes(term)
        )
        .map(vehicle => ({
          key: `vehicle-${vehicle.id}`,
          title: `${vehicle.brand} ${vehicle.model}`,
          detail: vehicle.plate || "Veículo",
          href: "/veiculos",
          icon: Car,
        })),
      ...products
        .filter(product =>
          normalize(`${product.name} ${product.description}`).includes(term)
        )
        .map(product => ({
          key: `product-${product.id}`,
          title: product.name,
          detail: "Produto",
          href: "/produtos",
          icon: Package,
        })),
    ].slice(0, 12);
  }, [clients, financings, loans, products, query, vehicles]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground"
        >
          <Search className="h-4 w-4" />
          Buscar no sistema
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Busca rápida</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cliente, telefone, contrato, veículo ou produto..."
            className="pl-10"
          />
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres.
            </p>
          ) : results.length ? (
            results.map(result => {
              const Icon = result.icon;
              return (
                <Link key={result.key} href={result.href}>
                  <a
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
                  >
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {result.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.detail}
                      </span>
                    </span>
                  </a>
                </Link>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
