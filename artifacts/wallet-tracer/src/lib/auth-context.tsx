import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const MASTER_AUTH_KEY = "chaintrace-master-auth";
const MASTER_AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AUTH_TIMEOUT_MS = 5_000; // force loading=false after 5s if Supabase hangs

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

export function readMasterAuth(): boolean {
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
  const isMaster = readMasterAuth();

  const [session, setSession] = useState<Session | null>(
    isMaster ? makeMasterSession() : null,
  );
  // Start as false immediately if master auth is present — no Supabase round-trip needed
  const [loading, setLoading] = useState(!isMaster);
  const loginTime = useRef<number | null>(null);

  useEffect(() => {
    const hasMaster = readMasterAuth();
    console.log("[auth] AuthProvider mount — isMaster:", hasMaster, "loading:", !hasMaster ? "false (skipped)" : "true");

    // If master auth is valid, we already have a session and loading=false. Skip Supabase.
    if (hasMaster) {
      console.log("[auth] Master session active — bypassing Supabase getSession");
      return;
    }

    // Safety timeout: force loading=false after AUTH_TIMEOUT_MS even if Supabase hangs
    const timeoutId = setTimeout(() => {
      console.warn(`[auth] Timeout after ${AUTH_TIMEOUT_MS}ms — forcing loading=false. Supabase may be unreachable.`);
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    console.log("[auth] Calling supabase.auth.getSession()…");
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        clearTimeout(timeoutId);
        console.log("[auth] getSession resolved — session:", !!data.session, "error:", error?.message ?? null);
        if (data.session) setSession(data.session);
        setLoading(false);
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        console.warn("[auth] getSession threw:", err);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth] onAuthStateChange event:", event, "session:", !!s);

      // Never let Supabase auth events override an active master session
      if (readMasterAuth()) {
        console.log("[auth] Master session active — ignoring Supabase event:", event);
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

    // Handle magic-link hash on page load
    if (window.location.hash) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) window.location.replace("/dashboard");
      }).catch(() => {});
    }

    return () => {
      clearTimeout(timeoutId);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    console.log("[auth] logout called — clearing master auth");
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
