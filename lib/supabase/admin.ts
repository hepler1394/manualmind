import { createClient } from '@supabase/supabase-js';

// Service-role client for server-only writes (usage, plan updates). Never import in client code.
// cache: 'no-store' is critical — Next.js patches global fetch with a data cache that would
// otherwise serve stale Supabase reads (identical GET URLs get cached across invocations).
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url: any, options: any = {}) => fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  );
}
