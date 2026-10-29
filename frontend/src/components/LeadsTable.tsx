import { LinkedinOutlined } from '@ant-design/icons'
import { Card, Empty, Flex, List, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import type { Lead, LeadTab } from '../api/types'
import { useIsMobile } from '../hooks/useIsMobile'

const TAG: Record<LeadTab, { color: string; text: string }> = {
  passed_with_email: { color: 'green', text: 'Sendable' },
  passed_without_email: { color: 'gold', text: 'No email' },
  failed: { color: 'red', text: 'Off-ICP' },
}

const scoreColor = (s: number) => (s >= 80 ? '#52c41a' : s >= 50 ? '#faad14' : '#ff4d4f')

const columns: ColumnsType<Lead> = [
  {
    title: 'Name',
    key: 'name',
    fixed: 'left',
    render: (_, r) => <Typography.Text strong>{r.first_name} {r.last_name}</Typography.Text>,
    sorter: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
  },
  { title: 'Title', dataIndex: 'title', ellipsis: true },
  { title: 'Company', dataIndex: 'company', render: (v) => v || '—' },
  { title: 'Country', dataIndex: 'country', width: 90, render: (v) => (v ? <Tag>{v}</Tag> : '—') },
  {
    title: 'Email',
    dataIndex: 'email',
    render: (v) => (v ? <Typography.Text copyable>{v}</Typography.Text> : <Typography.Text type="secondary">None</Typography.Text>),
  },
  {
    title: 'ICP score',
    dataIndex: 'icp_score',
    width: 110,
    sorter: (a, b) => a.icp_score - b.icp_score,
    defaultSortOrder: 'descend',
    render: (v: number) => <Typography.Text strong style={{ color: scoreColor(v) }}>{v}%</Typography.Text>,
  },
  {
    title: 'Status',
    dataIndex: 'tab',
    width: 110,
    render: (tab: LeadTab, r) => (
      <Tooltip title={r.icp_reason || undefined}>
        <Tag color={TAG[tab].color}>{TAG[tab].text}</Tag>
      </Tooltip>
    ),
  },
  {
    title: '',
    dataIndex: 'linkedin_url',
    width: 56,
    render: (url?: string) =>
      url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label="LinkedIn profile">
          <LinkedinOutlined />
        </a>
      ) : null,
  },
]

export function LeadsTable({ rows, total }: { rows: Lead[]; total: number }) {
  const [tab, setTab] = useState<'all' | LeadTab>('all')
  const mobile = useIsMobile()

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    for (const r of rows) c[r.tab] = (c[r.tab] ?? 0) + 1
    return c
  }, [rows])

  const data = tab === 'all' ? rows : rows.filter((r) => r.tab === tab)

  return (
    <>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'all', label: `All (${counts.all})` },
          { key: 'passed_with_email', label: `Sendable (${counts.passed_with_email ?? 0})` },
          { key: 'passed_without_email', label: `No email (${counts.passed_without_email ?? 0})` },
          { key: 'failed', label: `Off-ICP (${counts.failed ?? 0})` },
        ]}
      />
      {mobile ? (
        <List
          dataSource={data}
          locale={{ emptyText: <Empty description="No leads in this view" /> }}
          pagination={{ pageSize: 8, size: 'small', align: 'center', hideOnSinglePage: true }}
          renderItem={(r) => (
            <Card size="small" style={{ marginBottom: 10 }}>
              <Flex justify="space-between" align="start" gap={8}>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong>{r.first_name} {r.last_name}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>{r.title}{r.company ? ` · ${r.company}` : ''}</Typography.Text>
                </div>
                <Typography.Text strong style={{ color: scoreColor(r.icp_score) }}>{r.icp_score}%</Typography.Text>
              </Flex>
              <Flex justify="space-between" align="center" wrap gap={6} style={{ marginTop: 8 }}>
                {r.email ? <Typography.Text copyable style={{ fontSize: 13 }}>{r.email}</Typography.Text> : <Typography.Text type="secondary">No email</Typography.Text>}
                <span>
                  {r.country && <Tag>{r.country}</Tag>}
                  <Tag color={TAG[r.tab].color} style={{ marginInlineEnd: 0 }}>{TAG[r.tab].text}</Tag>
                </span>
              </Flex>
            </Card>
          )}
        />
      ) : (
        <Table<Lead>
          rowKey={(r, i) => r.email || `${r.first_name}-${r.last_name}-${i}`}
          columns={columns}
          dataSource={data}
          size="middle"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: () => `Previewing ${rows.length} of ${total} leads — download the CSV for the full set` }}
          locale={{ emptyText: <Empty description="No leads in this view" /> }}
        />
      )}
    </>
  )
}
