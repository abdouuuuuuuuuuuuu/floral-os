// Resets a team member's password without changing the caller's session.
// The function config disables gateway JWT verification, so this handler
// verifies the bearer token itself before creating the service-role client.

import { createClient } from 'jsr:@supabase/supabase-js@2'

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
      console.error('reset-member-password is missing required Supabase environment variables')
      return json({ error: 'Password reset is temporarily unavailable' }, 500)
    }

    // Verify the caller's token with the public client before using admin access.
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
      console.error('Could not verify reset caller profile:', callerProfileError.message)
      return json({ error: 'Could not verify your account permissions' }, 500)
    }
    if (!callerProfile?.is_active || !['owner', 'manager'].includes(callerProfile.role)) {
      return json({ error: 'You do not have permission to reset team passwords' }, 403)
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
    const password = typeof body.password === 'string' ? body.password : ''
    if (!targetId) return json({ error: 'Choose a team member' }, 400)
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', targetId)
      .maybeSingle()

    if (targetError) {
      console.error('Could not verify reset target profile:', targetError.message)
      return json({ error: 'Could not verify the selected team member' }, 500)
    }
    if (!targetProfile) return json({ error: 'Team member not found' }, 404)
    if (callerProfile.role === 'manager' && ['owner', 'manager'].includes(targetProfile.role)) {
      return json({ error: 'Managers can reset passwords for florists, cashiers, and delivery staff only' }, 403)
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(targetId, { password })
    if (updateError) {
      console.error('Could not update team member password:', updateError.message)
      return json({ error: 'Could not update the password. Check the password and try again.' }, 400)
    }

    // Password changes cannot be rolled back if the audit insert fails. Return
    // the successful reset either way, while making audit failure observable.
    const { error: auditError } = await admin.from('audit_logs').insert({
      performed_by: user.id,
      action_taken: 'reset_team_member_password',
      target_table: 'profiles',
      new_value: { id: targetId },
    })
    if (auditError) {
      console.error('Password was reset but its audit record could not be saved:', auditError.message)
    }

    return json({ success: true, audit_recorded: !auditError })
  } catch (err) {
    console.error('reset-member-password failed:', err)
    return json({ error: 'Something went wrong resetting the password' }, 500)
  }
})
