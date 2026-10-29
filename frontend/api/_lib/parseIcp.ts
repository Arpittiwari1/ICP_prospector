import { BLITZ_DATA } from '../../src/data/blitzData.js'

const EMPLOYEE_RANGES = BLITZ_DATA.employeeRanges
const SALES_REGIONS = BLITZ_DATA.salesRegions
const CONTINENTS = BLITZ_DATA.continents
const COMPANY_TYPES = BLITZ_DATA.companyTypes

const strings = { type: 'array', items: { type: 'string' } }
const SCHEMA = {
  type: 'object',
  properties: {
    job_titles_include: strings,
    job_titles_exclude: strings,
    job_levels: strings,
    job_functions: strings,
    person_countries: strings,
    person_cities: strings,
    person_regions: strings,
    person_continents: strings,
    company_employee_ranges: strings,
    company_emp_min: { type: ['integer', 'null'] },
    company_emp_max: { type: ['integer', 'null'] },
    company_industries_include: strings,
    company_industries_exclude: strings,
    company_keywords_include: strings,
    company_hq_countries: strings,
    company_types: strings,
    goal: { type: ['integer', 'null'] },
  },
}

const SYSTEM = `You convert a description of an ideal customer into search filters. Reply with JSON only.
Only fill fields the description clearly implies; leave the rest as empty arrays or null.
- job_titles_include: concrete job titles, singular (e.g. "CTO", "VP Sales").
- job_levels: any of ${JSON.stringify(BLITZ_DATA.jobLevels)}.
- job_functions: any of ${JSON.stringify(BLITZ_DATA.jobFunctions)}.
- person_countries / company_hq_countries: ISO 3166-1 alpha-2 codes (e.g. "DE", "GB", "US").
- person_regions: any of ${JSON.stringify(SALES_REGIONS)}. person_continents: any of ${JSON.stringify(CONTINENTS)}.
- company_employee_ranges: any of ${JSON.stringify(EMPLOYEE_RANGES)}. Use company_emp_min/max for explicit headcounts.
- company_industries_include: plain industry names (e.g. "SaaS", "Fintech", "Cybersecurity").
- company_types: any of ${JSON.stringify(COMPANY_TYPES)}.
- goal: number of leads wanted, only if the user states one.`

export class ParseError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
  }
}

type Raw = Record<string, unknown>

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))] : []

const oneOf = (v: unknown, allowed: string[]) =>
  strs(v)
    .map((x) => allowed.find((a) => a.toLowerCase() === x.toLowerCase()))
    .filter((x): x is string => !!x)

const countries = (v: unknown) =>
  strs(v)
    .map((x) => BLITZ_DATA.countries.find(([code, name]) => code.toLowerCase() === x.toLowerCase() || name.toLowerCase() === x.toLowerCase())?.[0])
    .filter((x): x is string => !!x)

/** Exact match first, then a unique substring match, against the known industry list. */
const industries = (v: unknown) =>
  [
    ...new Set(
      strs(v).flatMap((x) => {
        const q = x.toLowerCase()
        const exact = BLITZ_DATA.industries.find((i) => i.toLowerCase() === q)
        if (exact) return [exact]
        const hits = BLITZ_DATA.industries.filter((i) => i.toLowerCase().includes(q))
        return hits.length === 1 ? hits : []
      }),
    ),
  ]

const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

export function sanitize(raw: Raw) {
  const filters: Record<string, unknown> = {
    job_titles_include: strs(raw.job_titles_include),
    job_titles_exclude: strs(raw.job_titles_exclude),
    job_levels: oneOf(raw.job_levels, BLITZ_DATA.jobLevels),
    job_functions: oneOf(raw.job_functions, BLITZ_DATA.jobFunctions),
    person_countries: countries(raw.person_countries),
    person_cities: strs(raw.person_cities),
    person_regions: oneOf(raw.person_regions, SALES_REGIONS),
    person_continents: oneOf(raw.person_continents, CONTINENTS),
    company_employee_ranges: oneOf(raw.company_employee_ranges, EMPLOYEE_RANGES),
    company_emp_min: int(raw.company_emp_min),
    company_emp_max: int(raw.company_emp_max),
    company_industries_include: industries(raw.company_industries_include),
    company_industries_exclude: industries(raw.company_industries_exclude),
    company_keywords_include: strs(raw.company_keywords_include),
    company_hq_countries: countries(raw.company_hq_countries),
    company_types: oneOf(raw.company_types, COMPANY_TYPES),
  }
  // Drop empties so untouched filters keep their current values in the UI.
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => !(v === null || (Array.isArray(v) && v.length === 0))))
}

export async function parseIcp(prompt: string) {
  const base = (process.env.OLLAMA_BASE || 'https://ollama.com').replace(/\/$/, '')
  const model = process.env.OLLAMA_MODEL
  const key = process.env.OLLAMA_API_KEY
  if (!model) throw new ParseError('OLLAMA_MODEL is not set on the server.', 500)

  let res: Response
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        stream: false,
        format: SCHEMA,
        options: { temperature: 0 },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45_000),
    })
  } catch {
    throw new ParseError(`Can't reach Ollama at ${base}.`)
  }

  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? 'Check OLLAMA_API_KEY.' : `Is the model '${model}' available?`
    throw new ParseError(`Ollama returned ${res.status}. ${hint}`)
  }

  let raw: Raw
  try {
    const body = (await res.json()) as { message: { content: string } }
    raw = JSON.parse(body.message.content) as Raw
  } catch {
    throw new ParseError('Ollama returned an unreadable response.')
  }

  return { filters: sanitize(raw), goal: int(raw.goal) || null }
}
