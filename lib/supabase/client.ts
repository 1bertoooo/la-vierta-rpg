import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Sessão persistente: lembra login entre dispositivos
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage:
          typeof window !== "undefined" ? window.localStorage : undefined,
        storageKey: "lavierta-auth",
      },
      realtime: { params: { eventsPerSecond: 10 } },
    }
  );
  return _client;
}

export function createBrowserSupabaseClient(): SupabaseClient {
  return getSupabase();
}

export type Profile = {
  id: string;
  email: string;
  nick: string | null;
  role: "admin" | "player";
  avatar_url: string | null;
  created_at: string;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}
