import type { AlertConfig } from '@/types'

// ─── Alert Configuration ─────────────────────────────
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  delayThresholdMinutes: 30,
  queueThreshold: 5,
  taskNotStartedMinutes: 15,
}

