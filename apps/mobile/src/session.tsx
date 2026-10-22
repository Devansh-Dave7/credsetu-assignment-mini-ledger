import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { request, messageOf, RequestError, type User } from "./api";
const TOKEN_KEY = "miniledger.session";
type Session = {
  token: string | null;
  loading: boolean;
  error: string;
  revision: number;
  refreshLedger: () => void;
  restore: () => Promise<void>;
  logout: () => void;
  login: (token: string, user: User) => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refreshLedger = useCallback(() => setRevision((v) => v + 1), []);
  const logout = useCallback(() => {
    setToken(null);
    setError("");
    void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() =>
      setError("Could not clear the saved session. Retry clearing it."),
    );
  }, []);
  const restore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (saved) {
        await request("/auth/me", { token: saved });
        setToken(saved);
      }
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) logout();
      else setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [logout]);
  useEffect(() => {
    void restore();
  }, [restore]);
  const login = useCallback(async (nextToken: string, user: User) => {
    if (!user.id) throw new Error("Invalid login response");
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }, []);
  return (
    <Context.Provider
      value={{
        token,
        loading,
        error,
        revision,
        refreshLedger,
        restore,
        logout,
        login,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("SessionProvider is missing");
  return session;
}
