export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type LeadTab = 'passed_with_email' | 'passed_without_email' | 'failed'

export interface Lead {
  first_name: string
  last_name: string
  title: string
  company?: string
  country?: string
  email?: string
  icp_score: number
  icp_reason?: string
  tab: LeadTab
  linkedin_url?: string
}

export interface Job {
  id: string
  status: JobStatus
  goal: number
  collected: number
  passed: number
  sendable: number
  created: number
  file: string | null
  error?: string
  rows?: Lead[]
  icp?: IcpPayload
}

/** Nested, pruned ICP payload sent to the backend. */
export type IcpPayload = Record<string, unknown>
