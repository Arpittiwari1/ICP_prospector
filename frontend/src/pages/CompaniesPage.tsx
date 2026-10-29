import { LinkedinOutlined, SearchOutlined } from '@ant-design/icons'
import { Avatar, Card, Collapse, Empty, Flex, Input, List, Progress, Select, Skeleton, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMemo, useState } from 'react'
import type { Lead } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useIsMobile } from '../hooks/useIsMobile'
import { useJobs } from '../hooks/useJob'

interface Company {
  name: string
  countries: string[]
  contacts: Lead[]
  sendable: number
  avgScore: number
}

const scoreColor = (s: number) => (s >= 80 ? '#52c41a' : s >= 50 ? '#faad14' : '#ff4d4f')

function Contacts({ contacts }: { contacts: Lead[] }) {
  return (
    <List
      size="small"
      dataSource={contacts}
      renderItem={(c) => (
        <List.Item
          extra={c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" aria-label="LinkedIn"><LinkedinOutlined /></a>}
        >
          <List.Item.Meta
            avatar={<Avatar style={{ background: '#4f46e5' }}>{c.first_name?.[0]}</Avatar>}
            title={`${c.first_name} ${c.last_name}`}
            description={
              <>
                {c.title}
                <br />
                {c.email ? <Typography.Text copyable>{c.email}</Typography.Text> : <Typography.Text type="secondary">No email</Typography.Text>}
              </>
            }
          />
        </List.Item>
      )}
    />
  )
}

const columns: ColumnsType<Company> = [
  {
    title: 'Company',
    dataIndex: 'name',
    render: (n: string) => (
      <Flex align="center" gap={10}>
        <Avatar shape="square" style={{ background: '#4f46e5' }}>{n[0]}</Avatar>
        <Typography.Text strong>{n}</Typography.Text>
      </Flex>
    ),
    sorter: (a, b) => a.name.localeCompare(b.name),
  },
  { title: 'Countries', dataIndex: 'countries', width: 130, render: (c: string[]) => c.map((x) => <Tag key={x}>{x}</Tag>) },
  { title: 'Contacts', key: 'contacts', width: 100, align: 'right', render: (_, c) => c.contacts.length, sorter: (a, b) => a.contacts.length - b.contacts.length },
  { title: 'Sendable', dataIndex: 'sendable', width: 100, align: 'right', sorter: (a, b) => a.sendable - b.sendable },
  {
    title: 'Avg ICP fit',
    dataIndex: 'avgScore',
    width: 180,
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.avgScore - b.avgScore,
    render: (s: number) => <Progress percent={s} size="small" strokeColor={scoreColor(s)} />,
  },
]

/** Companies are derived from the leads of every search, grouped by company name. */
export function CompaniesPage() {
  const { data: jobs = [], isPending } = useJobs()
  const mobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState<string | undefined>()

  const companies = useMemo(() => {
    const map = new Map<string, Lead[]>()
    for (const j of jobs) {
      for (const r of j.rows ?? []) {
        if (!r.company) continue
        const list = map.get(r.company) ?? []
        if (!list.some((x) => x.email && x.email === r.email) || !r.email) list.push(r)
        map.set(r.company, list)
      }
    }
    return [...map].map(([name, contacts]): Company => ({
      name,
      contacts,
      countries: [...new Set(contacts.map((c) => c.country).filter(Boolean) as string[])],
      sendable: contacts.filter((c) => c.tab === 'passed_with_email').length,
      avgScore: Math.round(contacts.reduce((s, c) => s + c.icp_score, 0) / contacts.length),
    }))
  }, [jobs])

  const countryOptions = useMemo(
    () => [...new Set(companies.flatMap((c) => c.countries))].sort().map((v) => ({ value: v, label: v })),
    [companies],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return companies
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.contacts.some((p) => p.title?.toLowerCase().includes(q)))
      .filter((c) => !country || c.countries.includes(country))
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [companies, query, country])

  return (
    <>
      <PageHeader title="Companies" subtitle="Accounts found across your searches, with the contacts at each." />

      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search companies or job titles"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: 360 }}
        />
        <Select allowClear placeholder="Country" options={countryOptions} value={country} onChange={setCountry} style={{ minWidth: 140 }} />
      </Flex>

      {isPending ? (
        <Card><Skeleton active paragraph={{ rows: 5 }} /></Card>
      ) : rows.length === 0 ? (
        <Card><Empty description={companies.length ? 'No companies match your filters' : 'Complete a search to see companies here'} /></Card>
      ) : mobile ? (
        <Collapse
          accordion
          items={rows.map((c) => ({
            key: c.name,
            label: (
              <Flex justify="space-between" align="center" gap={8}>
                <Typography.Text strong>{c.name}</Typography.Text>
                <Tag color={c.avgScore >= 80 ? 'green' : c.avgScore >= 50 ? 'gold' : 'red'}>{c.avgScore}%</Tag>
              </Flex>
            ),
            children: <Contacts contacts={c.contacts} />,
          }))}
        />
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <Table<Company>
            rowKey="name"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            expandable={{ expandedRowRender: (c) => <Contacts contacts={c.contacts} /> }}
          />
        </Card>
      )}
    </>
  )
}
