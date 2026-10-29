import { Column, Funnel, Pie } from '@ant-design/charts'
import { Card, Col, Empty, Row } from 'antd'
import type { Job } from '../api/types'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAppSelector } from '../store'

const COLORS = ['#4f46e5', '#1677ff', '#52c41a', '#faad14', '#ff4d4f']

/** Charts for the dashboard; kept in their own module so the chart library loads lazily. */
export default function DashboardCharts({ jobs }: { jobs: Job[] }) {
  const dark = useAppSelector((s) => s.ui.dark)
  const mobile = useIsMobile()
  const height = mobile ? 240 : 280
  const theme = dark ? 'classicDark' : 'classic'

  const found = jobs.reduce((n, j) => n + (j.collected ?? 0), 0)
  const passed = jobs.reduce((n, j) => n + (j.passed ?? 0), 0)
  const sendable = jobs.reduce((n, j) => n + (j.sendable ?? 0), 0)

  const funnel = [
    { stage: 'Found', value: found },
    { stage: 'Matched ICP', value: passed },
    { stage: 'Sendable', value: sendable },
  ]

  const outcomes = [
    { type: 'Sendable', value: sendable },
    { type: 'Matched, no email', value: Math.max(0, passed - sendable) },
    { type: 'Off-ICP', value: Math.max(0, found - passed) },
  ].filter((d) => d.value > 0)

  const perSearch = [...jobs]
    .sort((a, b) => a.created - b.created)
    .slice(-8)
    .flatMap((j, i) => [
      { search: `#${i + 1}`, kind: 'Sendable', value: j.sendable ?? 0 },
      { search: `#${i + 1}`, kind: 'Goal', value: j.goal },
    ])

  if (found === 0)
    return <Card style={{ marginBottom: 16 }}><Empty description="Run a search to see your charts" /></Card>

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      <Col xs={24} lg={8}>
        <Card title="Lead funnel">
          <Funnel data={funnel} xField="stage" yField="value" height={height} theme={theme} scale={{ color: { range: COLORS } }} legend={false} />
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title="Lead outcomes">
          <Pie
            data={outcomes}
            angleField="value"
            colorField="type"
            innerRadius={0.6}
            height={height}
            theme={theme}
            scale={{ color: { range: ['#52c41a', '#faad14', '#ff4d4f'] } }}
            legend={{ color: { position: 'bottom', layout: { justifyContent: 'center' } } }}
          />
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card title="Sendable vs goal, per search">
          <Column
            data={perSearch}
            xField="search"
            yField="value"
            colorField="kind"
            group
            height={height}
            theme={theme}
            scale={{ color: { range: ['#52c41a', '#d9d9d9'] } }}
            legend={{ color: { position: 'bottom', layout: { justifyContent: 'center' } } }}
          />
        </Card>
      </Col>
    </Row>
  )
}
