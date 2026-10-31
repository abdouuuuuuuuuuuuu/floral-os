// src/hooks/useNewOrderSound.js
//
// Plays a short two-note chime when a new order lands, if the
// new_order_sound setting is on.
//
// Uses the Web Audio API rather than an audio file — no asset to bundle
// into the Electron build, no load delay, and it works offline.

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useNewOrderSound(enabled) {
  const ctxRef = useRef(null)
  // Ignore the initial burst of events on mount so a page refresh
  // doesn't chime for orders that already existed.
  const readyRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const timer = setTimeout(() => { readyRef.current = true }, 1500)

    const chime = () => {
      if (!readyRef.current) return
      try {
        // Browsers block audio until the user has interacted with the
        // page. On a till that has always happened by now, but bail
        // quietly rather than throw if it hasn't.
        if (!ctxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          if (!Ctx) return
          ctxRef.current = new Ctx()
        }
        const ctx = ctxRef.current
        if (ctx.state === 'suspended') ctx.resume()

        const play = (freq, start, duration) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0, ctx.currentTime + start)
          gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(ctx.currentTime + start)
          osc.stop(ctx.currentTime + start + duration)
        }

        play(880, 0, 0.18)     // A5
        play(1174.7, 0.13, 0.22) // D6
      } catch {
        /* audio unavailable — not worth surfacing */
      }
    }

    const channel = supabase
      .channel('new-order-sound')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        chime
      )
      .subscribe()

    return () => {
      clearTimeout(timer)
      channel.unsubscribe()
    }
  }, [enabled])
}