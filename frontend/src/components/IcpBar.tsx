import { ThunderboltOutlined, UndoOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Card, Flex, Input, Tag, Typography } from 'antd'
import { useState } from 'react'
import { api } from '../api/client'
import { FILTER_LABELS, sanitizeFilters, type IcpForm } from '../lib/icp'
import { patchFilters, setGoal } from '../store/icpSlice'
import { store, useAppDispatch } from '../store'

const EXAMPLES = [
  'CTOs at fintech startups in Germany',
  'VP Sales at SaaS companies, 50–200 employees, US or UK',
  'Heads of marketing at e-commerce brands in Europe',
]

const describe = (key: string, value: unknown) => {
  const label = FILTER_LABELS[key as keyof IcpForm] ?? key
  if (Array.isArray(value)) return `${label}: ${value.slice(0, 3).join(', ')}${value.length > 3 ? ` +${value.length - 3}` : ''}`
  if (typeof value === 'boolean') return `${label}: ${value ? 'on' : 'off'}`
  return `${label}: ${value}`
}

interface Props {
  /** Called with the filters that were applied, e.g. to sync the antd form. */
  onApplied?: (patch: Partial<IcpForm>) => void
}

/** Describe the customer you want in plain English; the backend turns it into filters. */
export function IcpBar({ onApplied }: Props) {
  const dispatch = useAppDispatch()
  const [text, setText] = useState('')
  const [applied, setApplied] = useState<{ patch: Partial<IcpForm>; previous: Partial<IcpForm> } | null>(null)

  const translate = useMutation({
    mutationFn: (prompt: string) => api.parseIcp(prompt),
    onSuccess: (res) => {
      const patch = sanitizeFilters(res.filters ?? {})
      const current = store.getState().icp.filters
      const previous = Object.fromEntries(Object.keys(patch).map((k) => [k, current[k as keyof IcpForm]])) as Partial<IcpForm>
      dispatch(patchFilters(patch))
      if (res.goal && res.goal > 0) dispatch(setGoal(Math.round(res.goal)))
      setApplied({ patch, previous })
      onApplied?.(patch)
    },
  })

  const run = (prompt = text) => {
    const q = prompt.trim()
    if (!q) return
    setText(q)
    translate.mutate(q)
  }

  const undo = () => {
    if (!applied) return
    dispatch(patchFilters(applied.previous))
    onApplied?.(applied.previous)
    setApplied(null)
  }

  const notFound = translate.error && /\(404\)/.test((translate.error as Error).message)

  return (
    <Card style={{ marginBottom: 20 }} styles={{ body: { padding: 16 } }}>
      <Typography.Text strong>
        <ThunderboltOutlined style={{ color: '#4f46e5' }} /> Describe who you want to reach
      </Typography.Text>
      <Input.Search
        size="large"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. CTOs at fintech startups in Germany"
        enterButton="Build filters"
        loading={translate.isPending}
        onSearch={run}
        maxLength={300}
        style={{ marginTop: 10 }}
      />
      <Flex wrap gap={6} style={{ marginTop: 10 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Try:</Typography.Text>
        {EXAMPLES.map((ex) => (
          <Tag key={ex} style={{ cursor: 'pointer', whiteSpace: 'normal' }} onClick={() => run(ex)}>{ex}</Tag>
        ))}
      </Flex>

      {translate.isError && (
        <Alert
          style={{ marginTop: 12 }}
          type="error"
          showIcon
          message={notFound ? 'The ICP translator isn’t available yet' : 'Couldn’t translate that'}
          description={notFound ? 'The backend has no /api/parse-icp endpoint. Set the filters manually below for now.' : (translate.error as Error).message}
        />
      )}

      {applied && !translate.isPending && (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message={Object.keys(applied.patch).length ? 'Filters updated from your description' : 'Nothing to change — try adding a role, place or industry'}
          description={
            <Flex wrap gap={4}>
              {Object.entries(applied.patch).map(([k, v]) => (
                <Tag key={k} color="blue" style={{ whiteSpace: 'normal' }}>{describe(k, v)}</Tag>
              ))}
            </Flex>
          }
          action={Object.keys(applied.patch).length > 0 && <Button size="small" icon={<UndoOutlined />} onClick={undo}>Undo</Button>}
        />
      )}
    </Card>
  )
}
