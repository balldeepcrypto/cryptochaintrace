import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MASTER_AUTH_KEY = "chaintrace-master-auth";
const MASTER_AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  logout: async () => {},
});

async function logActivity(payload: {
  userEmail: string;
  department: string;
  action: string;
  sessionDurationSeconds?: number | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await fetch("/api/activity-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-critical
  }
}

function makeMasterSession(): Session {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "master-key-session",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: now + 86400,
    refresh_token: "master-key-session",
    user: {
      id: "master-owner",
      aud: "authenticated",
      role: "authenticated",
      email: "owner@cryptochaintrace.com",
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "master-key" },
      user_metadata: { department: "Owner" },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    } as unknown as User,
  } as unknown as Session;
}

function readMasterAuth(): boolean {
  try {
    const raw = localStorage.getItem(MASTER_AUTH_KEY);
    if (!raw) return false;
    const { exp } = JSON.parse(raw) as { exp: number };
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export function writeMasterAuth() {
  localStorage.setItem(
    MASTER_AUTH_KEY,
    JSON.stringify({ masterAuth: true, exp: Date.now() + MASTER_AUTH_TTL }),
  );
}

function clearMasterAuth() {
  localStorage.removeItem(MASTER_AUTH_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    readMasterAuth() ? makeMasterSession() : null,
  );
  const [loading, setLoading] = useState(true);
  const loginTime = useRef<number | null>(null);

  useEffect(() => {
    // If we already have a master session from localStorage, skip the Supabase loading phase
    if (readMasterAuth()) {
      setLoading(false);
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) {
          setSession(data.session);
        }
        setLoading(false);
      })
      .catch(() => {
        // Supabase unavailable (paused) — master session still works
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      if (s) setSession(s);

      if (event === "SIGNED_IN" && s) {
        loginTime.current = Date.now();
        const email = s.user.email ?? "";
        const department = (s.user.user_metadata?.department as string) ?? "";
        logActivity({ userEmail: email, department, action: "login" });

        const currentPath = window.location.pathname;
        if (currentPath === "/" || currentPath === "/login") {
          window.location.replace("/dashboard");
        }
      }

      if (event === "SIGNED_OUT") {
        const duration = loginTime.current
          ? Math.round((Date.now() - loginTime.current) / 1000)
          : null;
        loginTime.current = null;
        const prevSession = session;
        if (prevSession?.user?.email) {
          logActivity({
            userEmail: prevSession.user.email,
            department: (prevSession.user.user_metadata?.department as string) ?? "",
            action: "logout",
            sessionDurationSeconds: duration,
          });
        }
        clearMasterAuth();
        setSession(null);
      }
    });

    if (window.location.hash) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          window.location.replace("/dashboard");
        }
      });
    }

    return () => listener.subscription.unsubscribe();
  }, []);

  async function logout() {
    clearMasterAuth();
    setSession(null);
    await supabase.auth.signOut().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function logUserAction(
  user: User | null,
  action: string,
  metadata?: Record<string, unknown>,
) {
  if (!user?.email) return;
  await logActivity({
    userEmail: user.email,
    department: (user.user_metadata?.department as string) ?? "",
    action,
    metadata: metadata ?? null,
  });
}
