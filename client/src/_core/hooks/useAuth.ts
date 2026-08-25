import { useCallback, useEffect, useState } from "react";

type AuthUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  role: string;
  canView?: boolean;
  canInsert?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canGenerateReports?: boolean;
  canAccessSettings?: boolean;
  isActive?: boolean;
};

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const {
    redirectOnUnauthenticated = false,
    redirectPath = "/login",
  } = options ?? {};

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        setUser(null);
        return null;
      }

      const data = await response.json();

      if (!response.ok || !data?.authenticated || !data?.user) {
        throw new Error(data?.message || "Não foi possível validar a sessão.");
      }

      setUser(data.user);
      return data.user as AuthUser;
    } catch (err) {
      const normalized =
        err instanceof Error ? err : new Error("Falha ao validar sessão.");
      setError(normalized);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (loading) return;
    if (user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [loading, redirectOnUnauthenticated, redirectPath, user]);

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    refresh,
    logout,
  };
}
