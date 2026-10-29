import {
  AimOutlined,
  BankOutlined,
  BookOutlined,
  DashboardOutlined,
  HistoryOutlined,
  MenuOutlined,
  MoonOutlined,
  RadarChartOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Flex, Layout, Menu, Tooltip, Typography, theme } from 'antd'
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'

const { Sider, Header, Content } = Layout

const NAV = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/search', icon: <AimOutlined />, label: 'New search' },
  { key: '/jobs', icon: <HistoryOutlined />, label: 'Search history' },
  { key: '/companies', icon: <BankOutlined />, label: 'Companies' },
  { key: '/templates', icon: <BookOutlined />, label: 'Saved profiles' },
]

const activeKey = (path: string) =>
  path === '/' ? '/' : (NAV.slice(1).find((n) => path.startsWith(n.key))?.key ?? '/')

interface Props {
  dark: boolean
  onToggleTheme: () => void
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { token } = theme.useToken()
  return (
    <Flex align="center" gap={10} style={{ height: 64, padding: '0 24px' }}>
      <RadarChartOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
      {!collapsed && (
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          ICP Prospector
        </Typography.Text>
      )}
    </Flex>
  )
}

export function AppShell({ dark, onToggleTheme }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const mobile = useIsMobile()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()

  const menu = (
    <Menu
      mode="inline"
      theme={dark ? 'dark' : 'light'}
      selectedKeys={[activeKey(pathname)]}
      style={{ borderInlineEnd: 0, background: 'transparent' }}
      items={NAV}
      onClick={({ key }) => {
        navigate(key)
        setDrawer(false)
      }}
    />
  )

  return (
    <Layout style={{ minHeight: '100%' }}>
      {!mobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={232}
          theme={dark ? 'dark' : 'light'}
          style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, position: 'sticky', top: 0, height: '100vh' }}
        >
          <Brand collapsed={collapsed} />
          {menu}
        </Sider>
      )}

      <Drawer
        placement="left"
        open={mobile && drawer}
        onClose={() => setDrawer(false)}
        width={260}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <Brand />
        {menu}
      </Drawer>

      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: mobile ? '0 12px' : '0 24px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Flex align="center" gap={8} style={{ minWidth: 0 }}>
            {mobile && <Button type="text" aria-label="Open menu" icon={<MenuOutlined />} onClick={() => setDrawer(true)} />}
            {mobile ? (
              <Link to="/" style={{ color: 'inherit' }}>
                <Typography.Text strong>ICP Prospector</Typography.Text>
              </Link>
            ) : (
              <Typography.Text type="secondary">Find the right people, verified and ready to email</Typography.Text>
            )}
          </Flex>
          <Tooltip title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Button
              type="text"
              shape="circle"
              aria-label="Toggle theme"
              icon={dark ? <SunOutlined /> : <MoonOutlined />}
              onClick={onToggleTheme}
            />
          </Tooltip>
        </Header>
        <Content style={{ padding: mobile ? 16 : 24 }}>
          <div className="page">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
