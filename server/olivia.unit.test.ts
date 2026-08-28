import { describe, expect, it } from "vitest";
import { clientMatchesPrompt } from "./olivia";

const client = {
  name: "João da Silva",
  phone: "(24) 99999-1234",
  whatsapp: "(24) 98888-4321",
  cpf: "123.456.789-00",
};

describe("busca segura de clientes da Olivia", () => {
  it("localiza pelo nome mesmo sem acentos", () => {
    expect(clientMatchesPrompt(client, "Mostre os contratos do Joao")).toBe(
      true
    );
  });

  it("localiza por telefone ou CPF", () => {
    expect(clientMatchesPrompt(client, "cliente 999991234")).toBe(true);
    expect(clientMatchesPrompt(client, "CPF 12345678900")).toBe(true);
  });

  it("não transforma palavras genéricas em identificação", () => {
    expect(clientMatchesPrompt(client, "Quais parcelas estão atrasadas?")).toBe(
      false
    );
  });
});
