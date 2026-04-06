import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api } from "../lib/api";

interface User {
  id: string;
  email: string;
  [key: string]: unknown;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "ai_platform_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Session;
        setSession(parsed);
        // Verify token is still valid
        api<{ user: User }>("/auth/me", { token: parsed.access_token })
          .then((data) => setUser(data.user))
          .catch(() => {
            // Token expired, try refresh
            api<{ session: Session }>("/auth/refresh", {
              method: "POST",
              body: { refresh_token: parsed.refresh_token },
            })
              .then((data) => {
                setSession(data.session);
                localStorage.setItem(
                  SESSION_KEY,
                  JSON.stringify(data.session)
                );
                return api<{ user: User }>("/auth/me", {
                  token: data.session.access_token,
                });
              })
              .then((data) => setUser(data.user))
              .catch(() => {
                // Fully expired
                localStorage.removeItem(SESSION_KEY);
                setSession(null);
              });
          })
          .finally(() => setLoading(false));
      } catch {
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ user: User; session: Session }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    setSession(data.session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
  };

  const signup = async (email: string, password: string) => {
    await api("/auth/signup", {
      method: "POST",
      body: { email, password },
    });
    // Auto-login after signup
    await login(email, password);
  };

  const logout = async () => {
    if (session) {
      try {
        await api("/auth/logout", {
          method: "POST",
          token: session.access_token,
        });
      } catch {
        // Even if server logout fails, clear locally
      }
    }
    setUser(null);
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
