import type { IcpPayload, Job } from './types'

const API = import.meta.env.VITE_API_BASE || ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) {
    const detail = await res.json().then((b) => b?.detail).catch(() => null)
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const api = {
  count: (icp: IcpPayload) => post<{ count: number }>('/api/count', icp).then((r) => r.count),
  startJob: (icp: IcpPayload, goal: number) => post<Job>('/api/jobs', { icp, goal }),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),
  listJobs: () => request<{ jobs: Job[] }>('/api/jobs').then((r) => r.jobs),
  parseIcp: (prompt: string) =>
    post<{ filters: Record<string, unknown>; goal?: number }>('/api/parse-icp', { prompt }),
  downloadUrl: (id: string) => `${API}/api/jobs/${id}/download`,
}
