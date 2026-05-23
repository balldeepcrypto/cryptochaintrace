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

console.log("Supabase URL:", supabaseUrl || "(MISSING)");
console.log("Supabase Key prefix:", supabaseAnonKey ? supabaseAnonKey.substring(0, 20) : "(MISSING)");
console.log("[supabase] VITE_SUPABASE_URL  raw:", rawA || "(empty)");
console.log("[supabase] VITE_SUPABASE_ANON_KEY raw:", rawB || "(empty)");

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.error("[supabase] ⚠️ NOT configured — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Vercel env vars and redeploy.");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);
