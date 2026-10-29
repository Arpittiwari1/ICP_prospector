import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Empty, Flex, Input, Progress, Row, Segmented, Skeleton, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Job, JobStatus } from '../api/types'
import { JobCard } from '../components/JobCard'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { useIsMobile } from '../hooks/useIsMobile'
import { useJobs } from '../hooks/useJob'
import { icpSummary, matchRate, progressPct, timeAgo } from '../lib/format'

type Filter = 'all' | 'running' | 'done' | 'failed'

const inFilter = (s: JobStatus, f: Filter) =>
  f === 'all' || (f === 'running' ? s === 'queued' || s === 'running' : s === f)

const columns: ColumnsType<Job> = [
  {
    title: 'Search',
    key: 'search',
    render: (_, j) => {
      const chips = icpSummary(j)
      return (
        <Flex vertical gap={4}>
          <Typography.Text code style={{ width: 'fit-content' }}>{j.id}</Typography.Text>
          <Flex wrap gap={4}>
            {chips.slice(0, 4).map((c) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}
            {chips.length > 4 && <Tag style={{ margin: 0 }}>+{chips.length - 4}</Tag>}
          </Flex>
        </Flex>
      )
    },
  },
  { title: 'Status', dataIndex: 'status', width: 120, render: (s: JobStatus) => <StatusTag status={s} /> },
  {
    title: 'Progress',
    key: 'progress',
    width: 200,
    render: (_, j) => (
      <Progress percent={progressPct(j)} size="small" status={j.status === 'failed' ? 'exception' : undefined} format={() => `${j.sendable}/${j.goal}`} />
    ),
  },
  { title: 'Found', dataIndex: 'collected', width: 80, align: 'right', sorter: (a, b) => a.collected - b.collected },
  { title: 'Match', key: 'match', width: 80, align: 'right', render: (_, j) => `${matchRate(j)}%`, sorter: (a, b) => matchRate(a) - matchRate(b) },
  {
    title: 'Started',
    dataIndex: 'created',
    width: 140,
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.created - b.created,
    render: (t: number) => <Typography.Text type="secondary" title={new Date(t * 1000).toLocaleString()}>{timeAgo(t)}</Typography.Text>,
  },
]

export function HistoryPage() {
  const { data = [], isPending, error, refetch, isFetching } = useJobs()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const c = { all: data.length, running: 0, done: 0, failed: 0 }
    for (const j of data) {
      if (j.status === 'done') c.done++
      else if (j.status === 'failed') c.failed++
      else c.running++
    }
    return c
  }, [data])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data
      .filter((j) => inFilter(j.status, filter))
      .filter((j) => !q || j.id.includes(q) || icpSummary(j).some((c) => c.toLowerCase().includes(q)))
      .sort((a, b) => b.created - a.created)
  }, [data, filter, query])

  const sendable = data.reduce((n, j) => n + (j.sendable ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Search history"
        subtitle="Every search you've run. Open one to see its leads."
        actions={
          <>
            <Button icon={<ReloadOutlined />} loading={isFetching && !isPending} onClick={() => refetch()}>Refresh</Button>
            <Link to="/search"><Button type="primary" icon={<PlusOutlined />}>New search</Button></Link>
          </>
        }
      />

      {error && <Alert type="error" showIcon message={(error as Error).message} style={{ marginBottom: 16 }} />}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          ['Searches', counts.all],
          ['Completed', counts.done],
          ['Failed', counts.failed],
          ['Sendable leads', sendable],
        ].map(([t, v]) => (
          <Col key={t} xs={12} md={6}>
            <Card size="small"><Statistic title={t} value={v as number} loading={isPending} /></Card>
          </Col>
        ))}
      </Row>

      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { label: `All ${counts.all}`, value: 'all' },
            { label: `Running ${counts.running}`, value: 'running' },
            { label: `Done ${counts.done}`, value: 'done' },
            { label: `Failed ${counts.failed}`, value: 'failed' },
          ]}
          style={{ maxWidth: '100%', overflowX: 'auto' }}
        />
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by title, country, industry or ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: 360 }}
        />
      </Flex>

      {isPending ? (
        <Card><Skeleton active paragraph={{ rows: 5 }} /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty description={data.length ? 'No searches match your filters' : 'No searches yet'}>
            {data.length === 0 && <Link to="/search"><Button type="primary">Start your first search</Button></Link>}
          </Empty>
        </Card>
      ) : mobile ? (
        <Flex vertical gap={12}>{rows.map((j) => <JobCard key={j.id} job={j} />)}</Flex>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <Table<Job>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            onRow={(j) => ({ onClick: () => navigate(`/jobs/${j.id}`), style: { cursor: 'pointer' } })}
          />
        </Card>
      )}
    </>
  )
}
