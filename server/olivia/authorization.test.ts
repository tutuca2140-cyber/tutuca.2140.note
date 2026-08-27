import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertOliviaActionAllowed,
  assertOliviaDatabaseAllowed,
  getOliviaCapabilities,
  type OliviaUserContext,
} from "./authorization";

const baseUser: OliviaUserContext = {
  id: 10,
  role: "user",
  username: "operador",
  canView: true,
  canInsert: false,
  canEdit: false,
  canDelete: true,
  canGenerateReports: true,
  canAccessSettings: false,
  dashboardOnly: false,
};

describe("Olivia authorization", () => {
  it("inherits user permissions and never exposes delete", () => {
    expect(getOliviaCapabilities(baseUser)).toMatchObject({
      canView: true,
      canInsert: false,
      canEdit: false,
      canDelete: false,
      canGenerateReports: true,
      canAccessSettings: false,
    });
  });

  it("blocks an action the logged user cannot execute", () => {
    expect(() => assertOliviaActionAllowed(baseUser, "insert")).toThrow(TRPCError);
  });

  it("blocks delete even when the logged user has canDelete", () => {
    expect(() => assertOliviaActionAllowed(baseUser, "delete")).toThrow(
      "A Olivia não pode excluir informações"
    );
  });

  it("keeps dashboard-only users out of operational actions", () => {
    const dashboardOnly = { ...baseUser, dashboardOnly: true, canEdit: true };
    expect(() => assertOliviaActionAllowed(dashboardOnly, "edit")).toThrow(TRPCError);
  });

  it("allows only databases assigned to the current user", () => {
    expect(() => assertOliviaDatabaseAllowed([1, 3], 2)).toThrow(TRPCError);
    expect(() => assertOliviaDatabaseAllowed([1, 3], 3)).not.toThrow();
  });
});
