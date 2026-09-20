/* Blitz Prospector — API client, rate limiter, CSV engine. No AI anywhere: plain HTTP calls. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- key store
  const KEY_STORAGE = 'blitz_api_key';
  const Api = {
    getKey: () => localStorage.getItem(KEY_STORAGE) || '',
    setKey: (k) => localStorage.setItem(KEY_STORAGE, k.trim()),
    clearKey: () => localStorage.removeItem(KEY_STORAGE),
  };

  // ------------------------------------------------------------- rate limiter
  // Blitz allows 5 req/s per key; we run at 4 req/s with limited concurrency
  // so long enrichment batches never trip 429s.
  const limiter = {
    queue: [],
    running: 0,
    maxConcurrent: 4,
    minGapMs: 260, // ~3.8 req/s
    lastStart: 0,
    schedule(fn) {
      return new Promise((resolve, reject) => {
        this.queue.push({ fn, resolve, reject });
        this.pump();
      });
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

  async function rawCall(path, body, method) {
    const res = await fetch('/api' + path, {
      method: method || 'POST',
      headers: {
        'x-api-key': Api.getKey(),
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    let data;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!res.ok) {
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function call(path, body, method) {
    return limiter.schedule(() => rawCall(path, body, method));
  }

  // Retry once on 429/5xx with backoff — keeps long pulls resilient.
  async function callRetry(path, body, tries) {
    let attempt = 0, max = tries || 3;
    for (;;) {
      try { return await call(path, body); }
      catch (err) {
        attempt++;
        if (attempt >= max || (err.status && err.status < 429)) throw err;
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
  }

  // ----------------------------------------------------------- API endpoints
  Api.keyInfo = () => call('/v2/account/key-info', null, 'GET');
  Api.searchPeople = (body) => callRetry('/v2/search/people', body);
  Api.searchCompanies = (body) => callRetry('/v2/search/companies', body);
  Api.employeeFinder = (body) => callRetry('/v2/search/employee-finder', body);
  Api.waterfallIcp = (body) => callRetry('/v2/search/waterfall-icp-keyword', body);
  Api.findEmail = (linkedinUrl) => callRetry('/v2/enrichment/email', { person_linkedin_url: linkedinUrl });
  Api.findPhone = (linkedinUrl) => callRetry('/v2/enrichment/phone', { person_linkedin_url: linkedinUrl });
  Api.emailToPerson = (email) => callRetry('/v2/enrichment/email-to-person', { email });
  Api.phoneToPerson = (phone) => callRetry('/v2/enrichment/phone-to-person', { phone });
  Api.enrichCompany = (url) => callRetry('/v2/enrichment/company', { company_linkedin_url: url });
  Api.domainToLinkedin = (domain) => callRetry('/v2/enrichment/domain-to-linkedin', { domain });
  Api.linkedinToDomain = (url) => callRetry('/v2/enrichment/linkedin-to-domain', { company_linkedin_url: url });
  Api.distByCountry = (url) => callRetry('/v2/enrichment/company-distribution-by-country', { company_linkedin_url: url });
  Api.distByDepartment = (url) => callRetry('/v2/enrichment/company-distribution-by-department', { company_linkedin_url: url });

  // ------------------------------------------------------------- row mapping
  // Flatten a Blitz person profile into one clean lead row (Apollo-style).
  Api.personToRow = function (p) {
    const exp = (p.experiences || []).find(e => e.job_is_current) || (p.experiences || [])[0] || {};
    const loc = p.location || {};
    return {
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      full_name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '),
      job_title: exp.job_title || '',
      title_match: '',        // 'current' | 'past' — filled in during ingest when a title filter is active
      headline: p.headline || '',
      company: exp.company_name || '',
      company_domain: exp.company_domain || '',
      company_linkedin_url: exp.company_linkedin_url || '',
      industry: '',          // filled by company enrichment
      company_size_exact: '', // filled by company enrichment
      email: '',            // filled by enrichment
      email_status: '',     // 'verified' | 'not_found'
      phone: '',            // filled by enrichment
      phone_status: '',
      city: loc.city || '',
      state: loc.state_code || '',
      country: loc.country_code || '',
      continent: loc.continent || '',
      linkedin_url: p.linkedin_url || '',
      connections: p.connections_count != null ? p.connections_count : '',
      profile_picture_url: p.profile_picture_url || '',
      job_start_date: exp.job_start_date || '',
      skills: (p.skills || []).slice(0, 12).join('; '),
    };
  };

  Api.companyToRow = function (c) {
    const hq = c.hq || {};
    return {
      name: c.name || '',
      domain: c.domain || '',
      website: c.website || '',
      industry: c.industry || '',
      size: c.size || '',
      employees_on_linkedin: c.employees_on_linkedin != null ? c.employees_on_linkedin : '',
      type: c.type || '',
      founded_year: c.founded_year != null ? c.founded_year : '',
      followers: c.followers != null ? c.followers : '',
      hq_city: hq.city || '',
      hq_state: hq.state || '',
      hq_country: hq.country_code || hq.country_name || '',
      linkedin_url: c.linkedin_url || '',
      specialties: (c.specialties || []).slice(0, 15).join('; '),
      about: (c.about || '').slice(0, 300),
    };
  };

  // --------------------------------------------------------------- CSV export
  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  Api.toCSV = function (rows, columns) {
    const cols = columns || Object.keys(rows[0] || {});
    const header = cols.map(c => csvEscape(c.label || c)).join(',');
    const lines = rows.map(r => cols.map(c => csvEscape(r[c.key || c])).join(','));
    return '﻿' + [header].concat(lines).join('\r\n'); // BOM so Excel opens UTF-8 cleanly
  };

  Api.downloadCSV = function (rows, columns, filename) {
    const blob = new Blob([Api.toCSV(rows, columns)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'blitz-leads.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  window.BlitzApi = Api;
})();
