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

import { cors, HttpError, json, requireCaller } from '../_shared/require-caller.ts'

const ALLOWED_ROLES = ['owner', 'manager', 'florist', 'cashier', 'delivery']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── 1–2. Verified, active, owner-only caller. Because verify_jwt = false,
    //         this is the ONLY gate between the public anon key and admin
    //         account creation — requireCaller makes it impossible to skip. ──
    const { user, admin } = await requireCaller(req, ['owner'], 'Only the shop owner can create staff accounts')

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
    if (err instanceof HttpError) return err.response
    console.error('create-team-member failed:', err)
    return json({ error: 'Something went wrong creating the account' }, 500)
  }
})
