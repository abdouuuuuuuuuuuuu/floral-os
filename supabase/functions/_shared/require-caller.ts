// supabase/functions/_shared/require-caller.ts
//
// Single source of truth for Edge Function authentication and authorization.
//
// WHY THIS EXISTS — the fragile pattern this replaces:
// Every function in this project is configured with `verify_jwt = false`
// (supabase/config.toml). That is deliberate: the owner-adds-a-cashier and the
// session-preserving password/status flows must NOT run under the Supabase API
// gateway's automatic JWT check. The cost is that the gateway no longer verifies
// the caller at all — so EACH handler must verify the token itself before it
// touches the service-role key. Four functions did that correctly but by hand,
// copy-pasted. The day a fifth function is added and the paste is forgotten, it
// ships wide open to anyone holding the public anon key.
//
// requireCaller() makes the check non-optional and identical everywhere:
//   - rejects non-POST and missing/!Bearer Authorization,
//   - verifies the caller's JWT SERVER-SIDE via GoTrue (getUser(), not a local
//     decode), so a forged or expired token fails,
//   - loads the caller's profile with the service-role client and requires
//     is_active AND an allowed role,
//   - hands back { user, profile, admin } so the handler can do its work and
//     any finer-grained hierarchy checks (e.g. managers may not target owners).
//
// A function physically cannot reach privileged work without calling this first.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Thrown to short-circuit a handler with a ready-made HTTP response. The handler
// catches it and returns err.response; anything else is a real 500.
export class HttpError extends Error {
  constructor(public readonly response: Response) {
    super('http-error')
    this.name = 'HttpError'
  }
}

export interface CallerProfile {
  role: string
  is_active: boolean
}

export interface Caller {
  /** The verified auth user (id is auth.users.id === profiles.id). */
  user: { id: string; [key: string]: unknown }
  /** The caller's own profile row, for hierarchy checks in the handler. */
  profile: CallerProfile
  /** Service-role client. Never leaves the function; use for privileged work. */
  admin: SupabaseClient
}

/**
 * Verify, activate-check and role-check the caller. Call it first in every
 * Edge Function, after the OPTIONS preflight.
 *
 * @param req            the incoming request
 * @param allowedRoles   roles permitted to invoke this function at all
 * @param forbiddenMessage user-facing message for the 403 (keeps each function's
 *                         existing wording, e.g. "Only the shop owner can…")
 */
export async function requireCaller(
  req: Request,
  allowedRoles: readonly string[],
  forbiddenMessage = 'You do not have permission to perform this action',
): Promise<Caller> {
  if (req.method !== 'POST') throw new HttpError(json({ error: 'Method not allowed' }, 405))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new HttpError(json({ error: 'Not signed in' }, 401))

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) {
    console.error('Edge function is missing required Supabase environment variables')
    throw new HttpError(json({ error: 'This action is temporarily unavailable' }, 500))
  }

  // Verify the caller's token with the PUBLIC client before any admin access.
  // getUser() asks GoTrue to validate the JWT; a forged/expired token fails here.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) throw new HttpError(json({ error: 'Not signed in' }, 401))

  // Only now, for a proven user, create the privileged client and read the role.
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Could not verify caller profile:', profileError.message)
    throw new HttpError(json({ error: 'Could not verify your account permissions' }, 500))
  }
  if (!profile?.is_active || !allowedRoles.includes(profile.role)) {
    throw new HttpError(json({ error: forbiddenMessage }, 403))
  }

  return { user, profile: profile as CallerProfile, admin }
}
