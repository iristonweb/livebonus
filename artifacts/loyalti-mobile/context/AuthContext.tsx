import {
  logout,
  setAuthFailureHandler,
  type AuthToken,
} from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const AUTH_TOKEN_KEY = "ls_token";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  session: AuthToken | null;
  signIn: (session: AuthToken) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function clearStoredSession(queryClient: QueryClient): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  queryClient.clear();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<AuthToken | null>(null);
  const isSigningOut = useRef(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(AUTH_TOKEN_KEY)
      .then((token) => {
        if (!isMounted) return;
        setStatus(token ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!isMounted) return;
        setStatus("unauthenticated");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = useCallback(
    async (nextSession: AuthToken) => {
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, nextSession.token);
      queryClient.clear();
      setSession(nextSession);
      setStatus("authenticated");
    },
    [queryClient],
  );

  const clearSession = useCallback(async () => {
    try {
      await clearStoredSession(queryClient);
    } finally {
      setSession(null);
      setStatus("unauthenticated");
    }
  }, [queryClient]);

  const signOut = useCallback(async () => {
    if (isSigningOut.current) return;
    isSigningOut.current = true;

    try {
      await logout();
    } catch {
      // The local session must still be removed if the stateless endpoint is unavailable.
    } finally {
      try {
        await clearSession();
      } finally {
        isSigningOut.current = false;
      }
    }
  }, [clearSession]);

  useEffect(() => {
    setAuthFailureHandler((error) => {
      if (error.status !== 401 || isSigningOut.current) return;

      isSigningOut.current = true;
      return clearSession().finally(() => {
        isSigningOut.current = false;
      });
    });

    return () => setAuthFailureHandler(null);
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, session, signIn, signOut }),
    [session, signIn, signOut, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}