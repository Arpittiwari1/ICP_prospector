import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { IcpPayload, Job } from '../api/types'

const POLL_MS = 800

export const isFinished = (job?: Job) => job?.status === 'done' || job?.status === 'failed'

/** Loads a job and polls until it is done or failed. */
export const useJob = (id: string | undefined) =>
  useQuery({
    queryKey: ['job', id],
    queryFn: () => api.getJob(id!),
    enabled: !!id,
    refetchInterval: (query) => (isFinished(query.state.data) ? false : POLL_MS),
  })

export const useJobs = () => useQuery({ queryKey: ['jobs'], queryFn: api.listJobs })

export const usePoolCount = () => useMutation({ mutationFn: (icp: IcpPayload) => api.count(icp) })

export function useStartJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ icp, goal }: { icp: IcpPayload; goal: number }) => api.startJob(icp, goal),
    onSuccess: (job) => {
      qc.setQueryData(['job', job.id], job)
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
