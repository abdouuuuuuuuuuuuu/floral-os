import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_ROUTE_SNAP_DISTANCE_METERS = 5000

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

function coordinate(value: unknown) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isNonPublicRouteHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  const octets = host.split('.').map(Number)
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second] = octets
    return first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127)
  }

  if (host.includes(':')) {
    return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd')
      || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization') || ''
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceRoleKey) {
      console.error('calculate-shipping-route is missing required Supabase environment variables')
      return json({ error: 'Route calculation is temporarily unavailable' }, 500)
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'Not signed in' }, 401)

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Could not verify route caller:', profileError.message)
      return json({ error: 'Could not verify your account permissions' }, 500)
    }
    if (!profile?.is_active || !['owner', 'manager', 'florist', 'cashier'].includes(profile.role)) {
      return json({ error: 'You do not have permission to calculate delivery routes' }, 403)
    }

    let body: Record<string, unknown>
    try {
      const parsed = await req.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Invalid request body' }, 400)
      body = parsed as Record<string, unknown>
    } catch {
      return json({ error: 'Invalid request body' }, 400)
    }

    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : ''
    const city = typeof body.delivery_city === 'string' ? body.delivery_city.trim() : ''
    const wilaya = typeof body.delivery_wilaya === 'string' ? body.delivery_wilaya.trim() : ''
    const latitude = coordinate(body.delivery_latitude)
    const longitude = coordinate(body.delivery_longitude)
    if (!city) return json({ error: 'Choose a confirmed delivery town first' }, 400)
    if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return json({ error: 'The selected delivery map point is invalid' }, 400)
    }

    let existingOrder: Record<string, unknown> | null = null
    if (orderId) {
      const { data: order, error: orderError } = await admin
        .from('orders')
        .select('id, status, deleted_at, delivery_method, delivery_latitude, delivery_longitude, delivery_city, delivery_wilaya')
        .eq('id', orderId)
        .maybeSingle()
      if (orderError) {
        console.error('Could not read route target order:', orderError.message)
        return json({ error: 'Could not load this order for route calculation' }, 500)
      }
      if (!order || order.deleted_at || order.delivery_method === 'pickup' || !['new', 'processing'].includes(String(order.status))) {
        return json({ error: 'Active delivery order not found' }, 404)
      }
      existingOrder = order as Record<string, unknown>
    }

    const { data: settings, error: settingsError } = await admin
      .from('settings')
      .select('shop_location_name, shop_latitude, shop_longitude, routing_service_url')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle()

    if (settingsError) {
      console.error('Could not load shipping route settings:', settingsError.message)
      return json({ error: 'Could not load the shop route settings' }, 500)
    }
    const originLatitude = coordinate(settings?.shop_latitude)
    const originLongitude = coordinate(settings?.shop_longitude)
    if (originLatitude == null || originLongitude == null) return json({ error: 'Set and save the shop location in Settings first' }, 400)

    const base = String(settings?.routing_service_url || '').trim().replace(/\/+$/, '')
    if (!base) return json({ error: 'Add an OSRM-compatible routing service URL in Settings first' }, 400)
    let routeBase: URL
    try {
      routeBase = new URL(base)
    } catch {
      return json({ error: 'The configured routing service URL is invalid' }, 400)
    }
    if (routeBase.protocol !== 'https:' || routeBase.username || routeBase.password || routeBase.search || routeBase.hash) {
      return json({ error: 'The routing service URL must be a plain HTTPS service URL without embedded credentials' }, 400)
    }
    if (isNonPublicRouteHost(routeBase.hostname)) {
      return json({ error: 'The routing service must use a public hostname' }, 400)
    }

    const coordinatePair = (lat: number, lon: number) => `${lon},${lat}`
    const routeUrl = `${base}/route/v1/driving/${coordinatePair(originLatitude, originLongitude)};${coordinatePair(latitude, longitude)}?overview=false&steps=false`
    const routeHeaders: Record<string, string> = { Accept: 'application/json' }
    const routeApiKey = Deno.env.get('ROUTING_SERVICE_API_KEY')
    if (routeApiKey) routeHeaders.Authorization = `Bearer ${routeApiKey}`

    let routeResult: Record<string, unknown>
    try {
      const response = await fetch(routeUrl, { headers: routeHeaders, signal: AbortSignal.timeout(12000) })
      if (!response.ok) return json({ error: 'The driving-route service could not calculate this route' }, 502)
      routeResult = await response.json()
    } catch (routeError) {
      const reason = routeError instanceof Error ? `${routeError.name}: ${routeError.message}` : String(routeError)
      console.error('Shipping route provider request failed:', { hostname: routeBase.hostname, reason })
      const lowerReason = reason.toLowerCase()
      if (lowerReason.includes('dns error') || lowerReason.includes('failed to lookup address') || lowerReason.includes('name or service not known')) {
        return json({ error: 'The configured routing hostname could not be found. If this is a Cloudflare Quick Tunnel address, it may have changed or the tunnel may be offline. Start the tunnel, copy its current HTTPS URL into Settings → Shipping distance planning, save, and retry.' }, 502)
      }
      if (lowerReason.includes('timed out') || lowerReason.includes('timeout')) {
        return json({ error: 'The routing service did not respond in time. Check that Docker Desktop and the OSRM tunnel are running, then retry.' }, 502)
      }
      return json({ error: 'The routing service could not be reached. Check that the OSRM router and Cloudflare Tunnel are running, then retry.' }, 502)
    }

    const routes = Array.isArray(routeResult.routes) ? routeResult.routes as Array<Record<string, unknown>> : []
    const route = routes[0]
    const distanceMeters = coordinate(route?.distance)
    const durationSeconds = coordinate(route?.duration)
    if (routeResult.code !== 'Ok' || !Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > 3_000_000) {
      return json({ error: 'No valid driving route was found. Check the selected map points.' }, 422)
    }
    const distanceKm = Math.round(distanceMeters) / 1000
    const transitDays = distanceKm < 80 ? 0 : distanceKm <= 600 ? 1 : 2
    const waypoints = Array.isArray(routeResult.waypoints) ? routeResult.waypoints as Array<Record<string, unknown>> : []
    const snapDistances = waypoints
      .map((waypoint) => waypoint.distance)
      .filter((distance) => distance != null)
      .map(Number)
      .filter((distance) => Number.isFinite(distance) && distance >= 0)
    if (snapDistances.length < 2) {
      return json({ error: 'The route service could not verify both map points against its road network.' }, 422)
    }
    const maxSnapDistanceMeters = snapDistances.length ? Math.max(...snapDistances) : null
    if (maxSnapDistanceMeters > MAX_ROUTE_SNAP_DISTANCE_METERS) {
      return json({ error: 'A selected map point is more than 5 km from a drivable road. Choose a closer map match before saving this route.' }, 422)
    }
    const calculatedAt = new Date().toISOString()

    if (existingOrder) {
      const update = {
        delivery_city: city,
        delivery_wilaya: wilaya || null,
        delivery_latitude: latitude,
        delivery_longitude: longitude,
        delivery_origin_name: settings?.shop_location_name || null,
        delivery_origin_latitude: originLatitude,
        delivery_origin_longitude: originLongitude,
        shipping_distance_km: distanceKm,
        shipping_transit_days: transitDays,
        shipping_route_duration_seconds: Number.isFinite(durationSeconds) && durationSeconds >= 0 ? Math.round(durationSeconds) : null,
        shipping_route_provider: routeBase.hostname,
        shipping_route_max_snap_distance_m: maxSnapDistanceMeters,
        shipping_route_calculated_at: calculatedAt,
      }
      let saveQuery = admin.from('orders').update(update)
        .eq('id', orderId)
        .in('status', ['new', 'processing'])
        .is('deleted_at', null)
      if (existingOrder.delivery_latitude == null) saveQuery = saveQuery.is('delivery_latitude', null)
      else saveQuery = saveQuery.eq('delivery_latitude', existingOrder.delivery_latitude)
      if (existingOrder.delivery_longitude == null) saveQuery = saveQuery.is('delivery_longitude', null)
      else saveQuery = saveQuery.eq('delivery_longitude', existingOrder.delivery_longitude)
      if (existingOrder.delivery_city == null) saveQuery = saveQuery.is('delivery_city', null)
      else saveQuery = saveQuery.eq('delivery_city', existingOrder.delivery_city)

      const { data: savedOrder, error: saveError } = await saveQuery.select('*').maybeSingle()
      if (saveError) {
        console.error('Could not save calculated shipping route:', saveError.message)
        return json({ error: 'The route was calculated but could not be saved to this order' }, 500)
      }
      if (!savedOrder) return json({ error: 'This order changed while the route was being calculated. Refresh and try again.' }, 409)
      return json({ distance_km: distanceKm, transit_days: transitDays, duration_seconds: update.shipping_route_duration_seconds, max_snap_distance_m: maxSnapDistanceMeters, order: savedOrder })
    }

    return json({ distance_km: distanceKm, transit_days: transitDays, duration_seconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null, max_snap_distance_m: maxSnapDistanceMeters })
  } catch (error) {
    console.error('calculate-shipping-route failed:', error)
    return json({ error: 'Route calculation failed unexpectedly' }, 500)
  }
})
