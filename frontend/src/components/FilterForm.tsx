import { BankOutlined, EnvironmentOutlined, GlobalOutlined, UserOutlined } from '@ant-design/icons'
import { Badge, Checkbox, Col, Collapse, Form, InputNumber, Row, Select, Switch, Typography, type FormInstance } from 'antd'
import { useMemo } from 'react'
import { BLITZ_DATA } from '../data/blitzData'
import { sectionCount, type IcpForm, type SectionKey } from '../lib/icp'
import { patchFilters } from '../store/icpSlice'
import { store, useAppDispatch, useAppSelector } from '../store'

const SEPARATORS = [',', ';', '\n']

const toOptions = (items: string[]) => items.map((v) => ({ value: v, label: v }))

/** Free-text chip input; pasting a comma/semicolon/newline list splits into chips. */
function Tags({ placeholder }: { placeholder?: string }) {
  return (
    <Select
      mode="tags"
      tokenSeparators={SEPARATORS}
      placeholder={placeholder}
      open={false}
      suffixIcon={null}
      style={{ width: '100%' }}
    />
  )
}

function Multi({ options, placeholder }: { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      optionFilterProp="label"
      maxTagCount="responsive"
      placeholder={placeholder}
      options={options}
      style={{ width: '100%' }}
    />
  )
}

function Check({ options }: { options: string[] }) {
  return <Checkbox.Group options={options} />
}

interface Props {
  form: FormInstance<IcpForm>
}

export function FilterForm({ form }: Props) {
  const dispatch = useAppDispatch()
  const filters = useAppSelector((s) => s.icp.filters)

  const opts = useMemo(
    () => ({
      countries: BLITZ_DATA.countries.map(([code, name]) => ({ value: code, label: `${name} (${code})` })),
      industries: toOptions(BLITZ_DATA.industries),
      functions: toOptions(BLITZ_DATA.jobFunctions),
    }),
    [],
  )

  const label = (icon: React.ReactNode, title: string, key: SectionKey) => (
    <span>
      {icon} <strong style={{ marginInline: 6 }}>{title}</strong>
      <Badge count={sectionCount(filters, key)} color="#4f46e5" showZero={false} />
    </span>
  )

  const col = { xs: 24, md: 12 }

  return (
    <Form<IcpForm>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={store.getState().icp.filters}
      onValuesChange={(changed) => dispatch(patchFilters(changed))}
    >
      <Collapse
        defaultActiveKey={['person']}
        size="large"
        items={[
          {
            key: 'person',
            forceRender: true,
            label: label(<UserOutlined />, 'Person', 'person'),
            children: (
              <>
                <Form.Item name="job_titles_include" label="Job titles to include" extra="Paste a comma-separated list or press Enter after each title.">
                  <Tags placeholder="CEO, CTO, VP Sales…" />
                </Form.Item>
                <Form.Item name="job_titles_exclude" label="Job titles to exclude">
                  <Tags placeholder="intern, assistant…" />
                </Form.Item>
                <Row gutter={24}>
                  {([
                    ['job_titles_exact', 'Exact title match'],
                    ['job_titles_headline', 'Search LinkedIn headline'],
                    ['job_titles_current', 'Current role only'],
                  ] as const).map(([name, text]) => (
                    <Col key={name} xs={24} md={8}>
                      <Form.Item name={name} valuePropName="checked" label={text}>
                        <Switch />
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
                <Form.Item name="job_levels" label="Seniority">
                  <Check options={BLITZ_DATA.jobLevels} />
                </Form.Item>
                <Form.Item name="job_functions" label="Department / function">
                  <Multi options={opts.functions} placeholder="Select functions" />
                </Form.Item>
                <Form.Item name="min_connections" label="Minimum LinkedIn connections">
                  <InputNumber min={0} placeholder="e.g. 100" style={{ width: 200 }} />
                </Form.Item>
              </>
            ),
          },
          {
            key: 'location',
            forceRender: true,
            label: label(<EnvironmentOutlined />, 'Person location', 'location'),
            children: (
              <>
                <Form.Item name="person_countries" label="Countries">
                  <Multi options={opts.countries} placeholder="Search countries" />
                </Form.Item>
                <Form.Item name="person_cities" label="Cities">
                  <Tags placeholder="New York, London…" />
                </Form.Item>
                <Form.Item name="person_regions" label="Sales regions">
                  <Check options={BLITZ_DATA.salesRegions} />
                </Form.Item>
                <Form.Item name="person_continents" label="Continents">
                  <Check options={BLITZ_DATA.continents} />
                </Form.Item>
              </>
            ),
          },
          {
            key: 'company',
            forceRender: true,
            label: label(<BankOutlined />, 'Company', 'company'),
            children: (
              <>
                <Form.Item name="company_employee_ranges" label="Employee range">
                  <Check options={BLITZ_DATA.employeeRanges} />
                </Form.Item>
                <Row gutter={16}>
                  {([
                    ['company_emp_min', 'Min employees', 10],
                    ['company_emp_max', 'Max employees', 5000],
                    ['company_founded_min', 'Founded after', 2000],
                    ['company_founded_max', 'Founded before', 2024],
                  ] as const).map(([name, text, ph]) => (
                    <Col key={name} xs={12} md={6}>
                      <Form.Item name={name} label={text}>
                        <InputNumber min={0} placeholder={`e.g. ${ph}`} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
                <Row gutter={16}>
                  <Col {...col}>
                    <Form.Item name="company_industries_include" label="Industries to include">
                      <Multi options={opts.industries} placeholder="SaaS, FinTech…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_industries_exclude" label="Industries to exclude">
                      <Multi options={opts.industries} placeholder="Agencies…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_keywords_include" label="Keywords to include">
                      <Tags placeholder="AI, kubernetes…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_keywords_exclude" label="Keywords to exclude">
                      <Tags placeholder="agency, consulting…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_names_include" label="Company names (contains)">
                      <Tags placeholder="labs, security…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_domains" label="Company domains">
                      <Tags placeholder="acme.com…" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="company_linkedin_urls" label="Company LinkedIn URLs">
                  <Tags placeholder="linkedin.com/company/…" />
                </Form.Item>
                <Form.Item name="company_types" label="Company type">
                  <Check options={BLITZ_DATA.companyTypes} />
                </Form.Item>
                <Form.Item name="company_min_followers" label="Minimum LinkedIn followers">
                  <InputNumber min={0} placeholder="e.g. 1000" style={{ width: 200 }} />
                </Form.Item>
              </>
            ),
          },
          {
            key: 'hq',
            forceRender: true,
            label: label(<GlobalOutlined />, 'Company HQ location', 'hq'),
            children: (
              <>
                <Form.Item name="company_hq_countries" label="HQ countries">
                  <Multi options={opts.countries} placeholder="Search countries" />
                </Form.Item>
                <Row gutter={16}>
                  <Col {...col}>
                    <Form.Item name="company_hq_cities_include" label="HQ cities to include">
                      <Tags placeholder="Austin, London…" />
                    </Form.Item>
                  </Col>
                  <Col {...col}>
                    <Form.Item name="company_hq_cities_exclude" label="HQ cities to exclude">
                      <Tags placeholder="Remote…" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="company_hq_regions" label="HQ sales regions">
                  <Check options={BLITZ_DATA.salesRegions} />
                </Form.Item>
                <Form.Item name="company_hq_continents" label="HQ continents">
                  <Check options={BLITZ_DATA.continents} />
                </Form.Item>
              </>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Empty filters are dropped automatically before the search runs.
      </Typography.Paragraph>
    </Form>
  )
}
