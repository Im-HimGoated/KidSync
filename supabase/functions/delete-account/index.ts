import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createDeleteAccountHandler } from './handler.mjs';

// Keep Supabase's default verify_jwt=true gateway check enabled on deployment.
// The handler additionally verifies the live Auth user, then reauthenticates.
Deno.serve(createDeleteAccountHandler({
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
