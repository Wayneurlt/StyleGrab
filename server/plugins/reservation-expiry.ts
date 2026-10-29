import { systemActor } from '../lib/actor'
import { expireStaleReservations } from '../services/orders'

/**
 * Every 5 minutes, cancel website orders whose stock reservation expired without confirmation or payment.
 * Safe with multiple instances: each order is locked and re-checked inside its own transaction.
 * Disable with RESERVATION_SWEEP=off (e.g. when running the sweep from an external scheduler instead).
 */
export default defineNitroPlugin((nitro) => {
  if (process.env.RESERVATION_SWEEP === 'off' || import.meta.prerender) return
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const expired = await expireStaleReservations(systemActor)
      if (expired) console.log(JSON.stringify({ level: 'info', msg: 'reservations_expired', count: expired }))
    }
    catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'reservation_sweep_failed', error: (e as Error).message }))
    }
    finally {
      running = false
    }
  }, 5 * 60_000)
  timer.unref?.()
  nitro.hooks.hook('close', () => clearInterval(timer))
})
