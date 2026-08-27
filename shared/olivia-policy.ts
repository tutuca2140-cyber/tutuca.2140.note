export type OliviaSafeAction =
  | "create_client"
  | "update_client"
  | "create_loan"
  | "record_payment";

export type OliviaPermissionContext = {
  role?: string | null;
  canInsert?: boolean;
  canEdit?: boolean;
  dashboardOnly?: boolean;
};

export function getAllowedOliviaActions(user: OliviaPermissionContext): OliviaSafeAction[] {
  if (user.dashboardOnly) return [];
  const superAdmin = user.role === "super_admin";
  const actions: OliviaSafeAction[] = [];
  if (superAdmin || user.canInsert) actions.push("create_client", "create_loan", "record_payment");
  if (superAdmin || user.canEdit) actions.push("update_client");
  return actions;
}

export function isForbiddenOliviaAdministrativeRequest(message: string) {
  return /\b(excluir|apagar|deletar|remover\s+usu[aá]rio|criar\s+usu[aá]rio|editar\s+usu[aá]rio|permiss(?:ão|oes|ões)|senha|credencial)\b/i.test(message);
}
