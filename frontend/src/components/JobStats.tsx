import { Card, Col, Row, Statistic } from 'antd'
import type { Job } from '../api/types'

export function JobStats({ job }: { job: Job }) {
  const found = job.collected ?? 0
  const matched = job.passed ?? 0
  const sendable = job.sendable ?? 0

  const items = [
    { title: 'Leads found', value: found },
    { title: 'Matched your ICP', value: matched, suffix: found ? `· ${Math.round((matched / found) * 100)}%` : undefined },
    { title: 'Email-sendable', value: sendable, color: '#52c41a' },
    { title: 'Matched, no email', value: Math.max(0, matched - sendable) },
    { title: 'Off-ICP', value: Math.max(0, found - matched) },
  ]

  return (
    <Row gutter={[16, 16]}>
      {items.map((s) => (
        <Col key={s.title} xs={12} md={8} xl={{ flex: '1 1 0' }}>
          <Card size="small" className="stat-card">
            <Statistic title={s.title} value={s.value} suffix={s.suffix} valueStyle={s.color ? { color: s.color } : undefined} />
          </Card>
        </Col>
      ))}
    </Row>
  )
}
