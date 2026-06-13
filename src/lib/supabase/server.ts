import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

export function createClient(): SupabaseClient<any> {
  const cookieStore = cookies();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createServerClient<any>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Components cannot always write cookies; middleware refreshes sessions.
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Server Components cannot always write cookies; middleware refreshes sessions.
        }
      }
    }
  });
}
