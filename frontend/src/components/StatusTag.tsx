import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import type { JobStatus } from '../api/types'

const CONFIG: Record<JobStatus, { color: string; icon: React.ReactNode; text: string }> = {
  queued: { color: 'default', icon: <ClockCircleOutlined />, text: 'Queued' },
  running: { color: 'processing', icon: <SyncOutlined spin />, text: 'Searching' },
  done: { color: 'success', icon: <CheckCircleOutlined />, text: 'Complete' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, text: 'Failed' },
}

export function StatusTag({ status }: { status: JobStatus }) {
  const c = CONFIG[status] ?? CONFIG.running
  return (
    <Tag color={c.color} icon={c.icon}>
      {c.text}
    </Tag>
  )
}
