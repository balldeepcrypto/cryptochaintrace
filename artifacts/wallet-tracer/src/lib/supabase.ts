import { createClient } from "@supabase/supabase-js";

const rawA = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const rawB = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

// Auto-correct if the two values were stored in the wrong slots.
// The URL always starts with "https://"; the anon key never does.
const rawUrl = rawA.startsWith("http") ? rawA : rawB;
const rawKey = rawA.startsWith("http") ? rawB : rawA;

// Strip trailing slash — Supabase SDK appends /auth/v1/... and a double-slash breaks it.
export const supabaseUrl = rawUrl.replace(/\/+$/, "");
export const supabaseAnonKey = rawKey;

// Diagnostics — always log on module load so the browser console shows what's in use.
console.log("[supabase] VITE_SUPABASE_URL  (raw):", rawA ? `"${rawA.slice(0, 48)}…"` : "(empty — not set in env)");
console.log("[supabase] VITE_SUPABASE_ANON_KEY (raw):", rawB ? `"${rawB.slice(0, 32)}…"` : "(empty — not set in env)");
console.log("[supabase] resolved url:", supabaseUrl || "(MISSING)");
console.log("[supabase] resolved key:", supabaseAnonKey ? `${supabaseAnonKey.slice(0, 24)}…` : "(MISSING)");

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.error(
    "[supabase] ⚠️  Client is NOT configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your deployment environment variables and redeploy."
  );
}

// Always create the client — auth calls are guarded in the UI before they fire.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);
