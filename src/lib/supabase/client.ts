import { createClient } from '@supabase/supabase-js';

/**
 * Create a browser-side Supabase client.
 * Uses NEXT_PUBLIC_ env vars so the client can be used in browser components.
 * Only used when AUTH_MODE=supabase (cloud deployment mode).
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables'
    );
  }

  return createClient(url, anonKey);
}
