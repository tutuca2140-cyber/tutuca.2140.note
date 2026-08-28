import { useEffect, useState } from "react";

export type CommercialContext = {
  success: boolean;
  commercial: boolean;
  isSuperAdmin?: boolean;
  isOwner: boolean;
  plan: "basic" | "plus" | null;
  status: string | null;
  ownerId: number | null;
  teamLimit?: number | null;
  databaseLimit?: number;
  permissions: {
    canManageUsers: boolean;
    canManageDatabases: boolean;
    canDeleteCashFlow: boolean;
  };
};

export function useCommercialContext() {
  const [data, setData] = useState<CommercialContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/commercial-context", {
          credentials: "include",
          cache: "no-store",
        });
        const result = await response.json().catch(() => null);
        if (active && response.ok && result?.success) setData(result);
        else if (active) setData(null);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}
