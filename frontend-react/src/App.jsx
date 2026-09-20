import { useState } from 'react'
import './App.css'
import { BLITZ_DATA } from './data/blitzData'
import { ChipsInput } from './components/ChipsInput'
import { CheckboxGrid, RangeRow } from './components/CheckboxGrid'

const API = import.meta.env.VITE_API_BASE || ''

/* ── helpers ── */
const num = (v) => (v === '' || v == null) ? undefined : Number(v)
const prune = (obj) => {
  if (Array.isArray(obj)) return obj.length ? obj : undefined
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      const p = prune(v)
      if (p !== undefined) out[k] = p
    }
    return Object.keys(out).length ? out : undefined
  }
  return (obj === undefined || obj === '') ? undefined : obj
}

const DEFAULT_ICP = {
  job_titles_include: ['CEO', 'Founder', 'CTO', 'VP Sales', 'VP Marketing', 'Head of Engineering', 'Head of Sales', 'Head of Marketing', 'Head of Product', 'Director of Engineering', 'Engineering Manager', 'Sales Manager', 'Marketing Manager', 'Product Manager'],
  job_titles_exclude: [],
  job_titles_exact: false,
  job_titles_headline: false,
  job_titles_current: true,
  job_levels: ['C-Team', 'VP', 'Director', 'Manager'],
  job_functions: ['Advertising & Marketing', 'Sales & Business Development', 'Engineering', 'Information Technology'],
  person_countries: ['US', 'GB', 'DE', 'FR', 'NL', 'CA', 'AU'],
  person_cities: [],
  person_regions: [],
  person_continents: [],
  min_connections: null,
  company_employee_ranges: ['11-50', '51-200', '201-500', '501-1000', '1001-5000'],
  company_emp_min: null,
  company_emp_max: null,
  company_founded_min: null,
  company_founded_max: null,
  company_industries_include: ['Software Development', 'Information Technology and Services', 'Computer Software', 'SaaS', 'FinTech', 'Cybersecurity'],
  company_industries_exclude: [],
  company_keywords_include: [],
  company_keywords_exclude: [],
  company_names_include: [],
  company_names_exclude: [],
  company_linkedin_urls: [],
  company_domains: [],
  company_hq_countries: [],
  company_hq_cities_include: [],
  company_hq_cities_exclude: [],
  company_hq_regions: [],
  company_hq_continents: [],
  company_types: ['Privately Held', 'Public Company'],
  company_min_followers: null,
}

function App() {
  const [icp, setIcp] = useState(DEFAULT_ICP)
  const [goal, setGoal] = useState(25)
  const [job, setJob] = useState(null)
  const [count, setCount] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('form')
  const [error, setError] = useState(null)

  /* collapsible panel state */
  const [open, setOpen] = useState({ person: true, location: false, company: false, companyGeo: false })
  const toggle = (k) => setOpen(p => ({ ...p, [k]: !p[k] }))

  const update = (path, value) => {
    setIcp(prev => {
      const next = { ...prev }
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]] = { ...obj[keys[i]] }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  /* ── options ── */
  const countryOpts = BLITZ_DATA.countries.map(([code, name]) => ({ code, name: `${name} (${code})`, value: code }))
  const industryOpts = BLITZ_DATA.industries.map(i => ({ value: i, label: i }))
  const levelOpts    = BLITZ_DATA.jobLevels.map(l => ({ value: l, label: l }))
  const funcOpts     = BLITZ_DATA.jobFunctions.map(f => ({ value: f, label: f }))
  const rangeOpts    = BLITZ_DATA.employeeRanges.map(r => ({ value: r, label: r }))
  const typeOpts     = BLITZ_DATA.companyTypes.map(t => ({ value: t, label: t }))
  const regionOpts   = BLITZ_DATA.salesRegions.map(r => ({ value: r, label: r }))
  const continentOpts= BLITZ_DATA.continents.map(c => ({ value: c, label: c }))

  const resolveCountry = (raw) => {
    const q = raw.trim().toLowerCase()
    const hit = BLITZ_DATA.countries.find(([code, label]) => code.toLowerCase() === q || label.toLowerCase() === q)
    return hit ? hit[0] : null
  }
  const resolveIndustry = (raw) => {
    const q = raw.trim().toLowerCase()
    const exact = BLITZ_DATA.industries.find(v => v.toLowerCase() === q)
    if (exact) return exact
    const hits = BLITZ_DATA.industries.filter(v => v.toLowerCase().includes(q))
    return hits.length === 1 ? hits[0] : null
  }

  /* ── query builders ── */
  const buildCompanyFilter = () => prune({
    employee_range: icp.company_employee_ranges.length ? icp.company_employee_ranges : undefined,
    industry: { include: icp.company_industries_include.length ? icp.company_industries_include : undefined, exclude: icp.company_industries_exclude.length ? icp.company_industries_exclude : undefined },
    keywords: { include: icp.company_keywords_include.length ? icp.company_keywords_include : undefined, exclude: icp.company_keywords_exclude.length ? icp.company_keywords_exclude : undefined },
    name: { include: icp.company_names_include.length ? icp.company_names_include : undefined, exclude: icp.company_names_exclude.length ? icp.company_names_exclude : undefined },
    type: { include: icp.company_types.length ? icp.company_types : undefined },
    min_linkedin_followers: num(icp.company_min_followers),
    linkedin_url: icp.company_linkedin_urls.length ? icp.company_linkedin_urls : undefined,
    domain: icp.company_domains.length ? icp.company_domains : undefined,
    hq: {
      country_code: icp.company_hq_countries.length ? icp.company_hq_countries : undefined,
      city: { include: icp.company_hq_cities_include.length ? icp.company_hq_cities_include : undefined, exclude: icp.company_hq_cities_exclude.length ? icp.company_hq_cities_exclude : undefined },
      sales_region: icp.company_hq_regions.length ? icp.company_hq_regions : undefined,
      continent: icp.company_hq_continents.length ? icp.company_hq_continents : undefined,
    },
  })

  const buildIcp = () => {
    let include = [...icp.job_titles_include]
    let exclude = [...icp.job_titles_exclude]
    if (icp.job_titles_exact) {
      include = include.map(t => t.startsWith('[') ? t : `[${t}]`)
      exclude = exclude.map(t => t.startsWith('[') ? t : `[${t}]`)
    }
    return prune({
      people: {
        job_title: { include, exclude, include_linkedin_headline: icp.job_titles_headline || undefined },
        job_level: icp.job_levels.length ? icp.job_levels : undefined,
        job_function: icp.job_functions.length ? icp.job_functions : undefined,
        min_connections: num(icp.min_connections),
        location: {
          country_code: icp.person_countries.length ? icp.person_countries : undefined,
          city: icp.person_cities.length ? icp.person_cities : undefined,
          sales_region: icp.person_regions.length ? icp.person_regions : undefined,
          continent: icp.person_continents.length ? icp.person_continents : undefined,
        },
      },
      company: buildCompanyFilter(),
      limit: goal * 3,
      titles: icp.job_titles_include.length ? icp.job_titles_include : undefined,
      titles_exclude: icp.job_titles_exclude.length ? icp.job_titles_exclude : undefined,
      seniority: icp.job_levels.length ? icp.job_levels : undefined,
      departments: icp.job_functions.length ? icp.job_functions : undefined,
      countries: icp.person_countries.length ? icp.person_countries : undefined,
      industries: icp.company_industries_include.length ? icp.company_industries_include : undefined,
      employees_min: num(icp.company_emp_min),
      employees_max: num(icp.company_emp_max),
    })
  }

  /* ── API calls ── */
  const fetchCount = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildIcp()) })
      if (!res.ok) throw new Error('Count request failed')
      setCount((await res.json()).count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const startJob = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icp: buildIcp(), goal }) })
      if (!res.ok) throw new Error('Job start failed')
      const data = await res.json()
      setJob(data); setActiveTab('running'); pollJob(data.id)
    } catch (e) { setError(e.message); setLoading(false) }
  }

  const pollJob = (id) => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/jobs/${id}`)
        if (!res.ok) throw new Error('Status check failed')
        const data = await res.json()
        setJob(data)
        if (data.status === 'done') { clearInterval(iv); setLoading(false); setActiveTab('results') }
        else if (data.status === 'failed') { clearInterval(iv); setLoading(false); setError(data.error || 'Job failed') }
      } catch (e) { clearInterval(iv); setLoading(false); setError(e.message) }
    }, 800)
    return iv
  }

  /* ── active filter count helpers (counts non-empty filter groups, not total items) ── */
  const hasItems = (...arrs) => arrs.filter(a => Array.isArray(a) ? a.length > 0 : !!a).length
  const personCount = hasItems(
    icp.job_titles_include, icp.job_titles_exclude,
    icp.job_levels, icp.job_functions, icp.min_connections
  )
  const locCount = hasItems(
    icp.person_countries, icp.person_cities,
    icp.person_regions, icp.person_continents
  )
  const compCount = hasItems(
    icp.company_employee_ranges,
    icp.company_industries_include, icp.company_industries_exclude,
    icp.company_keywords_include, icp.company_keywords_exclude,
    icp.company_names_include, icp.company_names_exclude,
    icp.company_linkedin_urls, icp.company_domains,
    icp.company_types,
    icp.company_min_followers, icp.company_emp_min, icp.company_emp_max,
    icp.company_founded_min, icp.company_founded_max
  )
  const geoCount = hasItems(
    icp.company_hq_countries,
    icp.company_hq_cities_include, icp.company_hq_cities_exclude,
    icp.company_hq_regions, icp.company_hq_continents
  )

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Lead Prospector</h1>
          <p>Find the right people</p>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item${activeTab === 'form' ? ' active' : ''}`} onClick={() => setActiveTab('form')}>
            <span className="nav-icon">🎯</span> Set Up Search
          </button>
          <button className={`nav-item${activeTab === 'running' ? ' active' : ''}`} onClick={() => setActiveTab('running')} disabled={!job}>
            <span className="nav-icon">⚡</span> In Progress
          </button>
          <button className={`nav-item${activeTab === 'results' ? ' active' : ''}`} onClick={() => setActiveTab('results')} disabled={!job || job.status !== 'done'}>
            <span className="nav-icon">📋</span> View Leads
          </button>
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="main">
        {activeTab === 'form' && (
          <>
            <div className="main-header">
              <div>
                <h2>Search Filters</h2>
                <p>Set who you want to find</p>
              </div>
            </div>

            <div className="main-body">
              {error && <div className="error-banner">⚠ {error}</div>}

              <div className="filter-panels">

                {/* Person */}
                <Panel
                  icon="👤" title="Person" count={personCount}
                  isOpen={open.person} onToggle={() => toggle('person')}
                >
                  <ChipsInput
                    name="Job Titles — Include"
                    values={icp.job_titles_include}
                    onChange={v => update('job_titles_include', v)}
                    placeholder="CEO, CTO, VP Sales…"
                    resolveToken={v => v.trim()}
                  />
                  <ChipsInput
                    name="Job Titles — Exclude"
                    values={icp.job_titles_exclude}
                    onChange={v => update('job_titles_exclude', v)}
                    placeholder="intern, assistant…"
                  />
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <input type="checkbox" checked={icp.job_titles_exact} onChange={e => update('job_titles_exact', e.target.checked)} />
                      Exact match
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" checked={icp.job_titles_headline} onChange={e => update('job_titles_headline', e.target.checked)} />
                      Search headline
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" checked={icp.job_titles_current} onChange={e => update('job_titles_current', e.target.checked)} />
                      Current role only
                    </label>
                  </div>
                  <CheckboxGrid label="Seniority Level" options={levelOpts} selected={icp.job_levels} onChange={v => update('job_levels', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <CheckboxGrid label="Department / Function" options={funcOpts} selected={icp.job_functions} onChange={v => update('job_functions', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <div className="field">
                    <span className="field-label">Min LinkedIn Connections</span>
                    <input type="number" value={icp.min_connections || ''} onChange={e => update('min_connections', num(e.target.value))} placeholder="e.g. 100" style={{ maxWidth: 160 }} />
                  </div>
                </Panel>

                {/* Location */}
                <Panel
                  icon="📍" title="Person Location" count={locCount}
                  isOpen={open.location} onToggle={() => toggle('location')}
                >
                  <ChipsInput
                    name="Countries"
                    values={icp.person_countries}
                    onChange={v => update('person_countries', v)}
                    placeholder="US, United Kingdom…"
                    suggestData={countryOpts}
                    getSuggestLabel={o => o.name}
                    getSuggestValue={o => o.code}
                    resolveToken={resolveCountry}
                  />
                  <ChipsInput
                    name="Cities"
                    values={icp.person_cities}
                    onChange={v => update('person_cities', v)}
                    placeholder="New York, London…"
                  />
                  <CheckboxGrid label="Sales Regions" options={regionOpts} selected={icp.person_regions} onChange={v => update('person_regions', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <CheckboxGrid label="Continents" options={continentOpts} selected={icp.person_continents} onChange={v => update('person_continents', v)} getLabel={o => o.label} getValue={o => o.value} />
                </Panel>

                {/* Company */}
                <Panel
                  icon="🏢" title="Company" count={compCount}
                  isOpen={open.company} onToggle={() => toggle('company')}
                >
                  <CheckboxGrid label="Employee Range" options={rangeOpts} selected={icp.company_employee_ranges} onChange={v => update('company_employee_ranges', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <div className="field-row">
                    <div className="field">
                      <span className="field-label">Min Employees</span>
                      <input type="number" value={icp.company_emp_min || ''} onChange={e => update('company_emp_min', num(e.target.value))} placeholder="e.g. 10" />
                    </div>
                    <div className="field">
                      <span className="field-label">Max Employees</span>
                      <input type="number" value={icp.company_emp_max || ''} onChange={e => update('company_emp_max', num(e.target.value))} placeholder="e.g. 5000" />
                    </div>
                    <div className="field">
                      <span className="field-label">Founded ≥</span>
                      <input type="number" value={icp.company_founded_min || ''} onChange={e => update('company_founded_min', num(e.target.value))} placeholder="2000" />
                    </div>
                    <div className="field">
                      <span className="field-label">Founded ≤</span>
                      <input type="number" value={icp.company_founded_max || ''} onChange={e => update('company_founded_max', num(e.target.value))} placeholder="2024" />
                    </div>
                  </div>
                  <ChipsInput name="Industries — Include" values={icp.company_industries_include} onChange={v => update('company_industries_include', v)} placeholder="SaaS, FinTech…" suggestData={industryOpts} getSuggestLabel={o => o.label} getSuggestValue={o => o.value} resolveToken={resolveIndustry} />
                  <ChipsInput name="Industries — Exclude" values={icp.company_industries_exclude} onChange={v => update('company_industries_exclude', v)} placeholder="Agencies…" suggestData={industryOpts} getSuggestLabel={o => o.label} getSuggestValue={o => o.value} resolveToken={resolveIndustry} />
                  <ChipsInput name="Keywords — Include" values={icp.company_keywords_include} onChange={v => update('company_keywords_include', v)} placeholder="AI, kubernetes…" />
                  <ChipsInput name="Keywords — Exclude" values={icp.company_keywords_exclude} onChange={v => update('company_keywords_exclude', v)} placeholder="agency, consulting…" />
                  <ChipsInput name="Company Names (contains)" values={icp.company_names_include} onChange={v => update('company_names_include', v)} placeholder="labs, security…" />
                  <ChipsInput name="Company LinkedIn URLs" values={icp.company_linkedin_urls} onChange={v => update('company_linkedin_urls', v)} placeholder="linkedin.com/company/…" />
                  <ChipsInput name="Company Domains" values={icp.company_domains} onChange={v => update('company_domains', v)} placeholder="acme.com…" />
                  <CheckboxGrid label="Company Type" options={typeOpts} selected={icp.company_types} onChange={v => update('company_types', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <div className="field">
                    <span className="field-label">Min LinkedIn Followers</span>
                    <input type="number" value={icp.company_min_followers || ''} onChange={e => update('company_min_followers', num(e.target.value))} placeholder="e.g. 1000" style={{ maxWidth: 160 }} />
                  </div>
                </Panel>

                {/* Company HQ */}
                <Panel
                  icon="🌍" title="Company HQ Location" count={geoCount}
                  isOpen={open.companyGeo} onToggle={() => toggle('companyGeo')}
                >
                  <ChipsInput name="HQ Countries" values={icp.company_hq_countries} onChange={v => update('company_hq_countries', v)} placeholder="US, DE…" suggestData={countryOpts} getSuggestLabel={o => o.name} getSuggestValue={o => o.code} resolveToken={resolveCountry} />
                  <ChipsInput name="HQ Cities — Include" values={icp.company_hq_cities_include} onChange={v => update('company_hq_cities_include', v)} placeholder="Austin, London…" />
                  <ChipsInput name="HQ Cities — Exclude" values={icp.company_hq_cities_exclude} onChange={v => update('company_hq_cities_exclude', v)} placeholder="remote…" />
                  <CheckboxGrid label="HQ Sales Regions" options={regionOpts} selected={icp.company_hq_regions} onChange={v => update('company_hq_regions', v)} getLabel={o => o.label} getValue={o => o.value} />
                  <CheckboxGrid label="HQ Continents" options={continentOpts} selected={icp.company_hq_continents} onChange={v => update('company_hq_continents', v)} getLabel={o => o.label} getValue={o => o.value} />
                </Panel>

              </div>
            </div>

            {/* ── Sticky Run Bar ── */}
            <div className="run-bar">
              <div className="goal-field">
                <label htmlFor="goal-input">Goal</label>
                <input
                  id="goal-input"
                  type="number"
                  value={goal}
                  min={1} max={50000}
                  onChange={e => setGoal(parseInt(e.target.value) || 25)}
                />
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>leads with email</span>
              </div>
              {count !== null && <span className="count-pill">{count.toLocaleString()} in pool</span>}
              <div className="run-spacer" />
              <button className="btn secondary" onClick={fetchCount} disabled={loading}>
                {loading ? 'Checking…' : '🔍 Check Pool Size'}
              </button>
              <button className="btn primary" onClick={startJob} disabled={loading}>
                {loading ? 'Starting…' : '🚀 Find Leads'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'running' && job && (
          <div className="main-body">
            <div className="status-card">
              <h2>Search Status</h2>
              <div className={`status-badge status-${job.status}`}>{job.status === 'done' ? 'COMPLETE' : job.status === 'failed' ? 'FAILED' : 'SEARCHING'}</div>
              {job.status === 'failed' ? (
                <div className="job-failed-view">
                  <div className="error-banner">⚠ {job.error || 'Something went wrong'}</div>
                  <button className="btn secondary" onClick={() => setActiveTab('form')}>← Back to Search</button>
                </div>
              ) : (
                <>
                  <div className="metrics">
                    <Metric label="Found" value={job.collected ?? 0} />
                    <Metric label="Matched" value={job.passed ?? 0} />
                    <Metric label="With Email" value={job.sendable ?? 0} />
                    <Metric label="Goal" value={job.goal} />
                    <Metric label="Progress" value={`${Math.min(100, Math.round(((job.sendable ?? 0) / job.goal) * 100))}%`} />
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(100, ((job.sendable ?? 0) / job.goal) * 100)}%` }} />
                  </div>
                  {job.status === 'done' && (
                    <button className="btn primary" style={{ marginTop: 20 }} onClick={() => setActiveTab('results')}>View Leads →</button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && job && (
          <div className="main-body">
            <div className="results-header">
              <h2>Your Leads</h2>
              <div className="results-actions">
                {job.file && <a href={`${API}/api/jobs/${job.id}/download`} download className="btn primary">⬇ Download CSV</a>}
                <button className="btn secondary" onClick={() => setActiveTab('form')}>New Search</button>
              </div>
            </div>

            <div className="job-meta">
              <span>Job ID: <code>{job.id}</code></span>
              {job.file && <span>File: <code>{job.file}</code></span>}
            </div>

            <div className="metrics" style={{ marginBottom: 20 }}>
              <Metric label="Total Found" value={job.collected ?? 0} />
              <Metric label="Matched Filters" value={job.passed ?? 0} />
              <Metric label="With Email" value={job.sendable ?? 0} />
              <Metric label="No Email" value={(job.passed ?? 0) - (job.sendable ?? 0)} />
              <Metric label="Didn't Match" value={(job.collected ?? 0) - (job.passed ?? 0)} />
            </div>

            {job.rows?.length > 0 && (
              <div className="leads-table-container">
                <div className="leads-table-header">
                  <h3>Showing {job.rows.length} of {job.collected} leads</h3>
                </div>
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Company</th>
                      <th>Country</th>
                      <th>Email</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td><strong>{row.first_name} {row.last_name}</strong></td>
                        <td>{row.title}</td>
                        <td>{row.company || '—'}</td>
                        <td><code>{row.country || '—'}</code></td>
                        <td>{row.email || <span className="text-muted">None</span>}</td>
                        <td>
                          <span className={`score-badge score-${row.icp_score >= 80 ? 'high' : row.icp_score >= 50 ? 'mid' : 'low'}`}>
                            {row.icp_score}%
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${row.tab}`} title={row.icp_reason}>
                            {row.tab === 'passed_with_email' ? 'Sendable' : row.tab === 'passed_without_email' ? 'No Email' : 'Failed'}
                          </span>
                        </td>
                        <td>
                          {row.linkedin_url
                            ? <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="table-link">Profile ↗</a>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Panel ── */
function Panel({ icon, title, count, isOpen, onToggle, children }) {
  return (
    <div className="panel">
      <div className="panel-head" onClick={onToggle}>
        <div className="panel-head-left">
          <span className="panel-head-icon">{icon}</span>
          <span className="panel-head-title">{title}</span>
          {count > 0 && <span className="panel-head-count">{count}</span>}
        </div>
        <span className={`panel-head-chevron${isOpen ? ' open' : ''}`}>▼</span>
      </div>
      {isOpen && <div className="panel-body">{children}</div>}
    </div>
  )
}

/* ── Metric ── */
function Metric({ label, value }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  )
}

export default App