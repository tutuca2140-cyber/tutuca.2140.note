import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Package, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  category: "",
  sku: "",
  cost: "",
  price: "",
  notes: "",
};
const money = (value: number | string) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function Produtos() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const { data: items = [], isLoading } = trpc.vehicles.list.useQuery();
  const createProduct = trpc.vehicles.create.useMutation();
  const deleteProduct = trpc.vehicles.delete.useMutation();
  const utils = trpc.useUtils();
  const products = items.filter(
    item =>
      item.vehicleType === "PRODUTO" &&
      `${item.model} ${item.brand ?? ""} ${item.plate ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createProduct.mutateAsync({
        vehicleType: "PRODUTO",
        model: form.name.trim(),
        brand: form.category.trim() || undefined,
        plate: form.sku.trim().toUpperCase() || undefined,
        purchasePrice: form.cost || "0",
        salePrice: form.price,
        price: form.price,
        description: form.notes.trim() || undefined,
      });
      await utils.vehicles.list.invalidate();
      setForm(emptyForm);
      setOpen(false);
      toast.success("Produto disponível para financiamento.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o produto."
      );
    }
  }

  async function remove(id: number, name: string) {
    if (
      !window.confirm(
        `Excluir definitivamente o produto “${name}” e seus vínculos financeiros?`
      )
    )
      return;
    try {
      await deleteProduct.mutateAsync({ id });
      await Promise.all([
        utils.vehicles.list.invalidate(),
        utils.vehicleFinancings.list.invalidate(),
        utils.payments.list.invalidate(),
        utils.cashFlow.list.invalidate(),
      ]);
      toast.success("Produto excluído definitivamente.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o produto."
      );
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Estoque
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
            <p className="mt-2 text-muted-foreground">
              Cadastre produtos e venda usando o mesmo financiamento, parcelas e
              pagamentos dos veículos.
            </p>
          </div>
          {user?.canInsert ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo produto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cadastrar produto</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="product-name">Nome *</Label>
                      <Input
                        id="product-name"
                        value={form.name}
                        onChange={e =>
                          setForm(c => ({ ...c, name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-category">Marca/categoria</Label>
                      <Input
                        id="product-category"
                        value={form.category}
                        onChange={e =>
                          setForm(c => ({ ...c, category: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-sku">Código/SKU</Label>
                      <Input
                        id="product-sku"
                        value={form.sku}
                        onChange={e =>
                          setForm(c => ({ ...c, sku: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-cost">Valor de compra</Label>
                      <Input
                        id="product-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.cost}
                        onChange={e =>
                          setForm(c => ({ ...c, cost: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="product-price">Valor de venda *</Label>
                      <Input
                        id="product-price"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.price}
                        onChange={e =>
                          setForm(c => ({ ...c, price: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="product-notes">Observações</Label>
                      <Textarea
                        id="product-notes"
                        value={form.notes}
                        onChange={e =>
                          setForm(c => ({ ...c, notes: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createProduct.isPending}>
                      {createProduct.isPending
                        ? "Salvando..."
                        : "Salvar produto"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Buscar nome, categoria ou código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-muted-foreground">
            Carregando produtos...
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map(product => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <Package className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">{product.model}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {product.brand || "Sem categoria"}
                        {product.plate ? ` · ${product.plate}` : ""}
                      </p>
                    </div>
                  </div>
                  {user?.role === "super_admin" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${product.model}`}
                      onClick={() => remove(product.id, product.model)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Venda</p>
                  <p className="font-semibold">
                    {money(product.salePrice ?? product.price)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold capitalize">{product.status}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!isLoading && !products.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum produto cadastrado.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
