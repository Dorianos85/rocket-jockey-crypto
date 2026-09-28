import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createRankedHandler } from './handler.js';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceKey) throw new Error('Ranking service configuration is missing.');

// This key stays in the Edge environment. The browser receives only public fields.
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const handler = createRankedHandler({
  db,
  authenticate: (token: string) => db.auth.getUser(token),
});

// Gateway JWT verification is disabled for the public leaderboard endpoint.
// The handler explicitly verifies every profile/start/submit request with getUser.
Deno.serve(handler);
