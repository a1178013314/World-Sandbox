import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { clearToken, getToken, setToken } from "./token";

interface AuthContextValue {
  token: string | null;
  signIn: (token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const signIn = useCallback((next: string) => {
    setToken(next);
    setTokenState(next);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, signIn, signOut }),
    [token, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }
  return context;
}
