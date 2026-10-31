import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const PAGE_NAMES = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/cart': 'Cart',
  '/checkout': 'Checkout',
  '/orders': 'Orders',
  '/delivery': 'Delivery',
  '/team': 'Team',
  '/settings': 'Settings',
  '/customers': 'Customers',
  '/reports': 'Reports',
  '/suppliers': 'Suppliers',
  '/coffre-forte': 'Coffre Forte',
}

const CURSOR_CHANNEL = 'blossom-live-cursors'

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B'
}

function describeActivity(target, pathname) {
  const page = PAGE_NAMES[pathname] || 'Blossom'
  const field = target?.closest?.('input, textarea, select')
  if (field) {
    if (field.type === 'search' || field.getAttribute('role') === 'searchbox') return `Searching ${page}`
    const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || field.placeholder
    return label ? `Editing ${label.slice(0, 30)}` : `Editing ${page}`
  }

  const action = target?.closest?.('button, [role="button"], a')
  const actionName = action?.getAttribute('aria-label') || action?.getAttribute('title') || action?.textContent?.trim().replace(/\s+/g, ' ')
  return actionName ? `${page} · ${actionName.slice(0, 32)}` : `On ${page}`
}

function PeerCursor({ peer, cursor }) {
  const [imageFailed, setImageFailed] = useState(false)
  const x = Math.round(cursor.x * window.innerWidth)
  const y = Math.round(cursor.y * window.innerHeight)
  const labelOnLeft = x > window.innerWidth - 230

  return (
    <div
      className="live-peer-cursor"
      style={{ left: x, top: y, '--peer-color': peer.color }}
      aria-hidden="true"
    >
      <svg className="live-peer-pointer" width="18" height="23" viewBox="0 0 18 23" fill="none">
        <path d="M2 1.5L15.5 13.2L9.4 14.1L6.3 20.8L2 1.5Z" fill="var(--peer-color)" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <div className={`live-peer-label ${labelOnLeft ? 'live-peer-label-left' : ''}`}>
        <span className="live-peer-avatar">
          {peer.avatarUrl && !imageFailed ? <img src={peer.avatarUrl} alt="" onError={() => setImageFailed(true)} /> : initials(peer.name)}
        </span>
        <span className="live-peer-copy">
          <span className="live-peer-name">{peer.name}</span>
          <span className="live-peer-activity">{peer.activity}</span>
        </span>
      </div>
    </div>
  )
}

function LiveCursorPresence() {
  const { user, profile, role } = useAuth()
  const { pathname } = useLocation()
  const [peers, setPeers] = useState({})
  const [cursors, setCursors] = useState({})
  const channelRef = useRef(null)
  const subscribedRef = useRef(false)
  const latestPositionRef = useRef(null)
  const activityRef = useRef(`On ${PAGE_NAMES[pathname] || 'Blossom'}`)
  const throttleRef = useRef(0)

  const color = useMemo(() => {
    const palette = ['#c02672', '#7c3aed', '#0f766e', '#2563eb', '#d97706', '#0891b2']
    const seed = (user?.id || 'blossom').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
    return palette[seed % palette.length]
  }, [user?.id])

  const presenceInfo = useCallback(() => ({
    userId: user?.id,
    name: profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'Team member',
    avatarUrl: profile?.avatar_url || null,
    role: role || profile?.role || 'staff',
    color,
    pathname,
    activity: activityRef.current,
    active: document.visibilityState === 'visible',
    ...latestPositionRef.current,
  }), [user?.id, user?.email, profile?.full_name, profile?.username, profile?.avatar_url, profile?.role, role, color, pathname])
  const presenceInfoRef = useRef(presenceInfo)
  presenceInfoRef.current = presenceInfo

  const updatePresence = useCallback(() => {
    if (subscribedRef.current) channelRef.current?.track(presenceInfo())
  }, [presenceInfo])

  useEffect(() => {
    if (!user?.id) return undefined

    let alive = true
    subscribedRef.current = false
    const channel = supabase.channel(CURSOR_CHANNEL, {
      config: {
        private: true,
        presence: { key: user.id },
        broadcast: { self: false },
      },
    })

    channelRef.current = channel
    channel
      .on('presence', { event: 'sync' }, () => {
        if (!alive) return
        const state = channel.presenceState()
        const nextPeers = {}
        Object.values(state).flat().forEach((presence) => {
          if (presence.userId && presence.userId !== user.id && presence.active !== false) {
            nextPeers[presence.userId] = presence
          }
        })
        setPeers(nextPeers)
        setCursors((current) => Object.fromEntries(Object.entries(current).filter(([peerId]) => nextPeers[peerId])))
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (!alive || !payload?.userId || payload.userId === user.id) return
        setCursors((current) => ({ ...current, [payload.userId]: { x: payload.x, y: payload.y } }))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && alive) {
          subscribedRef.current = true
          await channel.track(presenceInfoRef.current())
        }
      })

    return () => {
      alive = false
      subscribedRef.current = false
      channelRef.current = null
      supabase.removeChannel(channel).catch(() => {})
    }
  }, [user?.id])

  useEffect(() => {
    activityRef.current = `On ${PAGE_NAMES[pathname] || 'Blossom'}`
    updatePresence()
  }, [pathname, updatePresence])

  useEffect(() => {
    updatePresence()
  }, [profile?.avatar_url, profile?.full_name, profile?.username, role, updatePresence])

  useEffect(() => {
    const handlePointerMove = (event) => {
      const now = performance.now()
      if (now - throttleRef.current < 65) return
      throttleRef.current = now
      const position = {
        x: Math.max(0, Math.min(1, event.clientX / Math.max(window.innerWidth, 1))),
        y: Math.max(0, Math.min(1, event.clientY / Math.max(window.innerHeight, 1))),
      }
      latestPositionRef.current = position
      const channel = channelRef.current
      if (subscribedRef.current && channel?.channelAdapter?.canPush()) {
        const payload = { userId: user.id, ...position }
        // Push directly through the joined WebSocket adapter. RealtimeChannel.send()
        // falls back to REST during transient disconnects, which is noisy and
        // needlessly expensive for high-frequency cursor movement.
        try { channel.channelAdapter.push('broadcast', { type: 'broadcast', event: 'cursor', payload }) } catch {}
      }
    }

    const handleActivity = (event) => {
      activityRef.current = describeActivity(event.target, pathname)
      updatePresence()
    }

    const handleVisibility = () => updatePresence()

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('focusin', handleActivity, true)
    window.addEventListener('pointerdown', handleActivity, true)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('focusin', handleActivity, true)
      window.removeEventListener('pointerdown', handleActivity, true)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user?.id, pathname, updatePresence])

  return (
    <div className="live-presence-layer" aria-hidden="true">
      {Object.entries(cursors).map(([peerId, cursor]) => {
        const peer = peers[peerId]
        if (!peer || peer.active === false || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null
        return <PeerCursor key={peerId} peer={peer} cursor={cursor} />
      })}
    </div>
  )
}

export default LiveCursorPresence
