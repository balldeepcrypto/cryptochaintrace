import { createClient } from "@supabase/supabase-js";

const rawA = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const rawB = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";

if (!rawA && !rawB) {
  console.error("[supabase] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are both missing");
}

// Auto-correct if the two values were stored in the wrong slots.
// The URL always starts with "https://"; the anon key never does.
const rawUrl  = rawA.startsWith("http") ? rawA : rawB;
const rawKey  = rawA.startsWith("http") ? rawB : rawA;

// Strip trailing slash — Supabase SDK appends /auth/v1/... and double-slash breaks it.
const supabaseUrl = rawUrl.replace(/\/+$/, "");
const supabaseAnonKey = rawKey;

console.log("[supabase] url:", supabaseUrl ? supabaseUrl.slice(0, 40) + "…" : "(missing)");
console.log("[supabase] key:", supabaseAnonKey ? supabaseAnonKey.slice(0, 20) + "…" : "(missing)");

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[supabase] Client will not work — URL or key is missing after swap-detection.");
}

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder");
