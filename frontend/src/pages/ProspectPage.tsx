import { RocketOutlined, SaveOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Divider, Flex, Form, Input, InputNumber, Modal, Row, Space, Statistic, Typography, theme } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilterForm } from '../components/FilterForm'
import { IcpBar } from '../components/IcpBar'
import { PageHeader } from '../components/PageHeader'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePoolCount, useStartJob } from '../hooks/useJob'
import { buildIcp, sectionCount, type IcpForm, type SectionKey } from '../lib/icp'
import { resetFilters, setGoal } from '../store/icpSlice'
import { addTemplate } from '../store/templatesSlice'
import { useAppDispatch, useAppSelector } from '../store'

const SECTIONS: [SectionKey, string][] = [
  ['person', 'Person'],
  ['location', 'Person location'],
  ['company', 'Company'],
  ['hq', 'Company HQ'],
]

export function ProspectPage() {
  const [form] = Form.useForm<IcpForm>()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { message } = App.useApp()
  const { token } = theme.useToken()

  const filters = useAppSelector((s) => s.icp.filters)
  const goal = useAppSelector((s) => s.icp.goal)

  const pool = usePoolCount()
  const start = useStartJob()

  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const payload = () => buildIcp(filters, goal)

  const reset = () => {
    dispatch(resetFilters())
    form.resetFields()
    pool.reset()
    message.info('Filters reset to the default profile')
  }

  const run = () => start.mutate({ icp: payload(), goal }, { onSuccess: (job) => navigate(`/jobs/${job.id}`) })

  const save = () => {
    const n = name.trim()
    if (!n) return
    dispatch(addTemplate({ name: n, filters, goal }))
    setSaving(false)
    setName('')
    message.success('Profile saved')
  }

  const error = pool.error ?? start.error

  const findButton = (
    <Button type="primary" size="large" block icon={<RocketOutlined />} loading={start.isPending} onClick={run}>
      Find leads
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Build your ideal customer profile"
        subtitle="Describe who you want, fine-tune the filters, then we find, score and verify leads."
        actions={
          <>
            <Button icon={<SaveOutlined />} onClick={() => setSaving(true)}>Save profile</Button>
            <Button icon={<UndoOutlined />} onClick={reset}>Reset</Button>
          </>
        }
      />

      <IcpBar onApplied={(patch) => form.setFieldsValue(patch)} />

      {error && <Alert type="error" showIcon closable message={(error as Error).message} style={{ marginBottom: 16 }} />}

      <Row gutter={24} align="top">
        <Col xs={24} lg={16}>
          <FilterForm form={form} />
        </Col>
        <Col xs={24} lg={8} style={{ marginTop: mobile ? 16 : 0, marginBottom: mobile ? 72 : 0 }}>
          <Card className={mobile ? undefined : 'sticky-panel'} title="Run search">
            <Typography.Text type="secondary">Goal: email-sendable leads</Typography.Text>
            <InputNumber
              size="large"
              min={1}
              max={50000}
              value={goal}
              onChange={(v) => dispatch(setGoal(v ?? 25))}
              style={{ width: '100%', margin: '8px 0 16px' }}
            />

            <Statistic title="Estimated pool size" value={pool.data ?? 0} formatter={(v) => (pool.data == null ? '—' : Number(v).toLocaleString())} />
            <Button block icon={<SearchOutlined />} loading={pool.isPending} onClick={() => pool.mutate(payload())} style={{ marginTop: 12 }}>
              Check pool size
            </Button>

            <Divider style={{ margin: '16px 0' }} />

            <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: mobile ? 0 : 16 }}>
              <Typography.Text strong>Active filters</Typography.Text>
              {SECTIONS.map(([key, label]) => (
                <Flex key={key} justify="space-between">
                  <Typography.Text type="secondary">{label}</Typography.Text>
                  <Typography.Text>{sectionCount(filters, key)} groups</Typography.Text>
                </Flex>
              ))}
            </Space>

            {!mobile && findButton}
          </Card>
        </Col>
      </Row>

      {mobile && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
            background: token.colorBgContainer,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {findButton}
        </div>
      )}

      <Modal
        title="Save this profile"
        open={saving}
        okText="Save"
        okButtonProps={{ disabled: !name.trim() }}
        onOk={save}
        onCancel={() => setSaving(false)}
        destroyOnClose
      >
        <Input autoFocus placeholder="e.g. DACH fintech CTOs" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onPressEnter={save} />
      </Modal>
    </>
  )
}
