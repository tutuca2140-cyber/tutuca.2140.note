import { describe, expect, it } from "vitest";
import { isManualCashFlowEntry } from "./db";

const manualEntry = {
  sourceKey: null,
  paymentId: null,
  loanId: null,
  vehicleId: null,
  vehicleSaleId: null,
  category: "OUTROS",
};

describe("proteção dos lançamentos do caixa", () => {
  it("reconhece uma entrada criada diretamente no caixa", () => {
    expect(isManualCashFlowEntry(manualEntry)).toBe(true);
  });

  it("protege lançamentos com vínculo ou chave automática", () => {
    expect(isManualCashFlowEntry({ ...manualEntry, loanId: 10 })).toBe(false);
    expect(isManualCashFlowEntry({ ...manualEntry, sourceKey: "PAYMENT:20" })).toBe(false);
  });

  it("protege categorias automáticas legadas mesmo sem vínculo", () => {
    expect(isManualCashFlowEntry({ ...manualEntry, category: "LIBERACAO_EMPRESTIMO" })).toBe(false);
    expect(isManualCashFlowEntry({ ...manualEntry, category: "VENDA_VEICULO" })).toBe(false);
  });
});
