import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MASTER_AUTH_KEY = "chaintrace-master-auth";
const MASTER_AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AUTH_TIMEOUT_MS = 5_000;

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  loginWithMaster: () => void; // set master session directly in React state
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  logout: async () => {},
  loginWithMaster: () => {},
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
    // Check sessionStorage first (survives within the tab), then localStorage
    for (const store of [sessionStorage, localStorage]) {
      const raw = store.getItem(MASTER_AUTH_KEY);
      if (!raw) continue;
      const { exp } = JSON.parse(raw) as { exp: number };
      if (Date.now() < exp) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function writeMasterAuth() {
  const value = JSON.stringify({ masterAuth: true, exp: Date.now() + MASTER_AUTH_TTL });
  try { sessionStorage.setItem(MASTER_AUTH_KEY, value); } catch { /* ok */ }
  try { localStorage.setItem(MASTER_AUTH_KEY, value); } catch { /* ok */ }
}

function clearMasterAuth() {
  try { sessionStorage.removeItem(MASTER_AUTH_KEY); } catch { /* ok */ }
  try { localStorage.removeItem(MASTER_AUTH_KEY); } catch { /* ok */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hasMasterOnMount = readMasterAuth();

  const [session, setSession] = useState<Session | null>(
    hasMasterOnMount ? makeMasterSession() : null,
  );
  const [loading, setLoading] = useState(hasMasterOnMount ? false : true);
  const loginTime = useRef<number | null>(null);

  console.log("[auth] render — session:", !!session, "loading:", loading, "isMaster:", hasMasterOnMount);

  // Expose a function login pages can call to set the master session directly
  // in React state without a page reload, avoiding any localStorage timing issues.
  function loginWithMaster() {
    console.log("[auth] loginWithMaster() called — setting master session");
    writeMasterAuth();
    setSession(makeMasterSession());
    setLoading(false);
  }

  useEffect(() => {
    console.log("[auth] useEffect — hasMasterOnMount:", hasMasterOnMount);

    if (hasMasterOnMount) {
      // Already have a session set from useState initializer — skip Supabase entirely
      console.log("[auth] Master session active on mount — skipping Supabase");
      return;
    }

    // Hard timeout: force loading=false if Supabase never responds
    const timeoutId = setTimeout(() => {
      console.warn(`[auth] ${AUTH_TIMEOUT_MS}ms timeout — forcing loading=false`);
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    console.log("[auth] Calling getSession…");
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        clearTimeout(timeoutId);
        console.log("[auth] getSession done — session:", !!data.session, "err:", error?.message ?? null);
        if (data.session) setSession(data.session);
        setLoading(false);
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        console.warn("[auth] getSession threw:", err);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth] onAuthStateChange:", event, "session:", !!s, "isMaster now:", readMasterAuth());

      // Never let Supabase events override an active master session
      if (readMasterAuth()) {
        console.log("[auth] ignoring Supabase event — master session is active");
        return;
      }

      if (s) setSession(s);

      if (event === "SIGNED_IN" && s) {
        loginTime.current = Date.now();
        logActivity({
          userEmail: s.user.email ?? "",
          department: (s.user.user_metadata?.department as string) ?? "",
          action: "login",
        });
        const p = window.location.pathname;
        if (p === "/" || p === "/login") window.location.replace("/dashboard");
      }

      if (event === "SIGNED_OUT") {
        const duration = loginTime.current
          ? Math.round((Date.now() - loginTime.current) / 1000)
          : null;
        loginTime.current = null;
        clearMasterAuth();
        setSession(null);
        if (session?.user?.email) {
          logActivity({
            userEmail: session.user.email,
            department: (session.user.user_metadata?.department as string) ?? "",
            action: "logout",
            sessionDurationSeconds: duration,
          });
        }
      }
    });

    if (window.location.hash) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) window.location.replace("/dashboard");
      }).catch(() => {});
    }

    return () => {
      clearTimeout(timeoutId);
      listener.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    console.log("[auth] logout");
    clearMasterAuth();
    setSession(null);
    await supabase.auth.signOut().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, logout, loginWithMaster }}>
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
