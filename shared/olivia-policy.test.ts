import { describe, expect, it } from "vitest";
import {
  getAllowedOliviaActions,
  isForbiddenOliviaAdministrativeRequest,
} from "./olivia-policy";

describe("Olivia immutable authority policy", () => {
  it("blocks all mutations for dashboard-only users", () => {
    expect(getAllowedOliviaActions({ canInsert: true, canEdit: true, dashboardOnly: true })).toEqual([]);
  });

  it("never grants edit actions from insert permission alone", () => {
    expect(getAllowedOliviaActions({ canInsert: true, canEdit: false })).toEqual([
      "create_client",
      "create_loan",
      "record_payment",
    ]);
  });

  it("grants only update-client from edit permission alone", () => {
    expect(getAllowedOliviaActions({ canInsert: false, canEdit: true })).toEqual([
      "update_client",
    ]);
  });

  it("recognizes administrative and destructive requests as forbidden", () => {
    expect(isForbiddenOliviaAdministrativeRequest("excluir cliente")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("criar usuário novo")).toBe(true);
    expect(isForbiddenOliviaAdministrativeRequest("mudar permissões do usuário")).toBe(true);
  });

  it("does not block ordinary operational requests", () => {
    expect(isForbiddenOliviaAdministrativeRequest("registrar pagamento da parcela 4")).toBe(false);
  });
});
