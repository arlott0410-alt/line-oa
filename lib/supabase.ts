import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

if (typeof window !== "undefined" && (supabaseUrl.includes("placeholder") || !process.env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY may be missing. Set env vars for API and Realtime.");
}
