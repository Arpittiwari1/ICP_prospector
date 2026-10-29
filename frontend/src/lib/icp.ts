import type { IcpPayload } from '../api/types'

export interface IcpForm {
  job_titles_include: string[]
  job_titles_exclude: string[]
  job_titles_exact: boolean
  job_titles_headline: boolean
  job_titles_current: boolean
  job_levels: string[]
  job_functions: string[]
  person_countries: string[]
  person_cities: string[]
  person_regions: string[]
  person_continents: string[]
  min_connections: number | null
  company_employee_ranges: string[]
  company_emp_min: number | null
  company_emp_max: number | null
  company_founded_min: number | null
  company_founded_max: number | null
  company_industries_include: string[]
  company_industries_exclude: string[]
  company_keywords_include: string[]
  company_keywords_exclude: string[]
  company_names_include: string[]
  company_names_exclude: string[]
  company_linkedin_urls: string[]
  company_domains: string[]
  company_hq_countries: string[]
  company_hq_cities_include: string[]
  company_hq_cities_exclude: string[]
  company_hq_regions: string[]
  company_hq_continents: string[]
  company_types: string[]
  company_min_followers: number | null
}

export const DEFAULT_ICP: IcpForm = {
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

/** Drops empty strings, arrays and objects so requests stay small. */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? value : undefined
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v)
      if (p !== undefined) out[k] = p
    }
    return Object.keys(out).length ? out : undefined
  }
  return value === undefined || value === '' || value === null ? undefined : value
}

const list = (a: string[] | undefined) => (a && a.length ? a : undefined)
const num = (v: number | null | undefined) => (v == null ? undefined : Number(v))

export function buildIcp(icp: IcpForm, goal: number): IcpPayload {
  const exact = (titles: string[] = []) =>
    icp.job_titles_exact ? titles.map((t) => (t.startsWith('[') ? t : `[${t}]`)) : titles

  return (prune({
    people: {
      job_title: {
        include: exact(icp.job_titles_include),
        exclude: exact(icp.job_titles_exclude),
        include_linkedin_headline: icp.job_titles_headline || undefined,
      },
      job_level: list(icp.job_levels),
      job_function: list(icp.job_functions),
      min_connections: num(icp.min_connections),
      location: {
        country_code: list(icp.person_countries),
        city: list(icp.person_cities),
        sales_region: list(icp.person_regions),
        continent: list(icp.person_continents),
      },
    },
    company: {
      employee_range: list(icp.company_employee_ranges),
      industry: { include: list(icp.company_industries_include), exclude: list(icp.company_industries_exclude) },
      keywords: { include: list(icp.company_keywords_include), exclude: list(icp.company_keywords_exclude) },
      name: { include: list(icp.company_names_include), exclude: list(icp.company_names_exclude) },
      type: { include: list(icp.company_types) },
      min_linkedin_followers: num(icp.company_min_followers),
      linkedin_url: list(icp.company_linkedin_urls),
      domain: list(icp.company_domains),
      hq: {
        country_code: list(icp.company_hq_countries),
        city: { include: list(icp.company_hq_cities_include), exclude: list(icp.company_hq_cities_exclude) },
        sales_region: list(icp.company_hq_regions),
        continent: list(icp.company_hq_continents),
      },
    },
    limit: goal * 3,
    titles: list(icp.job_titles_include),
    titles_exclude: list(icp.job_titles_exclude),
    seniority: list(icp.job_levels),
    departments: list(icp.job_functions),
    countries: list(icp.person_countries),
    industries: list(icp.company_industries_include),
    employees_min: num(icp.company_emp_min),
    employees_max: num(icp.company_emp_max),
  }) ?? {}) as IcpPayload
}

export type SectionKey = 'person' | 'location' | 'company' | 'hq'

export const SECTION_FIELDS: Record<SectionKey, (keyof IcpForm)[]> = {
  person: ['job_titles_include', 'job_titles_exclude', 'job_levels', 'job_functions', 'min_connections'],
  location: ['person_countries', 'person_cities', 'person_regions', 'person_continents'],
  company: ['company_employee_ranges', 'company_industries_include', 'company_industries_exclude', 'company_keywords_include', 'company_keywords_exclude', 'company_names_include', 'company_names_exclude', 'company_linkedin_urls', 'company_domains', 'company_types', 'company_min_followers', 'company_emp_min', 'company_emp_max', 'company_founded_min', 'company_founded_max'],
  hq: ['company_hq_countries', 'company_hq_cities_include', 'company_hq_cities_exclude', 'company_hq_regions', 'company_hq_continents'],
}

/** Number of non-empty filter groups in a section, used for the badges. */
export const sectionCount = (values: Partial<IcpForm> | undefined, section: SectionKey) =>
  SECTION_FIELDS[section].filter((k) => {
    const v = values?.[k]
    return Array.isArray(v) ? v.length > 0 : !!v
  }).length

/**
 * Keeps only known filter keys whose value matches the expected type, so an
 * LLM response can never put the form into an invalid state.
 */
export function sanitizeFilters(raw: Record<string, unknown>): Partial<IcpForm> {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(DEFAULT_ICP)) {
    const v = raw[key]
    if (v === undefined) continue
    if (Array.isArray(def)) {
      if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === 'string')
    } else if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v
    } else if (v === null || (typeof v === 'number' && Number.isFinite(v))) {
      out[key] = v
    }
  }
  return out as Partial<IcpForm>
}

export const FILTER_LABELS: Record<keyof IcpForm, string> = {
  job_titles_include: 'Titles',
  job_titles_exclude: 'Excluded titles',
  job_titles_exact: 'Exact titles',
  job_titles_headline: 'Headline search',
  job_titles_current: 'Current role',
  job_levels: 'Seniority',
  job_functions: 'Functions',
  person_countries: 'Countries',
  person_cities: 'Cities',
  person_regions: 'Regions',
  person_continents: 'Continents',
  min_connections: 'Min connections',
  company_employee_ranges: 'Company size',
  company_emp_min: 'Min employees',
  company_emp_max: 'Max employees',
  company_founded_min: 'Founded after',
  company_founded_max: 'Founded before',
  company_industries_include: 'Industries',
  company_industries_exclude: 'Excluded industries',
  company_keywords_include: 'Keywords',
  company_keywords_exclude: 'Excluded keywords',
  company_names_include: 'Company names',
  company_names_exclude: 'Excluded company names',
  company_linkedin_urls: 'LinkedIn URLs',
  company_domains: 'Domains',
  company_hq_countries: 'HQ countries',
  company_hq_cities_include: 'HQ cities',
  company_hq_cities_exclude: 'Excluded HQ cities',
  company_hq_regions: 'HQ regions',
  company_hq_continents: 'HQ continents',
  company_types: 'Company type',
  company_min_followers: 'Min followers',
}
