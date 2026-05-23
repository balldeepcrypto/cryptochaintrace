import { createClient } from "@supabase/supabase-js";

let rawA = import.meta.env.VITE_SUPABASE_URL as string;
let rawB = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!rawA || !rawB) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

// Auto-correct if the two values were stored in the wrong slots.
// The URL always starts with "https://"; the key never does.
const supabaseUrl = rawA.startsWith("http") ? rawA : rawB;
const supabaseAnonKey = rawA.startsWith("http") ? rawB : rawA;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
