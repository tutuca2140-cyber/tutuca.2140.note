import { TRPCError } from "@trpc/server";

export type OliviaAction =
  | "view"
  | "insert"
  | "edit"
  | "delete"
  | "report"
  | "settings";

export type OliviaUserContext = {
  id: number;
  role: "user" | "admin" | "super_admin" | string;
  username?: string | null;
  name?: string | null;
  canUseOlivia?: boolean;
  canView: boolean;
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canGenerateReports: boolean;
  canAccessSettings: boolean;
  dashboardOnly: boolean;
};

const permissionMap: Record<Exclude<OliviaAction, "delete">, keyof OliviaUserContext> = {
  view: "canView",
  insert: "canInsert",
  edit: "canEdit",
  report: "canGenerateReports",
  settings: "canAccessSettings",
};

/**
 * Super Admin is the only authority that can grant Olivia access.
 * The protected Super Admin account is always allowed to use Olivia.
 */
export function assertOliviaEnabled(user: OliviaUserContext) {
  const isSuperAdmin = user.role === "super_admin";
  if (!isSuperAdmin && user.canUseOlivia !== true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "O acesso à Olivia não foi liberado pelo Super Administrador para este usuário.",
    });
  }
}

/**
 * Central security gate for every Olivia operation.
 *
 * Rules:
 * 1. Olivia access must first be granted by the Super Admin.
 * 2. Olivia never has more authority than the authenticated user.
 * 3. Delete is never delegated to Olivia. It remains a direct Super Admin action.
 * 4. Dashboard-only accounts cannot use Olivia for operational actions.
 * 5. Super Admin remains the highest authority; Olivia is always subordinate.
 */
export function assertOliviaActionAllowed(user: OliviaUserContext, action: OliviaAction) {
  assertOliviaEnabled(user);

  if (action === "delete") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A Olivia não pode excluir informações. Exclusões permanecem restritas ao Super Administrador.",
    });
  }

  if (user.dashboardOnly && action !== "view" && action !== "report") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Este usuário possui acesso somente ao dashboard e a Olivia seguirá essa limitação.",
    });
  }

  const permission = permissionMap[action];
  if (!Boolean(user[permission])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A Olivia não possui permissão para executar esta ação porque o usuário logado também não possui.",
    });
  }
}

/**
 * Returns the maximum capability set Olivia may expose to the current user.
 * Useful for both the backend prompt/tool registry and the frontend UI.
 */
export function getOliviaCapabilities(user: OliviaUserContext) {
  const enabled = user.role === "super_admin" || user.canUseOlivia === true;
  return {
    enabled,
    canView: enabled && user.canView,
    canInsert: enabled && !user.dashboardOnly && user.canInsert,
    canEdit: enabled && !user.dashboardOnly && user.canEdit,
    canDelete: false,
    canGenerateReports: enabled && user.canGenerateReports,
    canAccessSettings: enabled && !user.dashboardOnly && user.canAccessSettings,
    isSuperAdmin: user.role === "super_admin",
    dashboardOnly: user.dashboardOnly,
  } as const;
}

export function assertOliviaDatabaseAllowed(allowedDatabaseIds: number[], databaseId: number) {
  if (!allowedDatabaseIds.includes(databaseId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "A Olivia não pode acessar este banco de dados porque ele não está liberado para o usuário logado.",
    });
  }
}
