import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Flex, Progress, Result, Skeleton, Space, Steps, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Job } from '../api/types'
import { JobStats } from '../components/JobStats'
import { LeadsTable } from '../components/LeadsTable'
import { StatusTag } from '../components/StatusTag'
import { useJob } from '../hooks/useJob'

const stepIndex = (job: Job) => {
  if (job.status === 'done') return 4
  if (job.status === 'queued') return 0
  if (job.sendable > 0) return 3
  if (job.passed > 0) return 2
  return 1
}

export function JobPage() {
  const { id } = useParams()
  const { data: job, error, isPending } = useJob(id)

  if (error)
    return (
      <Result
        status="404"
        title="Couldn't load this search"
        subTitle={(error as Error).message}
        extra={<Link to="/search"><Button type="primary">New search</Button></Link>}
      />
    )

  if (isPending || !job) return <Card><Skeleton active paragraph={{ rows: 6 }} /></Card>

  const percent = Math.min(100, Math.round(((job.sendable ?? 0) / job.goal) * 100))
  const finished = job.status === 'done'

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Space size={12} align="center">
          <Link to="/jobs"><Button type="text" icon={<ArrowLeftOutlined />} aria-label="Back to history" /></Link>
          <Typography.Title level={3} style={{ margin: 0 }}>{finished ? 'Your leads' : 'Search in progress'}</Typography.Title>
          <StatusTag status={job.status} />
        </Space>
        <Space wrap>
          {finished && job.file && (
            <Button type="primary" icon={<DownloadOutlined />} href={api.downloadUrl(job.id)}>Download CSV</Button>
          )}
          <Link to="/search"><Button icon={<PlusOutlined />}>New search</Button></Link>
        </Space>
      </Flex>

      {job.status === 'failed' && <Alert type="error" showIcon message="Search failed" description={job.error || 'Something went wrong'} />}

      <Card>
        <Steps
          size="small"
          current={stepIndex(job)}
          status={job.status === 'failed' ? 'error' : undefined}
          items={[
            { title: 'Queued' },
            { title: 'Search provider' },
            { title: 'ICP classifier' },
            { title: 'Email verify' },
            { title: 'Complete' },
          ]}
        />
        <Progress
          percent={percent}
          status={job.status === 'failed' ? 'exception' : finished ? 'success' : 'active'}
          style={{ marginTop: 24 }}
          format={() => `${job.sendable ?? 0} / ${job.goal} sendable`}
        />
      </Card>

      <JobStats job={job} />

      {finished && (
        <Card>
          <Descriptions size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 8 }}>
            <Descriptions.Item label="Job ID"><Typography.Text code copyable>{job.id}</Typography.Text></Descriptions.Item>
            {job.file && <Descriptions.Item label="File"><Typography.Text code>{job.file.split(/[\\/]/).pop()}</Typography.Text></Descriptions.Item>}
          </Descriptions>
          {job.rows?.length ? (
            <LeadsTable rows={job.rows} total={job.collected} />
          ) : (
            <Result status="info" title="No leads to preview" subTitle="Try loosening your filters and searching again." />
          )}
        </Card>
      )}
    </Space>
  )
}
