// supabase/functions/create-team-member/index.ts
//
// Creates a staff account WITHOUT touching the caller's session.
//
// Why this exists: supabase.auth.signUp() called from the browser
// replaces the current session with the newly created user's session.
// An owner adding a cashier would be silently signed out and signed
// back in AS that cashier. Admin user creation requires the service
// role key, which must never reach the browser.
//
// Deploy:  supabase functions deploy create-team-member
// The SUPABASE_* env vars are injected automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ROLES = ['owner', 'manager', 'florist', 'cashier', 'delivery']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not signed in' }, 401)

    // ── 1. Who is calling? Verified against their JWT. ──────────
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return json({ error: 'Not signed in' }, 401)

    // ── 2. Are they allowed to create accounts? ─────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!callerProfile?.is_active || callerProfile.role !== 'owner') {
      return json({ error: 'Only the shop owner can create staff accounts' }, 403)
    }

    // ── 3. Validate the payload ─────────────────────────────────
    let body: Record<string, unknown>
    try {
      const parsed = await req.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Invalid request body' }, 400)
      }
      body = parsed as Record<string, unknown>
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const fullName = String(body.full_name ?? '').trim()
    const username = String(body.username ?? '').trim().toLowerCase()
    const phone = String(body.phone ?? '').trim()
    const role = String(body.role ?? 'cashier')
    const hireDate = body.hire_date ? String(body.hire_date) : null

    if (!email.includes('@')) return json({ error: 'Enter a valid email address' }, 400)
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
    if (!fullName) return json({ error: 'Enter the member’s full name' }, 400)
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      return json({ error: 'Username must be 3–32 characters: letters, numbers, . _ -' }, 400)
    }
    if (!ALLOWED_ROLES.includes(role)) return json({ error: 'Unknown role' }, 400)

    // ── 4. Username taken? Check before creating the auth user,
    //       so we don't leave an orphan behind. ─────────────────
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .maybeSingle()

    if (taken) return json({ error: 'That username is already taken' }, 409)

    // ── 5. Create the auth user ─────────────────────────────────
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // staff accounts are created in person
      user_metadata: { full_name: fullName, username, role },
    })

    if (createErr) {
      const msg = createErr.message.includes('already been registered')
        ? 'An account with that email already exists'
        : createErr.message
      return json({ error: msg }, 400)
    }

    // ── 6. Fill in the profile the trigger just created ─────────
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        username,
        phone: phone || null,
        role,
        hire_date: hireDate,
        is_active: true,
        created_by: user.id,
      })
      .eq('id', created.user.id)
      .select()
      .single()

    if (profileErr) {
      // Roll back so a half-created account doesn't block the email.
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: `Could not save the profile: ${profileErr.message}` }, 500)
    }

    // ── 7. Audit ────────────────────────────────────────────────
    const { error: auditError } = await admin.from('audit_logs').insert({
      performed_by: user.id,
      action_taken: 'create_team_member',
      target_table: 'profiles',
      new_value: { id: created.user.id, username, role, email },
    })
    if (auditError) {
      console.error('Could not audit team member creation:', auditError.message)
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id)
      if (rollbackError) {
        console.error('Could not roll back unaudited team member:', rollbackError.message)
        return json({ error: 'The account was created but could not be audited or rolled back. Contact support before retrying.' }, 500)
      }
      return json({ error: 'Could not record the account audit. No account was created; try again.' }, 500)
    }

    return json({ profile })
  } catch (err) {
    console.error('create-team-member failed:', err)
    return json({ error: 'Something went wrong creating the account' }, 500)
  }
})
