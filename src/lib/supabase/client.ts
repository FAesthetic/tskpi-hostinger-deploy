"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

export function createClient(): SupabaseClient<any> {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createBrowserClient<any>(supabaseUrl, supabaseAnonKey);
}
