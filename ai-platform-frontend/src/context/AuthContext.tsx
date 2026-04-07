import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { api, setAuthRefresher } from "../lib/api";

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
// Refresh this many seconds before the access token actually expires.
const REFRESH_LEEWAY_SECONDS = 60;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Always-current ref to the session, so callbacks installed once at mount
  // (the api refresher) can read the latest refresh_token without re-binding.
  const sessionRef = useRef<Session | null>(null);
  // Timer that fires shortly before the current access token expires.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Schedule a refresh REFRESH_LEEWAY_SECONDS before expires_at. If the token
  // is already inside the leeway window, refresh immediately.
  const scheduleRefresh = useCallback(
    (s: Session) => {
      clearRefreshTimer();
      const nowMs = Date.now();
      const expiresMs = s.expires_at * 1000;
      const fireAt = expiresMs - REFRESH_LEEWAY_SECONDS * 1000;
      const delay = Math.max(0, fireAt - nowMs);
      refreshTimerRef.current = setTimeout(() => {
        void doRefresh();
      }, delay);
    },
    // doRefresh is stable (defined below via useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearRefreshTimer]
  );

  // Persist a session to state + ref + localStorage and (re)schedule the
  // refresh timer. Pulled out so login, mount-restore, and the refresher all
  // funnel through the same code path.
  const applySession = useCallback(
    (next: Session) => {
      sessionRef.current = next;
      setSession(next);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      scheduleRefresh(next);
    },
    [scheduleRefresh]
  );

  const clearSession = useCallback(() => {
    clearRefreshTimer();
    sessionRef.current = null;
    setUser(null);
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  }, [clearRefreshTimer]);

  // Refresh now using whatever refresh_token is currently in the ref. Returns
  // the new access_token (or null on failure). Used by both the proactive
  // timer and the api 401-retry hook.
  const doRefresh = useCallback(async (): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    try {
      const data = await api<{ session: Session }>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: current.refresh_token },
      });
      applySession(data.session);
      return data.session.access_token;
    } catch (err) {
      console.warn("[auth] Refresh failed, signing out:", err);
      clearSession();
      return null;
    }
  }, [applySession, clearSession]);

  // Register the api 401-retry refresher exactly once. doRefresh is stable
  // (depends only on stable callbacks), so this never tears down mid-session.
  useEffect(() => {
    setAuthRefresher(doRefresh);
    return () => setAuthRefresher(null);
  }, [doRefresh]);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }

    let parsed: Session;
    try {
      parsed = JSON.parse(stored) as Session;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setLoading(false);
      return;
    }

    sessionRef.current = parsed;
    setSession(parsed);
    scheduleRefresh(parsed);

    api<{ user: User }>("/auth/me", { token: parsed.access_token })
      .then((data) => setUser(data.user))
      .catch(() => {
        // /auth/me failed even after the api layer's 401-retry — fully expired.
        clearSession();
      })
      .finally(() => setLoading(false));

    return clearRefreshTimer;
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ user: User; session: Session }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(data.user);
    applySession(data.session);
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
    const current = sessionRef.current;
    if (current) {
      try {
        await api("/auth/logout", {
          method: "POST",
          token: current.access_token,
        });
      } catch {
        // Even if server logout fails, clear locally
      }
    }
    clearSession();
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
