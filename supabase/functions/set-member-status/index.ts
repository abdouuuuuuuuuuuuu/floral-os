// Activates or deactivates a team member AND their sign-in.
//
// Turning off profiles.is_active alone only hides the app: Supabase Auth does
// not read that flag, so a deactivated worker could still sign in through the
// API with the shop's public key and use every policy that does not re-check
// is_active. This function also bans (or unbans) the auth user, which blocks
// new sign-ins and token refreshes.
//
// The function config disables gateway JWT verification, so this handler
// verifies the bearer token itself before creating the service-role client.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Long enough to be permanent until an owner or manager reactivates the account.
const BAN_DURATION = '876000h'

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
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceRoleKey) {
      console.error('set-member-status is missing required Supabase environment variables')
      return json({ error: 'Changing account status is temporarily unavailable' }, 500)
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()
    if (callerProfileError) {
      console.error('Could not verify status caller profile:', callerProfileError.message)
      return json({ error: 'Could not verify your account permissions' }, 500)
    }
    if (!callerProfile?.is_active || !['owner', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'You do not have permission to change team access' }, 403)
    }

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

    const targetId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    if (!targetId) return json({ error: 'Choose a team member' }, 400)
    if (typeof body.is_active !== 'boolean') return json({ error: 'Choose active or inactive' }, 400)
    const isActive = body.is_active
    if (targetId === user.id && !isActive) return json({ error: 'You cannot deactivate your own account' }, 400)

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', targetId)
      .maybeSingle()
    if (targetError) {
      console.error('Could not verify status target profile:', targetError.message)
      return json({ error: 'Could not verify the selected team member' }, 500)
    }
    if (!target) return json({ error: 'Team member not found' }, 404)
    if (callerProfile.role === 'manager' && !['florist', 'cashier', 'delivery'].includes(target.role)) {
      return json({ error: 'Managers can change access for florists, cashiers, and delivery staff only' }, 403)
    }

    const setBan = (banned: boolean) =>
      admin.auth.admin.updateUserById(targetId, { ban_duration: banned ? BAN_DURATION : 'none' })
    const setProfileActive = (active: boolean) =>
      admin.from('profiles').update({ is_active: active }).eq('id', targetId).select('*').single()

    let profile
    if (isActive) {
      // Restore sign-in first; undo it if the profile cannot be reactivated.
      const { error: unbanError } = await setBan(false)
      if (unbanError) {
        console.error('Could not unban team member:', unbanError.message)
        return json({ error: 'Could not restore this account’s sign-in. Try again.' }, 500)
      }
      const { data, error } = await setProfileActive(true)
      if (error) {
        await setBan(true)
        return json({ error: error.message }, 400)
      }
      profile = data
    } else {
      // The profile update runs the last-active-owner guard, so do it first.
      const { data, error } = await setProfileActive(false)
      if (error) return json({ error: error.message }, 400)
      const { error: banError } = await setBan(true)
      if (banError) {
        console.error('Could not ban deactivated team member:', banError.message)
        await setProfileActive(Boolean(target.is_active))
        return json({ error: 'Could not block this account’s sign-in. Nothing was changed; try again.' }, 500)
      }
      profile = data
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      performed_by: user.id,
      action_taken: isActive ? 'reactivate_team_member' : 'deactivate_team_member',
      target_table: 'profiles',
      old_value: { id: targetId, is_active: target.is_active },
      new_value: { id: targetId, is_active: isActive },
    })
    if (auditError) console.error('Team access changed but its audit record could not be saved:', auditError.message)

    return json({ profile, audit_recorded: !auditError })
  } catch (err) {
    console.error('set-member-status failed:', err)
    return json({ error: 'Something went wrong changing team access' }, 500)
  }
})
