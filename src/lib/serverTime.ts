import { supabase } from './supabase'

// Millisecond offset: (Supabase server UTC time) − (device clock time).
// Positive → device is behind; Negative → device is ahead.
let _offset = 0

/**
 * Fetches the server clock once and stores the offset against the device clock.
 * Call this once at app startup. Falls back to device time on error.
 */
export async function initServerTimeOffset(): Promise<void> {
  try {
    const clientBefore = Date.now()
    const { data, error } = await supabase.rpc('get_server_time')
    const clientAfter = Date.now()
    if (error || !data) return
    const serverMs = new Date(data as string).getTime()
    const clientMid = (clientBefore + clientAfter) / 2
    _offset = serverMs - clientMid
  } catch {
    // Silently fall back to device time
  }
}

/**
 * Returns a UTC ISO timestamp corrected using the Supabase server clock.
 * Use this instead of `new Date().toISOString()` when saving to the database.
 */
export function nowISO(): string {
  return new Date(Date.now() + _offset).toISOString()
}

/**
 * Returns today's date string in IST (YYYY-MM-DD), corrected using the server clock.
 * Use this instead of computing today's date from the device clock.
 */
export function todayISTStr(): string {
  // IST = UTC+5:30
  const ms = Date.now() + _offset + 5.5 * 3600 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}
