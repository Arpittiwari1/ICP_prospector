#!/usr/bin/env node
/**
 * Blitz Prospector — local server.
 *
 * - Serves the dashboard UI from ./public
 * - Proxies /api/v2/* to https://api.blitz-api.ai (no CORS, key stays local)
 * - Runs big lead pulls as background JOBS on the server so a 20k pull
 *   survives closed tabs / sleeping laptops, checkpoints to disk, and can
 *   be resumed. Results download as one .xlsx workbook with tabs.
 * - Remembers which leads were exported per CLIENT so repeat searches can
 *   tag rows as "used in campaign X" or skip them entirely.
 *
 * Zero dependencies. Requires Node 18+.
 *
 *   node server.js            → http://localhost:3141
 *   PORT=8080 node server.js  → http://localhost:8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xlsx = require('./lib/xlsx');

const PORT = Number(process.env.PORT || 3141);
const BLITZ_BASE = process.env.BLITZ_API_BASE_URL || 'https://api.blitz-api.ai';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const CLIENTS_DIR = path.join(DATA_DIR, 'clients');

fs.mkdirSync(JOBS_DIR, { recursive: true });
fs.mkdirSync(CLIENTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ═══════════════════════════════════════════════ small utils
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'default';
}
function today() { return new Date().toISOString().slice(0, 10); }
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
// Blitz rejects any filter array (e.g. company.linkedin_url) longer than this.
const MAX_COMPANY_URLS_PER_QUERY = 50;

// ═══════════════════════════════════════════════ current-role verification
// Blitz's title search can in principle match a phrase found anywhere in a
// person's work history, not just their current role — the classic "Apollo
// shows someone's old job" problem. This re-checks a match against the
// person's CURRENT title/headline only, using the same exact-vs-tokenized
// semantics as the include_title filter itself ([Bracketed] = exact,
// otherwise every word must appear as a substring).
function normalizeTitleText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
// Tokenized (non-exact) matching is substring-based, which fails on the
// most common real case: searching "CMO" doesn't textually appear in a
// current title of "Chief Marketing Officer". Expanding known abbreviations
// on both sides before comparing fixes that; exact-bracket matches stay
// literal on purpose and are not expanded.
const TITLE_ABBREVIATIONS = {
  ceo: 'chief executive officer', cfo: 'chief financial officer', cto: 'chief technology officer',
  cmo: 'chief marketing officer', coo: 'chief operating officer', cro: 'chief revenue officer',
  chro: 'chief human resources officer', ciso: 'chief information security officer',
  cio: 'chief information officer', cpo: 'chief product officer', cdo: 'chief data officer',
  cco: 'chief commercial officer', cso: 'chief strategy officer',
  vp: 'vice president', svp: 'senior vice president', evp: 'executive vice president', avp: 'assistant vice president',
  hr: 'human resources', pr: 'public relations', gm: 'general manager', md: 'managing director',
};
function expandTitleAbbreviations(text) {
  return text.split(/\s+/).map(w => TITLE_ABBREVIATIONS[w] || w).join(' ');
}
function titleMatchesCurrentRole(includeTitles, currentTitle, currentHeadline, includeHeadline) {
  if (!includeTitles || !includeTitles.length) return true; // no title filter -- nothing to verify
  const fields = [normalizeTitleText(currentTitle)];
  if (includeHeadline) fields.push(normalizeTitleText(currentHeadline));
  const nonEmpty = fields.filter(Boolean);
  if (!nonEmpty.length) return false; // no current title/headline at all -- can't confirm currency
  for (const phrase of includeTitles) {
    const isExact = phrase.startsWith('[') && phrase.endsWith(']');
    const raw = isExact ? phrase.slice(1, -1) : phrase;
    const normPhrase = normalizeTitleText(raw);
    if (!normPhrase) continue;
    if (isExact) {
      if (nonEmpty.some(f => f === normPhrase)) return true;
    } else {
      const words = expandTitleAbbreviations(normPhrase).split(/\s+/).filter(Boolean);
      if (nonEmpty.some(f => {
        const expandedField = expandTitleAbbreviations(f);
        return words.every(w => expandedField.includes(w));
      })) return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════ rate limiter (shared, ~4 req/s)
const limiter = {
  queue: [], running: 0, maxConcurrent: 4, minGapMs: 260, lastStart: 0,
  schedule(fn) {
    return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); this.pump(); });
  },
  pump() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    const wait = Math.max(0, this.lastStart + this.minGapMs - Date.now());
    const job = this.queue.shift();
    this.running++;
    this.lastStart = Date.now() + wait;
    setTimeout(async () => {
      try { job.resolve(await job.fn()); }
      catch (err) { job.reject(err); }
      finally { this.running--; this.pump(); }
    }, wait);
    this.pump();
  },
};

async function blitzCall(apiPath, body, apiKey, tries) {
  const max = tries || 4;
  let attempt = 0;
  for (;;) {
    try {
      return await limiter.schedule(async () => {
        const res = await fetch(BLITZ_BASE + apiPath, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
        if (!res.ok) {
          const err = new Error((data && (data.error || data.message)) || 'HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    } catch (err) {
      attempt++;
      const retryable = !err.status || err.status === 429 || err.status >= 500;
      if (attempt >= max || !retryable) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

// ═══════════════════════════════════════════════ lead row mapping
const PEOPLE_COLS = [
  'client', 'campaign', 'used_in',
  'first_name', 'last_name', 'full_name', 'job_title', 'title_match', 'company', 'company_domain',
  'industry', 'company_size_exact',
  'email', 'email_status', 'phone', 'phone_status', 'city', 'state', 'country',
  'linkedin_url', 'company_linkedin_url', 'headline', 'connections', 'job_start_date', 'skills',
];

function personToRow(p) {
  const exp = (p.experiences || []).find(e => e.job_is_current) || (p.experiences || [])[0] || {};
  const loc = p.location || {};
  return {
    client: '', campaign: '', used_in: '',
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    full_name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    job_title: exp.job_title || '',
    title_match: '', // 'current' | 'past' — filled in during ingest when a title filter is active
    company: exp.company_name || '',
    company_domain: exp.company_domain || '',
    industry: '', company_size_exact: '',
    email: '', email_status: '', phone: '', phone_status: '',
    city: loc.city || '',
    state: loc.state_code || '',
    country: loc.country_code || '',
    linkedin_url: p.linkedin_url || '',
    company_linkedin_url: exp.company_linkedin_url || '',
    headline: p.headline || '',
    connections: p.connections_count != null ? p.connections_count : '',
    job_start_date: exp.job_start_date || '',
    skills: (p.skills || []).slice(0, 12).join('; '),
  };
}

// ═══════════════════════════════════════════════ clients & suppression memory
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');

function loadClients() {
  try { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')); } catch { return []; }
}
function saveClients(list) {
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(list, null, 2));
}
function suppressionPath(client) { return path.join(CLIENTS_DIR, slug(client) + '.jsonl'); }

// Map linkedin_url -> { campaign, date } (first use wins)
function loadSuppression(client) {
  const map = new Map();
  if (!client) return map;
  try {
    const lines = fs.readFileSync(suppressionPath(client), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.url && !map.has(rec.url)) map.set(rec.url, rec);
      } catch { /* skip bad line */ }
    }
  } catch { /* no file yet */ }
  return map;
}
function recordUsage(job) {
  if (!job.client || job.usage_recorded) return;
  const campaign = job.campaign || '(no campaign)';
  const lines = job.rows
    .filter(r => r.linkedin_url && !r.used_in) // only newly-used leads
    .map(r => JSON.stringify({ url: r.linkedin_url, email: r.email || '', campaign, date: today() }))
    .join('\n');
  if (lines) fs.appendFileSync(suppressionPath(job.client), lines + '\n');
  job.usage_recorded = true;
}
function usedCount(client) {
  try {
    const txt = fs.readFileSync(suppressionPath(client), 'utf8');
    return txt.split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}

// ── per-client do-not-contact list ──
// Separate from "used lead" memory above: this is a hard exclusion the user
// manages explicitly (existing customers, unsubscribes, competitors), not
// something the app fills in automatically from past pulls.
function dncPath(client) { return path.join(CLIENTS_DIR, slug(client) + '.dnc.json'); }
function loadDnc(client) {
  if (!client) return { emails: [], domains: [] };
  try {
    const d = JSON.parse(fs.readFileSync(dncPath(client), 'utf8'));
    return { emails: Array.isArray(d.emails) ? d.emails : [], domains: Array.isArray(d.domains) ? d.domains : [] };
  } catch { return { emails: [], domains: [] }; }
}
function saveDnc(client, dnc) { fs.writeFileSync(dncPath(client), JSON.stringify(dnc)); }
function dncCounts(client) {
  const dnc = loadDnc(client);
  return { emails: dnc.emails.length, domains: dnc.domains.length };
}

// ═══════════════════════════════════════════════ company enrichment cache
// Industry + exact employee count are looked up per unique company and
// cached indefinitely (refreshed after 90 days) so re-pulling the same
// accounts for a new campaign never re-buys the same company twice.
const COMPANY_CACHE_FILE = path.join(DATA_DIR, 'company-cache.json');
const COMPANY_CACHE_STALE_MS = 90 * 24 * 60 * 60 * 1000;

function loadCompanyCache() {
  try { return JSON.parse(fs.readFileSync(COMPANY_CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCompanyCache(cache) {
  fs.writeFileSync(COMPANY_CACHE_FILE, JSON.stringify(cache));
}

// ═══════════════════════════════════════════════ domain -> company resolver
// Lets a filter accept a pasted list of company websites: each domain is
// resolved to its LinkedIn company URL and the result is folded into the
// search's company.linkedin_url filter, same cache/90-day policy as above.
const DOMAIN_CACHE_FILE = path.join(DATA_DIR, 'domain-cache.json');
const DOMAIN_CACHE_STALE_MS = 90 * 24 * 60 * 60 * 1000;

function loadDomainCache() {
  try { return JSON.parse(fs.readFileSync(DOMAIN_CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveDomainCache(cache) {
  fs.writeFileSync(DOMAIN_CACHE_FILE, JSON.stringify(cache));
}
function normalizeDomain(raw) {
  return String(raw || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split(':')[0];
}

// Returns { [normalizedDomain]: linkedinCompanyUrl | null }.
async function fetchDomainLinks(domains, apiKey, opts) {
  const { onProgress, isCancelled } = opts || {};
  const cache = loadDomainCache();
  const unique = Array.from(new Set((domains || []).map(normalizeDomain).filter(Boolean)));
  const now = Date.now();
  const isFresh = (d) => cache[d] && (now - (cache[d].fetched_at || 0)) < DOMAIN_CACHE_STALE_MS;
  const toFetch = unique.filter(d => !isFresh(d));

  let done = unique.length - toFetch.length;
  if (onProgress) onProgress(done, unique.length);

  await Promise.all(toFetch.map(async (domain) => {
    if (isCancelled && isCancelled()) return;
    try {
      const res = await blitzCall('/v2/enrichment/domain-to-linkedin', { domain }, apiKey, 2);
      cache[domain] = { company_linkedin_url: (res.found && res.company_linkedin_url) || null, fetched_at: now };
    } catch {
      cache[domain] = cache[domain] || { company_linkedin_url: null, fetched_at: now };
    }
    done++;
    if (done % 25 === 0) saveDomainCache(cache);
    if (onProgress) onProgress(done, unique.length);
  }));
  saveDomainCache(cache);

  const out = {};
  for (const d of unique) out[d] = cache[d] ? cache[d].company_linkedin_url : null;
  return out;
}

// ═══════════════════════════════════════════════ job engine
const JOBS = new Map();     // id -> job (meta; rows loaded while running/downloading)
const JOB_KEYS = new Map(); // id -> api key (memory only, never written to disk)

function jobMetaPath(id) { return path.join(JOBS_DIR, id + '.json'); }
function jobRowsPath(id) { return path.join(JOBS_DIR, id + '.rows.jsonl'); }

function jobPublic(job) {
  return {
    id: job.id, created_at: job.created_at, status: job.status, phase: job.phase,
    goal: job.goal, collected: job.rows ? job.rows.length : (job.collected || 0),
    total_results: job.total_results || 0,
    enrich_email: job.enrich_email, enrich_phone: job.enrich_phone, enrich_company: job.enrich_company,
    enrich_total: job.enrich_total || 0, enrich_done: job.enrich_done || 0,
    client: job.client || '', campaign: job.campaign || '', skip_used: !!job.skip_used,
    skipped_used: job.skipped_used || 0, annotated_used: job.annotated_used || 0,
    error: job.error || null,
    emails_found: job.rows ? job.rows.filter(r => r.email).length : (job.emails_found || 0),
    domains_requested: (job.domains || []).length,
    domains_matched: job.domains_matched || 0,
    zero_domain_matches: !!job.zero_domain_matches,
    blocked_domain: job.blocked_domain || 0,
    blocked_email: job.blocked_email || 0,
    blocked_stale_title: job.blocked_stale_title || 0,
    enforce_current_role: !!job.enforce_current_role,
  };
}

function saveMeta(job) {
  const meta = { ...jobPublic(job), cursor: job.cursor || null, usage_recorded: !!job.usage_recorded };
  meta.collected = job.rows ? job.rows.length : (job.collected || 0);
  meta.emails_found = job.rows ? job.rows.filter(r => r.email).length : (job.emails_found || 0);
  fs.writeFileSync(jobMetaPath(job.id), JSON.stringify(meta));
}
function appendRows(job, rows) {
  if (!rows.length) return;
  fs.appendFileSync(jobRowsPath(job.id), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
function rewriteRows(job) {
  fs.writeFileSync(jobRowsPath(job.id), job.rows.map(r => JSON.stringify(r)).join('\n') + (job.rows.length ? '\n' : ''));
}
function loadRows(id) {
  try {
    return fs.readFileSync(jobRowsPath(id), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch { return []; }
}

// Leads whose only match was a past, not current, role: still exported (not
// silently discarded) but kept separate from the goal-counted rows so they
// land in their own "Needs Title Confirmation" workbook tab for a manual
// look, instead of either vanishing or getting mixed into the main list.
function staleRowsPath(id) { return path.join(JOBS_DIR, id + '.stale.jsonl'); }
function appendStaleRows(job, rows) {
  if (!rows.length) return;
  fs.appendFileSync(staleRowsPath(job.id), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
function loadStaleRows(id) {
  try {
    return fs.readFileSync(staleRowsPath(id), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  } catch { return []; }
}

// Resolves pasted company website URLs to LinkedIn company URLs and folds
// them into the search's company.linkedin_url filter (unioned with any
// LinkedIn URLs the user typed directly). If domains were given but none
// resolved, the job is flagged so the caller can stop instead of silently
// searching every company.
async function resolveDomainsPhase(job, apiKey) {
  if (!job.domains || !job.domains.length) return;
  const map = await fetchDomainLinks(job.domains, apiKey, {
    isCancelled: () => job.cancel,
    onProgress: (done, total) => {
      job.enrich_total = total; job.enrich_done = done;
      if (done % 5 === 0) saveMeta(job);
    },
  });
  const resolved = Object.values(map).filter(Boolean);
  job.domains_matched = resolved.length;
  if (resolved.length) {
    job.query.company = job.query.company || {};
    const existing = Array.isArray(job.query.company.linkedin_url) ? job.query.company.linkedin_url : [];
    job.query.company.linkedin_url = Array.from(new Set([...existing, ...resolved]));
    fs.writeFileSync(path.join(JOBS_DIR, job.id + '.query.json'), JSON.stringify(job.query));
  } else {
    job.zero_domain_matches = true;
  }
  saveMeta(job);
}

// Runs one page of /v2/search/people and folds the results into job.rows,
// applying suppression (tag/skip) and the per-job dedupe set. Returns how
// many genuinely new-to-this-job profiles were seen (kept or suppressed),
// used to detect a stuck/duplicate-only cursor.
function ingestPageIntoJob(job, results, supp, dncDomains, titleFilter, enforceCurrentRole) {
  const fresh = [];
  const freshStale = [];
  let progressed = 0;
  for (const p of results || []) {
    const row = personToRow(p);
    if (!row.linkedin_url || job.seen.has(row.linkedin_url)) continue;
    job.seen.add(row.linkedin_url);
    progressed++;
    if (dncDomains && dncDomains.size && row.company_domain && dncDomains.has(normalizeDomain(row.company_domain))) {
      job.blocked_domain = (job.blocked_domain || 0) + 1;
      continue; // never even counted toward the goal — company is on this client's block list
    }
    if (titleFilter && titleFilter.include && titleFilter.include.length) {
      const isCurrent = titleMatchesCurrentRole(titleFilter.include, row.job_title, row.headline, !!titleFilter.include_linkedin_headline);
      row.title_match = isCurrent ? 'current' : 'past';
      if (!isCurrent && enforceCurrentRole) {
        // Not dropped: set aside into its own workbook tab instead, so a
        // human can confirm rather than the lead just disappearing.
        job.blocked_stale_title = (job.blocked_stale_title || 0) + 1;
        row.client = job.client || '';
        row.campaign = job.campaign || '';
        job.staleRows = job.staleRows || [];
        job.staleRows.push(row);
        freshStale.push(row);
        continue; // doesn't count toward the goal — only verified-current leads do
      }
    }
    const used = supp.get(row.linkedin_url);
    if (used) {
      if (job.skip_used) { job.skipped_used = (job.skipped_used || 0) + 1; continue; }
      row.used_in = used.campaign + ' (' + used.date + ')';
      job.annotated_used = (job.annotated_used || 0) + 1;
    }
    row.client = job.client || '';
    row.campaign = job.campaign || '';
    if (job.rows.length < job.goal) { job.rows.push(row); fresh.push(row); }
  }
  appendRows(job, fresh);
  appendStaleRows(job, freshStale);
  return progressed;
}

async function collectPhase(job, apiKey) {
  const supp = loadSuppression(job.client);
  const dnc = loadDnc(job.client);
  const dncDomains = new Set(dnc.domains || []);
  const titleFilter = job.query.people && job.query.people.job_title;
  const enforceCurrentRole = !!job.enforce_current_role;
  const allUrls = job.query.company && Array.isArray(job.query.company.linkedin_url) ? job.query.company.linkedin_url : null;

  // Blitz caps company.linkedin_url at 50 entries per request. A pasted
  // list of website URLs can easily resolve to more than that, so split
  // into batches and run each as its own mini-search, picking up exactly
  // where a previous run/resume left off.
  if (allUrls && allUrls.length > MAX_COMPANY_URLS_PER_QUERY) {
    const shards = chunkArray(allUrls, MAX_COMPANY_URLS_PER_QUERY);
    const state = (job.cursor && typeof job.cursor === 'object') ? job.cursor : { shard: 0, cursor: null };
    job._shardTotalsSeen = job._shardTotalsSeen || new Set();
    let emptyPages = 0;

    while (job.rows.length < job.goal && !job.cancel && state.shard < shards.length) {
      const body = {
        ...job.query,
        company: { ...job.query.company, linkedin_url: shards[state.shard] },
        max_results: Math.min(50, job.goal - job.rows.length + 10),
        cursor: state.cursor || undefined,
      };
      const res = await blitzCall('/v2/search/people', body, apiKey);
      if (!job._shardTotalsSeen.has(state.shard)) {
        job._shardTotalsSeen.add(state.shard);
        job.total_results = (job.total_results || 0) + (res.total_results || 0);
      }
      const progressed = ingestPageIntoJob(job, res.results, supp, dncDomains, titleFilter, enforceCurrentRole);
      state.cursor = res.cursor || null;
      if (!state.cursor) { state.shard++; emptyPages = 0; }
      else if (!progressed) { if (++emptyPages >= 3) { state.shard++; state.cursor = null; emptyPages = 0; } }
      else emptyPages = 0;
      job.cursor = { ...state };
      saveMeta(job);
    }
    return;
  }

  let emptyPages = 0;
  while (job.rows.length < job.goal && !job.cancel) {
    const body = {
      ...job.query,
      max_results: Math.min(50, job.goal - job.rows.length + 10),
      cursor: job.cursor || undefined,
    };
    const res = await blitzCall('/v2/search/people', body, apiKey);
    job.total_results = res.total_results || 0;
    const progressed = ingestPageIntoJob(job, res.results, supp, dncDomains, titleFilter, enforceCurrentRole);
    job.cursor = res.cursor || null;
    saveMeta(job);
    if (!job.cursor) break;                            // dataset exhausted
    if (!progressed) { if (++emptyPages >= 3) break; } // duplicate-only pages: cursor is stuck
    else emptyPages = 0;
  }
}

// Looks up industry + exact employee count per unique company (not per
// lead), using a global cache so the same account is never re-bought
// across different pulls/clients/tabs. Shared by the job engine's company
// phase and the ad-hoc /app/companies/enrich route used by Employee Finder
// and Waterfall ICP.
async function fetchCompanyData(urls, apiKey, opts) {
  const { onProgress, isCancelled } = opts || {};
  const cache = loadCompanyCache();
  const unique = Array.from(new Set((urls || []).filter(Boolean)));
  const now = Date.now();
  const isFresh = (url) => cache[url] && (now - (cache[url].fetched_at || 0)) < COMPANY_CACHE_STALE_MS;
  const toFetch = unique.filter(u => !isFresh(u));

  let done = unique.length - toFetch.length; // already-cached companies count immediately
  if (onProgress) onProgress(done, unique.length);

  await Promise.all(toFetch.map(async (url) => {
    if (isCancelled && isCancelled()) return;
    try {
      const res = await blitzCall('/v2/enrichment/company', { company_linkedin_url: url }, apiKey, 2);
      const c = res.found && res.company ? res.company : {};
      cache[url] = {
        industry: c.industry || '',
        employees_on_linkedin: c.employees_on_linkedin != null ? c.employees_on_linkedin : '',
        domain: c.domain ? normalizeDomain(c.domain) : '',
        fetched_at: now,
      };
    } catch {
      cache[url] = cache[url] || { industry: '', employees_on_linkedin: '', domain: '', fetched_at: now };
    }
    done++;
    if (done % 25 === 0) saveCompanyCache(cache);
    if (onProgress) onProgress(done, unique.length);
  }));
  saveCompanyCache(cache);

  const out = {};
  for (const u of unique) {
    const c = cache[u];
    out[u] = {
      industry: (c && c.industry) || '',
      company_size_exact: (c && c.employees_on_linkedin != null && c.employees_on_linkedin !== '') ? c.employees_on_linkedin : '',
      domain: (c && c.domain) || '',
    };
  }
  return out;
}

async function enrichCompanyPhase(job, apiKey) {
  const targets = job.rows.filter(r => r.company_linkedin_url && r.industry === '' && r.company_size_exact === '');
  const map = await fetchCompanyData(targets.map(r => r.company_linkedin_url), apiKey, {
    isCancelled: () => job.cancel,
    onProgress: (done, total) => {
      job.enrich_total = total; job.enrich_done = done;
      if (done % 20 === 0) saveMeta(job);
    },
  });

  for (const r of job.rows) {
    const c = r.company_linkedin_url && map[r.company_linkedin_url];
    if (c) {
      r.industry = c.industry;
      r.company_size_exact = c.company_size_exact;
    }
  }
  rewriteRows(job);
  saveMeta(job);
}

async function enrichPhase(job, kind, apiKey) {
  const targets = job.rows.filter(r => r.linkedin_url && !r[kind] && r[kind + '_status'] !== 'not_found');
  job.enrich_total = targets.length;
  job.enrich_done = 0;
  if (!targets.length) return;
  const endpoint = kind === 'email' ? '/v2/enrichment/email' : '/v2/enrichment/phone';
  await Promise.all(targets.map(async (r) => {
    if (job.cancel) return;
    try {
      const res = await blitzCall(endpoint, { person_linkedin_url: r.linkedin_url }, apiKey, 2);
      if (kind === 'email') {
        if (res.found && res.email) { r.email = res.email; r.email_status = 'verified'; }
        else r.email_status = 'not_found';
      } else {
        if (res.found && res.phone) { r.phone = res.phone; r.phone_status = 'found'; }
        else r.phone_status = 'not_found';
      }
    } catch { r[kind + '_status'] = 'not_found'; }
    job.enrich_done++;
    if (job.enrich_done % 200 === 0) rewriteRows(job);
    if (job.enrich_done % 20 === 0) saveMeta(job);
  }));
  rewriteRows(job);
  saveMeta(job);
}

// Emails aren't known until enrichment runs, so email-level DNC can only be
// enforced afterward — this drops any row whose enriched email is on the
// client's block list. Rows already counted toward the goal before removal
// are not backfilled; the job may finish slightly under goal in that case,
// same honesty-over-cleverness tradeoff as skip_used running out of leads.
function applyEmailDnc(job) {
  if (!job.client) return;
  const dnc = loadDnc(job.client);
  if (!dnc.emails || !dnc.emails.length) return;
  const blockSet = new Set(dnc.emails);
  const before = job.rows.length;
  job.rows = job.rows.filter(r => !r.email || !blockSet.has(r.email.toLowerCase()));
  const removed = before - job.rows.length;
  if (removed) {
    job.blocked_email = (job.blocked_email || 0) + removed;
    rewriteRows(job);
    saveMeta(job);
  }
}

async function runJob(job, apiKey) {
  if (job._running) return;
  job._running = true;
  job.cancel = false;
  job.error = null;
  job.status = 'running';
  saveMeta(job);
  try {
    if (job.phase === 'resolve') {
      await resolveDomainsPhase(job, apiKey);
      if (!job.cancel) job.phase = job.zero_domain_matches ? 'finish' : 'collect';
    }
    if (job.phase === 'collect' && !job.cancel) {
      await collectPhase(job, apiKey);
      if (!job.cancel) job.phase = job.enrich_company ? 'company' : (job.enrich_email ? 'email' : (job.enrich_phone ? 'phone' : 'finish'));
    }
    if (job.phase === 'company' && !job.cancel) {
      await enrichCompanyPhase(job, apiKey);
      if (!job.cancel) job.phase = job.enrich_email ? 'email' : (job.enrich_phone ? 'phone' : 'finish');
    }
    if (job.phase === 'email' && !job.cancel) {
      await enrichPhase(job, 'email', apiKey);
      applyEmailDnc(job);
      if (!job.cancel) job.phase = job.enrich_phone ? 'phone' : 'finish';
    }
    if (job.phase === 'phone' && !job.cancel) {
      await enrichPhase(job, 'phone', apiKey);
      if (!job.cancel) job.phase = 'finish';
    }
    if (job.cancel) {
      job.status = 'cancelled';
    } else {
      recordUsage(job);
      job.phase = 'done';
      job.status = 'done';
    }
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  } finally {
    job._running = false;
    saveMeta(job);
  }
}

function bootJobs() {
  for (const f of fs.readdirSync(JOBS_DIR)) {
    if (!f.endsWith('.json') || f.endsWith('.query.json') || f.endsWith('.domains.json')) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), 'utf8'));
      if (!meta.id) continue;
      if (meta.status === 'running') meta.status = 'paused'; // server restarted mid-run
      JOBS.set(meta.id, meta);
      fs.writeFileSync(path.join(JOBS_DIR, f), JSON.stringify(meta));
    } catch { /* skip corrupt meta */ }
  }
}
bootJobs();

function hydrateJob(job) {
  // bring rows back into memory (after restart) so a job can resume/download
  if (!job.rows) {
    job.rows = loadRows(job.id);
    job.seen = new Set(job.rows.map(r => r.linkedin_url).filter(Boolean));
    rewriteRows(job); // dedupe/normalize file after partial writes
  }
  if (!job.staleRows) job.staleRows = loadStaleRows(job.id);
  if (!job.query) {
    // meta saved by jobPublic doesn't include query; full query kept in queryPath
    try { job.query = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, job.id + '.query.json'), 'utf8')); } catch { job.query = {}; }
  }
  if (!job.domains) {
    try { job.domains = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, job.id + '.domains.json'), 'utf8')); } catch { job.domains = []; }
  }
}

// ═══════════════════════════════════════════════ workbook download
function buildWorkbook(job) {
  const rows = job.rows || loadRows(job.id);
  const staleRows = job.staleRows || loadStaleRows(job.id);
  const toArr = (r) => PEOPLE_COLS.map(k => r[k] != null ? r[k] : '');
  const withEmail = rows.filter(r => r.email);
  const withoutEmail = rows.filter(r => !r.email);
  const sheets = [
    { name: 'Verified Emails', headers: PEOPLE_COLS, rows: withEmail.map(toArr) },
    { name: 'No Email', headers: PEOPLE_COLS, rows: withoutEmail.map(toArr) },
  ];
  // Past-role matches aren't lost when "Only current role" is on — they land
  // here instead, separate from the goal-counted leads, for a manual look.
  if (staleRows.length) {
    sheets.push({ name: 'Needs Title Confirmation', headers: PEOPLE_COLS, rows: staleRows.map(toArr) });
  }
  return xlsx.build(sheets);
}
function workbookName(job) {
  const bits = ['blitz-leads'];
  if (job.client) bits.push(slug(job.client));
  if (job.campaign) bits.push(slug(job.campaign));
  bits.push(today());
  return bits.join('-') + '.xlsx';
}

// ═══════════════════════════════════════════════ /app routes
async function handleApp(req, res, pathname) {
  const seg = pathname.split('/').filter(Boolean); // ['app', ...]

  // ── ad-hoc company enrichment (Employee Finder, Waterfall ICP) ──
  // Same cache as the job engine's company phase, so nothing is ever
  // re-bought just because it came from a different tab.
  if (seg[1] === 'companies' && seg[2] === 'enrich' && req.method === 'POST') {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return sendJSON(res, 401, { error: 'Missing x-api-key' });
    const body = await readBody(req);
    const urls = Array.isArray(body.urls) ? body.urls.filter(u => typeof u === 'string') : [];
    if (!urls.length) return sendJSON(res, 200, {});
    try {
      const map = await fetchCompanyData(urls, String(apiKey));
      return sendJSON(res, 200, map);
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // ── ad-hoc domain -> LinkedIn resolution (quick Search + TAM check) ──
  if (seg[1] === 'domains' && seg[2] === 'resolve' && req.method === 'POST') {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return sendJSON(res, 401, { error: 'Missing x-api-key' });
    const body = await readBody(req);
    const domains = Array.isArray(body.domains) ? body.domains.filter(d => typeof d === 'string') : [];
    if (!domains.length) return sendJSON(res, 200, {});
    try {
      const map = await fetchDomainLinks(domains, String(apiKey));
      return sendJSON(res, 200, map);
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  // ── clients ──
  if (seg[1] === 'clients' && seg.length === 2 && req.method === 'GET') {
    const list = loadClients().map(c => ({ ...c, used_leads: usedCount(c.name), dnc: dncCounts(c.name) }));
    return sendJSON(res, 200, list);
  }
  if (seg[1] === 'clients' && seg.length === 2 && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJSON(res, 400, { error: 'Client name required' });
    const list = loadClients();
    if (!list.find(c => slug(c.name) === slug(name))) {
      list.push({ name, created_at: today() });
      saveClients(list);
    }
    return sendJSON(res, 200, { ok: true, name });
  }

  // ── per-client do-not-contact list (hard exclusion, separate from used-lead memory) ──
  if (seg[1] === 'clients' && seg[2] && seg[3] === 'dnc') {
    const client = decodeURIComponent(seg[2]);
    if (seg.length === 4 && req.method === 'GET') {
      return sendJSON(res, 200, loadDnc(client));
    }
    if (seg.length === 4 && req.method === 'POST') {
      const body = await readBody(req);
      const dnc = loadDnc(client);
      const newEmails = Array.isArray(body.emails) ? body.emails.map(e => String(e).trim().toLowerCase()).filter(Boolean) : [];
      const newDomains = Array.isArray(body.domains) ? body.domains.map(normalizeDomain).filter(Boolean) : [];
      dnc.emails = Array.from(new Set([...(dnc.emails || []), ...newEmails]));
      dnc.domains = Array.from(new Set([...(dnc.domains || []), ...newDomains]));
      saveDnc(client, dnc);
      return sendJSON(res, 200, dnc);
    }
    if (seg[4] === 'remove' && req.method === 'POST') {
      const body = await readBody(req);
      const dnc = loadDnc(client);
      if (body.email) dnc.emails = (dnc.emails || []).filter(e => e !== String(body.email).trim().toLowerCase());
      if (body.domain) dnc.domains = (dnc.domains || []).filter(d => d !== normalizeDomain(body.domain));
      saveDnc(client, dnc);
      return sendJSON(res, 200, dnc);
    }
    if (seg[4] === 'clear' && req.method === 'POST') {
      saveDnc(client, { emails: [], domains: [] });
      return sendJSON(res, 200, { emails: [], domains: [] });
    }
    return sendJSON(res, 404, { error: 'Unknown DNC route' });
  }

  // ── jobs ──
  if (seg[1] === 'jobs' && seg.length === 2 && req.method === 'GET') {
    const list = Array.from(JOBS.values()).map(jobPublic)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return sendJSON(res, 200, list);
  }

  if (seg[1] === 'jobs' && seg.length === 2 && req.method === 'POST') {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return sendJSON(res, 401, { error: 'Missing x-api-key' });
    const body = await readBody(req);
    const goal = Math.max(1, Math.min(50000, Number(body.goal) || 100));
    const domains = Array.isArray(body.domains) ? body.domains.filter(d => typeof d === 'string' && d.trim()) : [];
    const job = {
      id: crypto.randomBytes(5).toString('hex'),
      created_at: new Date().toISOString(),
      status: 'queued', phase: domains.length ? 'resolve' : 'collect',
      query: body.query && typeof body.query === 'object' ? body.query : {},
      domains,
      goal,
      enrich_email: !!body.enrich_email,
      enrich_phone: !!body.enrich_phone,
      enrich_company: !!body.enrich_company,
      enforce_current_role: !!body.enforce_current_role,
      client: String(body.client || '').trim(),
      campaign: String(body.campaign || '').trim(),
      skip_used: !!body.skip_used,
      cursor: null, rows: [], seen: new Set(),
    };
    delete job.query.max_results;
    delete job.query.cursor;
    JOBS.set(job.id, job);
    JOB_KEYS.set(job.id, String(apiKey));
    fs.writeFileSync(path.join(JOBS_DIR, job.id + '.query.json'), JSON.stringify(job.query));
    if (domains.length) fs.writeFileSync(path.join(JOBS_DIR, job.id + '.domains.json'), JSON.stringify(domains));
    saveMeta(job);
    runJob(job, String(apiKey)); // fire and forget — this is the background job
    return sendJSON(res, 200, jobPublic(job));
  }

  const job = seg[1] === 'jobs' && seg[2] ? JOBS.get(seg[2]) : null;
  if (seg[1] === 'jobs' && seg[2] && !job) return sendJSON(res, 404, { error: 'Job not found' });

  if (job && seg.length === 3 && req.method === 'GET') {
    return sendJSON(res, 200, jobPublic(job));
  }
  if (job && seg[3] === 'cancel' && req.method === 'POST') {
    job.cancel = true;
    if (!job._running) { job.status = 'cancelled'; saveMeta(job); }
    return sendJSON(res, 200, { ok: true });
  }
  if (job && seg[3] === 'resume' && req.method === 'POST') {
    if (job._running) return sendJSON(res, 400, { error: 'Job already running' });
    if (job.status === 'done') return sendJSON(res, 400, { error: 'Job already finished' });
    const apiKey = req.headers['x-api-key'] || JOB_KEYS.get(job.id);
    if (!apiKey) return sendJSON(res, 401, { error: 'Missing x-api-key' });
    JOB_KEYS.set(job.id, String(apiKey));
    hydrateJob(job);
    if (!job.phase || job.phase === 'done') job.phase = 'collect';
    runJob(job, String(apiKey));
    return sendJSON(res, 200, jobPublic(job));
  }
  if (job && seg[3] === 'download' && req.method === 'GET') {
    if (job._running) return sendJSON(res, 400, { error: 'Job still running — wait for it to finish or cancel it first.' });
    hydrateJob(job);
    if (!job.rows.length && !job.staleRows.length) return sendJSON(res, 400, { error: 'No leads collected yet.' });
    const buf = buildWorkbook(job);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + workbookName(job) + '"',
      'Content-Length': buf.length,
    });
    return res.end(buf);
  }

  return sendJSON(res, 404, { error: 'Unknown app route' });
}

// ═══════════════════════════════════════════════ Blitz passthrough proxy
async function proxyBlitz(req, res) {
  const apiPath = req.url.replace(/^\/api/, '');
  if (!/^\/v2\/[a-z0-9/_-]+$/i.test(apiPath.split('?')[0])) {
    return sendJSON(res, 400, { error: 'Invalid API path' });
  }
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return sendJSON(res, 401, { error: 'Missing x-api-key header. Connect your Blitz API key first.' });
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const bodyRaw = Buffer.concat(chunks).toString('utf8');
  try {
    const upstream = await fetch(BLITZ_BASE + apiPath, {
      method: req.method === 'GET' ? 'GET' : 'POST',
      headers: {
        'x-api-key': String(apiKey),
        ...(req.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: req.method === 'GET' ? undefined : (bodyRaw || '{}'),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    });
    res.end(text);
  } catch (err) {
    sendJSON(res, 502, { error: 'Upstream request to Blitz failed: ' + err.message });
  }
}

// ═══════════════════════════════════════════════ static files
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname.startsWith('/api/')) return proxyBlitz(req, res);
  if (pathname.startsWith('/app/')) {
    return handleApp(req, res, pathname).catch(err => sendJSON(res, 500, { error: err.message }));
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  ⚡ Blitz Prospector running at  http://localhost:${PORT}\n`);
  const paused = Array.from(JOBS.values()).filter(j => j.status === 'paused').length;
  if (paused) console.log(`  ${paused} paused job(s) from a previous run — resume them from the Pulls tab.\n`);
});
