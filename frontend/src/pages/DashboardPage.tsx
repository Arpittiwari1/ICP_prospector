import { AimOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { Button, Card, Col, Empty, Flex, List, Progress, Row, Skeleton, Statistic, Typography } from 'antd'
import { lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IcpBar } from '../components/IcpBar'
import { PageHeader } from '../components/PageHeader'
import { StatusTag } from '../components/StatusTag'
import { useJobs } from '../hooks/useJob'
import { icpSummary, matchRate, progressPct, timeAgo } from '../lib/format'

const DashboardCharts = lazy(() => import('../components/DashboardCharts'))

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)

export function DashboardPage() {
  const { data: jobs = [], isPending } = useJobs()
  const navigate = useNavigate()

  const totals = jobs.reduce(
    (t, j) => ({ found: t.found + (j.collected ?? 0), passed: t.passed + (j.passed ?? 0), sendable: t.sendable + (j.sendable ?? 0) }),
    { found: 0, passed: 0, sendable: 0 },
  )
  const recent = jobs.slice(0, 5)

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your prospecting at a glance" />

      <IcpBar onApplied={() => navigate('/search')} />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Searches run', value: jobs.length },
          { title: 'Leads found', value: totals.found },
          { title: 'Email-sendable', value: totals.sendable },
          { title: 'Avg match rate', value: pct(totals.passed, totals.found), suffix: '%' },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <Card size="small"><Statistic loading={isPending} title={s.title} value={s.value} suffix={s.suffix} /></Card>
          </Col>
        ))}
      </Row>

      {!isPending && (
        <Suspense fallback={<Card style={{ marginBottom: 16 }}><Skeleton active /></Card>}>
          <DashboardCharts jobs={jobs} />
        </Suspense>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card
            title="Recent searches"
            extra={<Link to="/jobs">View all <ArrowRightOutlined /></Link>}
            styles={{ body: { padding: '4px 16px' } }}
          >
            <List
              loading={isPending}
              dataSource={recent}
              locale={{ emptyText: <Empty description="No searches yet"><Button type="primary" icon={<AimOutlined />} onClick={() => navigate('/search')}>Start a search</Button></Empty> }}
              renderItem={(j) => (
                <List.Item onClick={() => navigate(`/jobs/${j.id}`)} style={{ cursor: 'pointer' }}>
                  <Flex vertical gap={4} style={{ width: '100%' }}>
                    <Flex justify="space-between" align="center" gap={8}>
                      <Typography.Text ellipsis style={{ maxWidth: '70%' }}>
                        {icpSummary(j).slice(0, 3).join(' · ') || `Job ${j.id}`}
                      </Typography.Text>
                      <StatusTag status={j.status} />
                    </Flex>
                    <Progress percent={progressPct(j)} size="small" status={j.status === 'failed' ? 'exception' : undefined} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {timeAgo(j.created)} · {j.sendable}/{j.goal} sendable · {matchRate(j)}% matched
                    </Typography.Text>
                  </Flex>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}
