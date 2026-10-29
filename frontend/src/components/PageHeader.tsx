import { Flex, Typography } from 'antd'

interface Props {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

/** Wraps on small screens so actions drop below the title instead of overflowing. */
export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <Flex justify="space-between" align="flex-end" wrap gap={12} style={{ marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{title}</Typography.Title>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </div>
      {actions && <Flex gap={8} wrap>{actions}</Flex>}
    </Flex>
  )
}
