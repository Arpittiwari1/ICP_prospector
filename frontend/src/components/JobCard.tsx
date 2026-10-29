import { Card, Flex, Progress, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import type { Job } from '../api/types'
import { icpSummary, matchRate, progressPct, timeAgo } from '../lib/format'
import { StatusTag } from './StatusTag'

/** Touch-friendly job summary used on phones in place of the table row. */
export function JobCard({ job }: { job: Job }) {
  const chips = icpSummary(job)
  return (
    <Link to={`/jobs/${job.id}`} style={{ display: 'block' }}>
      <Card size="small" hoverable>
        <Flex justify="space-between" align="center" gap={8}>
          <StatusTag status={job.status} />
          <Typography.Text type="secondary">{timeAgo(job.created)}</Typography.Text>
        </Flex>
        <Progress
          percent={progressPct(job)}
          size="small"
          status={job.status === 'failed' ? 'exception' : undefined}
          format={() => `${job.sendable}/${job.goal}`}
          style={{ marginTop: 8 }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {job.collected} found · {matchRate(job)}% matched
        </Typography.Text>
        {chips.length > 0 && (
          <Flex wrap gap={4} style={{ marginTop: 8 }}>
            {chips.slice(0, 4).map((c) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}
            {chips.length > 4 && <Tag style={{ margin: 0 }}>+{chips.length - 4}</Tag>}
          </Flex>
        )}
      </Card>
    </Link>
  )
}
