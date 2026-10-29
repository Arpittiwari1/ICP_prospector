import { App as AntApp, ConfigProvider, Skeleton, theme } from 'antd'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAppDispatch, useAppSelector } from './store'
import { toggleTheme } from './store/uiSlice'

const page = <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })))

const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage')
const ProspectPage = page(() => import('./pages/ProspectPage'), 'ProspectPage')
const HistoryPage = page(() => import('./pages/HistoryPage'), 'HistoryPage')
const JobPage = page(() => import('./pages/JobPage'), 'JobPage')
const CompaniesPage = page(() => import('./pages/CompaniesPage'), 'CompaniesPage')
const TemplatesPage = page(() => import('./pages/TemplatesPage'), 'TemplatesPage')

export default function App() {
  const dark = useAppSelector((s) => s.ui.dark)
  const dispatch = useAppDispatch()

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#4f46e5', borderRadius: 10, fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" },
        components: { Layout: { headerHeight: 64 } },
      }}
    >
      <AntApp>
        <Suspense fallback={<Skeleton active style={{ padding: 24 }} />}>
          <Routes>
            <Route element={<AppShell dark={dark} onToggleTheme={() => dispatch(toggleTheme())} />}>
              <Route index element={<DashboardPage />} />
              <Route path="search" element={<ProspectPage />} />
              <Route path="jobs" element={<HistoryPage />} />
              <Route path="jobs/:id" element={<JobPage />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </AntApp>
    </ConfigProvider>
  )
}
