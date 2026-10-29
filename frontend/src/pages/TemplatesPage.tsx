import { DeleteOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Flex, Popconfirm, Row, Tag, Typography } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { sectionCount } from '../lib/icp'
import { setFilters } from '../store/icpSlice'
import { removeTemplate } from '../store/templatesSlice'
import { useAppDispatch, useAppSelector } from '../store'

const SUMMARY: ['person' | 'location' | 'company' | 'hq', string][] = [
  ['person', 'Person'],
  ['location', 'Location'],
  ['company', 'Company'],
  ['hq', 'HQ'],
]

export function TemplatesPage() {
  const items = useAppSelector((s) => s.templates.items)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = App.useApp()

  return (
    <>
      <PageHeader
        title="Saved profiles"
        subtitle="Reusable ideal customer profiles. Load one to start a search."
        actions={<Link to="/search"><Button type="primary" icon={<PlusOutlined />}>New profile</Button></Link>}
      />

      {items.length === 0 ? (
        <Card>
          <Empty description="No saved profiles yet">
            <Typography.Paragraph type="secondary">Build filters on the search page and choose “Save profile”.</Typography.Paragraph>
            <Link to="/search"><Button type="primary">Build a profile</Button></Link>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((t) => (
            <Col key={t.id} xs={24} md={12} xl={8}>
              <Card
                title={t.name}
                extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString()}</Typography.Text>}
                actions={[
                  <Button
                    key="use"
                    type="link"
                    icon={<PlayCircleOutlined />}
                    onClick={() => {
                      dispatch(setFilters({ filters: t.filters, goal: t.goal }))
                      message.success(`Loaded “${t.name}”`)
                      navigate('/search')
                    }}
                  >
                    Use
                  </Button>,
                  <Popconfirm key="del" title="Delete this profile?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => dispatch(removeTemplate(t.id))}>
                    <Button type="link" danger icon={<DeleteOutlined />}>Delete</Button>
                  </Popconfirm>,
                ]}
              >
                <Flex wrap gap={6}>
                  {t.filters.job_titles_include.slice(0, 3).map((x) => <Tag key={x} color="blue">{x}</Tag>)}
                  {t.filters.person_countries.slice(0, 3).map((x) => <Tag key={x}>{x}</Tag>)}
                  {t.filters.company_industries_include.slice(0, 2).map((x) => <Tag key={x} color="purple">{x}</Tag>)}
                </Flex>
                <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0', fontSize: 12 }}>
                  {SUMMARY.map(([k, n]) => `${n} ${sectionCount(t.filters, k)}`).join(' · ')} · goal {t.goal}
                </Typography.Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  )
}
