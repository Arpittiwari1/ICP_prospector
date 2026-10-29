import type { Job } from '../api/types'

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "5 minutes ago", "yesterday"; `epochSeconds` is the backend's `created` value. */
export function timeAgo(epochSeconds: number): string {
  const diff = epochSeconds - Date.now() / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit)
  }
  return 'just now'
}

export const progressPct = (job: Job) => Math.min(100, Math.round(((job.sendable ?? 0) / (job.goal || 1)) * 100))

export const matchRate = (job: Job) => (job.collected ? Math.round((job.passed / job.collected) * 100) : 0)

/** Short human labels for the ICP a job ran with, e.g. ["CEO", "CTO", "US", "SaaS"]. */
export function icpSummary(job: Job): string[] {
  const icp = (job.icp ?? {}) as Record<string, unknown>
  const pick = (k: string) => (Array.isArray(icp[k]) ? (icp[k] as string[]) : [])
  return [...pick('titles'), ...pick('countries'), ...pick('industries')]
}
