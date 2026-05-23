import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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
    // Non-critical — silently ignore logging failures
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const loginTime = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);

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
        // s is null on sign-out; read from the previous session via the closure
        // (session state hasn't updated yet so we read the current session from the arg)
        const prevSession = session;
        if (prevSession?.user?.email) {
          logActivity({
            userEmail: prevSession.user.email,
            department: (prevSession.user.user_metadata?.department as string) ?? "",
            action: "logout",
            sessionDurationSeconds: duration,
          });
        }
      }
    });

    // Handle direct hash callback on page load (magic link lands on / with #access_token=…)
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
    await supabase.auth.signOut();
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

// Call this from any page to log a user action (search, start_trace, etc.)
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
