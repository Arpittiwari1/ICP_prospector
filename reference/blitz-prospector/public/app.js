/* Blitz Prospector — dashboard logic. Pure API calls + filter matching, no AI. */
(function () {
  'use strict';
  const Api = window.BlitzApi;
  const D = window.BLITZ_DATA;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ────────────────────────────────────────────────────────── tiny helpers
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add('hidden'), ms || 3200);
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Combining-diacritics range (U+0300-U+036F), built from char codes to
  // avoid embedding literal combining marks in this source file.
  var TITLE_DIACRITICS_RE = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

  // ────────────────────────────────────────────────────────── chips inputs
  // Splits a pasted or typed string on commas/semicolons/newlines/tabs so a
  // whole copied list ("foo, bar, baz") becomes N chips in one shot instead
  // of forcing one-at-a-time re-entry.
  function splitMulti(raw) {
    return String(raw == null ? '' : raw).split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
  }
  const chips = {}; // name -> array of values
  function initChips() {
    $$('.chips-input').forEach(box => {
      const name = box.dataset.chips;
      chips[name] = [];
      const input = box.querySelector('input');
      const suggestKey = box.dataset.suggest;

      function render() {
        box.querySelectorAll('.chip').forEach(c => c.remove());
        chips[name].forEach((v, i) => {
          const c = document.createElement('div');
          c.className = 'chip';
          c.title = 'Click to remove';
          c.innerHTML = '<span>' + esc(v) + '</span><b data-i="' + i + '">×</b>';
          const remove = () => { chips[name].splice(i, 1); render(); };
          c.onclick = remove;                                  // click anywhere on the chip
          c.querySelector('b').onclick = (e) => { e.stopPropagation(); remove(); };
          box.insertBefore(c, input);
        });
        box.classList.toggle('has-clear', chips[name].length > 0);
      }
      box._render = render;

      let clearBtn = box.querySelector('.chip-clear-btn');
      if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'chip-clear-btn';
        clearBtn.title = 'Clear this field';
        clearBtn.textContent = '✕';
        clearBtn.onclick = (e) => { e.preventDefault(); chips[name] = []; render(); hideUnmatched(); };
        box.appendChild(clearBtn);
      }

      // Persistent panel (does NOT auto-dismiss) showing exactly which pasted
      // values matched and which didn't, for suggest-enabled fields. Lives
      // right under the chips box so it's obvious which field it refers to.
      let unmatchedEl = null;
      function hideUnmatched() { if (unmatchedEl) { unmatchedEl.remove(); unmatchedEl = null; } }
      function showUnmatched(failedTokens, totalTokens) {
        if (!suggestKey) return;
        hideUnmatched();
        if (!failedTokens.length) return;
        const kind = suggestKey === 'countries' ? 'countries' : 'industries';
        const matched = totalTokens - failedTokens.length;
        unmatchedEl = document.createElement('div');
        unmatchedEl.className = 'unmatched-panel';
        unmatchedEl.innerHTML =
          '<div class="unmatched-head">' +
            '<span>Matched ' + matched + ' of ' + totalTokens + ' ' + kind + ' — ' + failedTokens.length + ' need' + (failedTokens.length === 1 ? 's' : '') + ' attention</span>' +
            '<button type="button" class="unmatched-dismiss" title="Dismiss">✕</button>' +
          '</div>' +
          '<div class="unmatched-sub">Didn\'t match a known ' + (suggestKey === 'countries' ? 'country' : 'industry') + ' — check for typos, or pick from the dropdown:</div>' +
          '<ul class="unmatched-list">' + failedTokens.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>';
        unmatchedEl.querySelector('.unmatched-dismiss').onclick = (e) => { e.preventDefault(); hideUnmatched(); };
        box.parentNode.insertBefore(unmatchedEl, box.nextSibling);
      }

      function add(v) {
        v = v.trim();
        if (!v || chips[name].includes(v)) return;
        chips[name].push(v);
        input.value = '';
        closeSuggest();
        render();
      }

      // Suggest-enabled fields (countries, industries) only accept exact
      // values from Blitz's known list — resolves a typed/pasted token to
      // the correct code/string, or returns null if it doesn't match
      // anything (caller skips it and warns, instead of sending Blitz a
      // string it will reject, e.g. "United Kingdom" where it wants "GB").
      function resolveToken(raw) {
        const q = raw.trim();
        if (!q) return null;
        if (!suggestKey) return q; // plain free-text field — no validation needed
        if (suggestKey === 'countries') {
          const qLower = q.toLowerCase();
          const hit = D.countries.find(([code, label]) => code.toLowerCase() === qLower || label.toLowerCase() === qLower);
          return hit ? hit[0] : null;
        }
        const list = D[suggestKey] || [];
        const qLower = q.toLowerCase();
        const exact = list.find(v => v.toLowerCase() === qLower);
        if (exact) return exact;
        const contains = list.filter(v => v.toLowerCase().includes(qLower));
        return contains.length === 1 ? contains[0] : null; // only auto-pick if unambiguous
      }

      // Resolves + adds one token; returns false (and leaves it out) if it
      // doesn't match anything in a suggest-enabled field.
      function addToken(raw) {
        const resolved = resolveToken(raw);
        if (resolved === null) return false;
        add(resolved);
        return true;
      }

      function addManyTokens(tokens) {
        const failedTokens = [];
        tokens.forEach(t => { if (!addToken(t)) failedTokens.push(t); });
        if (suggestKey) {
          showUnmatched(failedTokens, tokens.length);
        } else if (failedTokens.length) {
          toast(failedTokens.length + ' of ' + tokens.length + " pasted values were skipped.", 5000);
        }
      }

      let sugEl = null;
      function closeSuggest() { if (sugEl) { sugEl.remove(); sugEl = null; } }
      function openSuggest() {
        if (!suggestKey) return;
        closeSuggest();
        const q = input.value.trim().toLowerCase();
        if (!q) return;
        let opts;
        if (suggestKey === 'countries') {
          opts = D.countries
            .filter(([code, label]) => label.toLowerCase().includes(q) || code.toLowerCase() === q)
            .map(([code, label]) => ({ value: code, label: label + ' (' + code + ')' }));
        } else {
          opts = D[suggestKey].filter(v => v.toLowerCase().includes(q)).map(v => ({ value: v, label: v }));
        }
        opts = opts.slice(0, 12);
        if (!opts.length) return;
        sugEl = document.createElement('div');
        sugEl.className = 'suggest';
        opts.forEach(o => {
          const d = document.createElement('div');
          d.textContent = o.label;
          d.onmousedown = (e) => { e.preventDefault(); add(o.value); };
          sugEl.appendChild(d);
        });
        box.appendChild(sugEl);
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const parts = splitMulti(input.value);
          if (parts.length > 1) {
            addManyTokens(parts); // pasted/typed list — resolve + add every token
          } else if (parts.length === 1) {
            if (suggestKey && sugEl && sugEl.firstChild) {
              add(sugEl.firstChild.textContent.replace(/^(.*) \(([A-Z]{2})\)$/, suggestKey === 'countries' ? '$2' : '$1'));
            } else if (!addToken(parts[0]) && suggestKey) {
              showUnmatched([parts[0]], 1);
            }
          }
        } else if (e.key === 'Backspace' && !input.value && chips[name].length) {
          chips[name].pop(); render();
        }
      });
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text && /[,;\n\t]/.test(text)) {
          e.preventDefault();
          addManyTokens(splitMulti(text));
        }
      });
      input.addEventListener('input', openSuggest);
      input.addEventListener('blur', () => setTimeout(closeSuggest, 150));
    });
  }
  function chipVals(name) { return chips[name] || []; }
  function clearChips(prefix) {
    Object.keys(chips).forEach(k => { if (k.startsWith(prefix)) { chips[k] = []; } });
    $$('.chips-input').forEach(b => b._render && b._render());
    $$('.chips-input[data-chips^="' + prefix + '"]').forEach(b => {
      const p = b.nextSibling;
      if (p && p.classList && p.classList.contains('unmatched-panel')) p.remove();
    });
  }

  // ─────────────────────────────────────────────────── checkbox group builder
  function buildChecks(elId, values, oneCol) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (oneCol) el.classList.add('one-col');
    el.innerHTML = values.map(v =>
      '<label><input type="checkbox" value="' + esc(v) + '"> ' + esc(v) + '</label>'
    ).join('');
  }
  function checkedVals(elId) {
    return $$('#' + elId + ' input:checked').map(i => i.value);
  }
  function clearChecks(scope) {
    $$(scope + ' input[type=checkbox]').forEach(i => {
      // Action toggles (auto-enrich email/phone/company, only-current-role,
      // skip-used) live in .search-actions and aren't filter criteria —
      // "Clear all" should reset your search, not silently flip settings
      // like enrichment or current-role enforcement off.
      if (i.closest('.search-actions')) return;
      i.checked = false;
    });
    $$(scope + ' input[type=number], ' + scope + ' input[type=text]').forEach(i => { i.value = i.id.endsWith('pull_count') ? '100' : (i.id === 'w_max' ? '1' : ''); });
  }

  // ─────────────────────────────────────────────────────────── query builders
  function num(id) { const v = $('#' + id).value; return v === '' ? undefined : Number(v); }
  function prune(obj) { // drop empty arrays / undefined / empty objects recursively
    if (Array.isArray(obj)) return obj.length ? obj : undefined;
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        const p = prune(v);
        if (p !== undefined) out[k] = p;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return obj === undefined || obj === '' ? undefined : obj;
  }

  function buildCompanyFilter(prefix) {
    return prune({
      employee_range: checkedVals(prefix + '_ranges'),
      employee_count: { min: num(prefix + '_emp_min'), max: num(prefix + '_emp_max') },
      founded_year: { min: num(prefix + '_founded_min'), max: num(prefix + '_founded_max') },
      industry: {
        include: chipVals(prefix + '_industries'),
        exclude: chipVals(prefix + '_industries_exclude'),
      },
      keywords: {
        include: chipVals(prefix + '_keywords'),
        exclude: chipVals(prefix + '_keywords_exclude'),
      },
      name: {
        include: chipVals(prefix + '_names'),
        exclude: chipVals(prefix + '_names_exclude'),
      },
      type: { include: checkedVals(prefix + '_types') },
      min_linkedin_followers: num(prefix + '_min_followers'),
      linkedin_url: chipVals(prefix + '_linkedin_urls'),
      hq: {
        country_code: chipVals(prefix + '_countries'),
        city: {
          include: chipVals(prefix + '_cities'),
          exclude: chipVals(prefix + '_cities_exclude'),
        },
        sales_region: checkedVals(prefix + '_regions'),
        continent: checkedVals(prefix + '_continents'),
      },
    });
  }

  function buildPeopleQuery(maxResults, cursor) {
    let include = chipVals('p_titles');
    let exclude = chipVals('p_titles_exclude');
    if ($('#p_titles_exact').checked) {
      include = include.map(t => t.startsWith('[') ? t : '[' + t + ']');
      exclude = exclude.map(t => t.startsWith('[') ? t : '[' + t + ']');
    }
    return prune({
      people: {
        job_title: {
          include,
          exclude,
          include_linkedin_headline: $('#p_headline').checked || undefined,
        },
        job_level: checkedVals('p_levels'),
        job_function: checkedVals('p_functions'),
        min_connections: num('p_min_connections'),
        location: {
          country_code: chipVals('p_countries'),
          city: chipVals('p_cities'),
          sales_region: checkedVals('p_regions'),
          continent: checkedVals('p_continents'),
        },
      },
      company: buildCompanyFilter('pc'),
      max_results: maxResults,
      cursor: cursor || undefined,
    }) || { max_results: maxResults };
  }

  function buildCompaniesQuery(maxResults, cursor) {
    return prune({
      company: buildCompanyFilter('c'),
      max_results: maxResults,
      cursor: cursor || undefined,
    }) || { max_results: maxResults };
  }

  // ───────────────────────────────────────────────────────── progress helper
  function progress(paneId) {
    const wrap = $('#' + paneId + '-progress');
    const bar = wrap.querySelector('.progress-bar');
    const label = wrap.querySelector('.progress-label');
    return {
      show(text) { wrap.classList.remove('hidden'); bar.style.width = '0%'; label.textContent = text || ''; },
      set(done, total, text) {
        bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
        label.textContent = text || (done + ' / ' + total);
      },
      hide() { wrap.classList.add('hidden'); },
    };
  }

  // ══════════════════════════════════════════════════════════ PEOPLE TAB
  const peopleState = {
    rows: [], cursor: null, total: 0, seen: new Set(), busy: false, domainUrls: [],
    dncDomains: new Set(), blockedDomain: 0,
    titleFilter: null, enforceCurrentRole: true, blockedStaleTitle: 0,
  };

  const PEOPLE_COLS = [
    { key: 'full_name', label: 'Name' },
    { key: 'job_title', label: 'Title' },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'linkedin_url', label: 'LinkedIn' },
    { key: 'connections', label: 'Conn.' },
  ];
  const PEOPLE_CSV_COLS = [
    'first_name', 'last_name', 'full_name', 'job_title', 'title_match', 'company', 'company_domain',
    'industry', 'company_size_exact',
    'email', 'email_status', 'phone', 'phone_status', 'city', 'state', 'country',
    'linkedin_url', 'company_linkedin_url', 'headline', 'connections', 'job_start_date', 'skills',
  ];

  function personLocation(r) {
    return [r.city, r.state, r.country].filter(Boolean).join(', ');
  }

  function renderPeopleTable(tableId, rows) {
    const t = $('#' + tableId);
    if (!rows.length) {
      t.innerHTML = '<tbody><tr><td class="empty">No results yet.</td></tr></tbody>';
      return;
    }
    const head = '<thead><tr>' + PEOPLE_COLS.map(c => '<th>' + c.label + '</th>').join('') + '</tr></thead>';
    const body = rows.map(r => {
      const emailCell = r.email
        ? esc(r.email) + ' <span class="pill ok">✓</span>'
        : (r.email_status === 'not_found' ? '<span class="pill miss">not found</span>' : '<span class="muted">—</span>');
      const phoneCell = r.phone
        ? esc(r.phone)
        : (r.phone_status === 'not_found' ? '<span class="pill miss">not found</span>' : '<span class="muted">—</span>');
      const avatar = r.profile_picture_url
        ? '<img class="avatar" src="' + esc(r.profile_picture_url) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
        : '<span class="avatar" style="display:inline-block"></span>';
      return '<tr>' +
        '<td title="' + esc(r.headline) + '">' + avatar + '<strong>' + esc(r.full_name) + '</strong></td>' +
        '<td title="' + esc(r.job_title) + '">' + esc(r.job_title) + '</td>' +
        '<td title="' + esc(r.company) + '">' + esc(r.company) + (r.company_domain ? ' <span class="muted">· ' + esc(r.company_domain) + '</span>' : '') + '</td>' +
        '<td>' + emailCell + '</td>' +
        '<td>' + phoneCell + '</td>' +
        '<td>' + esc(personLocation(r)) + '</td>' +
        '<td>' + (r.linkedin_url ? '<a href="' + esc(r.linkedin_url) + '" target="_blank" rel="noopener">profile ↗</a>' : '') + '</td>' +
        '<td>' + esc(r.connections) + '</td>' +
        '</tr>';
    }).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function updatePeopleMeta() {
    const withEmail = peopleState.rows.filter(r => r.email).length;
    $('#people-meta').innerHTML =
      '<strong>' + fmt(peopleState.rows.length) + '</strong> leads loaded' +
      (peopleState.total ? ' of <strong>' + fmt(peopleState.total) + '</strong> matching' : '') +
      (withEmail ? ' · <strong>' + fmt(withEmail) + '</strong> emails' : '') +
      (peopleState.blockedDomain ? ' · <strong>' + fmt(peopleState.blockedDomain) + '</strong> blocked (DNC)' : '') +
      (peopleState.blockedStaleTitle ? ' · <strong>' + fmt(peopleState.blockedStaleTitle) + '</strong> dropped (past role)' : '');
    const has = peopleState.rows.length > 0;
    $('#btn-people-csv').disabled = !has;
    $('#btn-people-enrich-email').disabled = !has;
    $('#btn-people-enrich-phone').disabled = !has;
    $('#btn-people-enrich-company').disabled = !has;
    $('#btn-people-more').disabled = !peopleState.cursor;
  }

  function normalizeDomainClient(raw) {
    return String(raw || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split(':')[0];
  }

  // Re-verifies a title match against the person's CURRENT title/headline
  // only, so a stale/past-role match (the classic "Apollo shows an old job"
  // problem) doesn't slip through. Mirrors the server-side check exactly.
  function normalizeTitleText(s) {
    return String(s || '').normalize('NFD').replace(TITLE_DIACRITICS_RE, '').toLowerCase().trim();
  }
  // Tokenized (non-exact) matching is substring-based, which fails on the
  // most common real case: searching "CMO" doesn't textually appear in a
  // current title of "Chief Marketing Officer". Expanding known
  // abbreviations on both sides before comparing fixes that; exact-bracket
  // matches stay literal on purpose and are not expanded. Mirrors server.js.
  var TITLE_ABBREVIATIONS = {
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
    if (!includeTitles || !includeTitles.length) return true;
    const fields = [normalizeTitleText(currentTitle)];
    if (includeHeadline) fields.push(normalizeTitleText(currentHeadline));
    const nonEmpty = fields.filter(Boolean);
    if (!nonEmpty.length) return false;
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

  function ingestPeople(results) {
    let added = 0;
    for (const p of results) {
      const key = p.linkedin_url || JSON.stringify(p);
      if (peopleState.seen.has(key)) continue;
      peopleState.seen.add(key);
      const row = Api.personToRow(p);
      if (peopleState.dncDomains && peopleState.dncDomains.size && row.company_domain && peopleState.dncDomains.has(normalizeDomainClient(row.company_domain))) {
        peopleState.blockedDomain = (peopleState.blockedDomain || 0) + 1;
        continue; // this client has blocked this company — never added
      }
      if (peopleState.titleFilter && peopleState.titleFilter.include && peopleState.titleFilter.include.length) {
        const isCurrent = titleMatchesCurrentRole(peopleState.titleFilter.include, row.job_title, row.headline, !!peopleState.titleFilter.include_linkedin_headline);
        row.title_match = isCurrent ? 'current' : 'past';
        if (!isCurrent && peopleState.enforceCurrentRole) {
          peopleState.blockedStaleTitle = (peopleState.blockedStaleTitle || 0) + 1;
          continue; // matched a past role, not their current one
        }
      }
      peopleState.rows.push(row);
      added++;
    }
    return added;
  }

  async function searchPeople(fresh) {
    if (peopleState.busy) return;
    peopleState.busy = true;
    try {
      if (fresh) {
        peopleState.rows = []; peopleState.cursor = null; peopleState.seen = new Set(); peopleState.domainUrls = [];
        peopleState.blockedDomain = 0; peopleState.blockedStaleTitle = 0;
        peopleState.dncDomains = await loadDncDomains(currentClient());
        peopleState.enforceCurrentRole = $('#p_enforce_current').checked;
        const domains = chipVals('pc_domains');
        if (domains.length) {
          $('#people-meta').textContent = 'Matching ' + fmt(domains.length) + ' company URLs…';
          const { urls, unresolvedCount } = await resolveDomainsClient(domains);
          peopleState.domainUrls = urls;
          if (unresolvedCount) toast(unresolvedCount + ' of ' + domains.length + ' company URLs didn’t match a company.');
          if (!urls.length) {
            renderPeopleTable('people-table', []);
            $('#people-meta').textContent = 'None of the pasted company URLs matched a company — try different ones.';
            peopleState.busy = false;
            updatePeopleMeta();
            return;
          }
        }
      }
      $('#people-meta').textContent = 'Searching…';
      const q = buildPeopleQuery(25, peopleState.cursor);
      if (fresh) peopleState.titleFilter = q.people && q.people.job_title;
      const combined = combinedCompanyUrls(q, peopleState.domainUrls);
      if (combined.length > MAX_COMPANY_URLS_PER_QUERY) {
        q.company = q.company || {};
        q.company.linkedin_url = combined.slice(0, MAX_COMPANY_URLS_PER_QUERY);
        if (fresh) toast('Previewing the first 50 of ' + fmt(combined.length) + ' matched companies here — use Pull leads to search all of them.', 6000);
      } else {
        mergeDomainUrls(q, peopleState.domainUrls);
      }
      const res = await Api.searchPeople(q);
      peopleState.total = res.total_results || 0;
      peopleState.cursor = res.cursor || null;
      ingestPeople(res.results || []);
      renderPeopleTable('people-table', peopleState.rows);
      updatePeopleMeta();
    } catch (err) {
      toast('Search failed: ' + err.message);
      updatePeopleMeta();
    } finally { peopleState.busy = false; }
  }

  // ── server-side pull jobs ──────────────────────────────────────────
  // Big pulls run on the Node server: they survive a closed tab, checkpoint
  // to disk, and deliver one Excel workbook (Verified Emails / No Email tabs).
  let watchTimer = null;

  async function appFetch(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  // Fetches a client's do-not-contact domain list for the quick Search
  // people tab (Pull leads enforces this server-side automatically).
  async function loadDncDomains(client) {
    if (!client) return new Set();
    try {
      const dnc = await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc');
      return new Set(dnc.domains || []);
    } catch {
      return new Set();
    }
  }

  // Both domain + email lists at once, for tabs that enforce both (Employee
  // Finder, Waterfall). Empty sets (not an error) when no client is picked.
  async function loadDncLists(client) {
    if (!client) return { domains: new Set(), emails: new Set() };
    try {
      const dnc = await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc');
      return { domains: new Set(dnc.domains || []), emails: new Set((dnc.emails || []).map(e => e.toLowerCase())) };
    } catch {
      return { domains: new Set(), emails: new Set() };
    }
  }

  // Drops rows whose enriched email is on the client's DNC list. Returns
  // the number removed so the caller can report it.
  function applyEmailDncClient(rows, dncEmails) {
    if (!dncEmails || !dncEmails.size) return 0;
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].email && dncEmails.has(rows[i].email.toLowerCase())) rows.splice(i, 1);
    }
    return before - rows.length;
  }

  // Resolves pasted company website URLs to LinkedIn company URLs via the
  // server's cached lookup (same cache the Pull-leads job engine uses).
  async function resolveDomainsClient(domains) {
    if (!domains.length) return { urls: [], unresolvedCount: 0 };
    try {
      const map = await appFetch('/app/domains/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': Api.getKey() },
        body: JSON.stringify({ domains }),
      });
      const vals = Object.values(map);
      const urls = vals.filter(Boolean);
      return { urls, unresolvedCount: vals.length - urls.length };
    } catch (err) {
      toast('Company URL matching failed: ' + err.message);
      return { urls: [], unresolvedCount: domains.length };
    }
  }

  // Folds resolved LinkedIn company URLs into a query's company.linkedin_url
  // filter (unioned with any URLs already there from manual entry).
  function mergeDomainUrls(query, urls) {
    if (!urls || !urls.length) return query;
    query.company = query.company || {};
    const existing = Array.isArray(query.company.linkedin_url) ? query.company.linkedin_url : [];
    query.company.linkedin_url = Array.from(new Set([...existing, ...urls]));
    return query;
  }

  // Blitz rejects any company.linkedin_url list longer than this — a pasted
  // domain list plus manually-typed URLs can easily exceed it.
  const MAX_COMPANY_URLS_PER_QUERY = 50;
  function chunkArr(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  function combinedCompanyUrls(query, domainUrls) {
    const existing = (query.company && Array.isArray(query.company.linkedin_url)) ? query.company.linkedin_url : [];
    return Array.from(new Set([...existing, ...(domainUrls || [])]));
  }
  // Blitz can't take >50 companies in one call, so a TAM check over a big
  // pasted list runs one max_results:1 query per batch of 50 and sums them.
  async function sumTamAcrossBatches(baseQuery, combinedUrls) {
    const batches = chunkArr(combinedUrls, MAX_COMPANY_URLS_PER_QUERY);
    let sum = 0;
    for (const batch of batches) {
      const q = { ...baseQuery, company: { ...(baseQuery.company || {}), linkedin_url: batch } };
      const r = await Api.searchPeople(q);
      sum += r.total_results || 0;
    }
    return { total: sum, batches: batches.length };
  }

  async function pullLeads() {
    const goal = Math.max(1, Math.min(50000, num('p_pull_count') || 100));
    const q = buildPeopleQuery(1);
    delete q.max_results;
    delete q.cursor;
    const payload = {
      query: q,
      domains: chipVals('pc_domains'),
      goal,
      enrich_email: $('#p_auto_email').checked,
      enrich_phone: $('#p_auto_phone').checked,
      enrich_company: $('#p_auto_company').checked,
      enforce_current_role: $('#p_enforce_current').checked,
      client: currentClient(),
      campaign: $('#p_campaign').value.trim(),
      skip_used: $('#p_skip_used').checked,
    };
    try {
      const job = await appFetch('/app/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': Api.getKey() },
        body: JSON.stringify(payload),
      });
      toast('Pull started on the server' + (payload.client ? ' for ' + payload.client : '') + ' — you can close this page, it keeps going.');
      watchJob(job.id, true);
    } catch (err) {
      toast('Could not start pull: ' + err.message, 5000);
    }
  }

  function jobPhaseLabel(j) {
    if (j.status === 'done' && j.zero_domain_matches) return 'done — 0 of ' + fmt(j.domains_requested) + ' company URLs matched';
    if (j.status === 'running') {
      if (j.phase === 'resolve') return 'Matching company URLs ' + fmt(j.enrich_done) + ' / ' + fmt(j.enrich_total);
      if (j.phase === 'collect') return 'Collecting ' + fmt(j.collected) + ' / ' + fmt(j.goal) + ' leads';
      if (j.phase === 'company') return 'Looking up industry/size ' + fmt(j.enrich_done) + ' / ' + fmt(j.enrich_total) + ' companies';
      if (j.phase === 'email') return 'Enriching emails ' + fmt(j.enrich_done) + ' / ' + fmt(j.enrich_total);
      if (j.phase === 'phone') return 'Enriching phones ' + fmt(j.enrich_done) + ' / ' + fmt(j.enrich_total);
      return 'Running…';
    }
    return j.status;
  }
  function jobFraction(j) {
    if (j.phase === 'resolve' || j.phase === 'company' || j.phase === 'email' || j.phase === 'phone') return j.enrich_total ? j.enrich_done / j.enrich_total : 0;
    if (j.phase === 'collect') return j.goal ? j.collected / j.goal : 0;
    return j.status === 'done' ? 1 : 0;
  }

  // Poll one job and mirror it on the People progress bar; auto-download when done.
  function watchJob(id, autoDownload) {
    const prog = progress('people');
    prog.show('Starting…');
    $('#pulls-dot').classList.remove('hidden');
    clearInterval(watchTimer);
    watchTimer = setInterval(async () => {
      try {
        const j = await appFetch('/app/jobs/' + id);
        prog.set(Math.round(jobFraction(j) * 100), 100, jobPhaseLabel(j));
        if (['done', 'error', 'cancelled', 'paused'].includes(j.status)) {
          clearInterval(watchTimer);
          $('#pulls-dot').classList.add('hidden');
          prog.hide();
          refreshAccount();
          if (j.status === 'done') {
            const parts = [fmt(j.collected) + ' leads', fmt(j.emails_found) + ' verified emails'];
            if (j.skipped_used) parts.push(fmt(j.skipped_used) + ' skipped (already used)');
            if (j.annotated_used) parts.push(fmt(j.annotated_used) + ' tagged as previously used');
            toast('Pull complete — ' + parts.join(' · ') + '. Downloading workbook…', 6000);
            if (autoDownload && j.collected > 0) window.location = '/app/jobs/' + id + '/download';
          } else if (j.status === 'error') {
            toast('Pull failed: ' + (j.error || 'unknown error') + ' — you can resume it from the Pulls tab.', 7000);
          }
          renderJobs();
        }
      } catch (err) { /* server briefly unreachable — keep polling */ }
    }, 2000);
  }

  // ── Pulls tab (job list) ──
  async function renderJobs() {
    let jobs = [];
    try { jobs = await appFetch('/app/jobs'); } catch { return; }
    const t = $('#jobs-table');
    const anyRunning = jobs.some(j => j.status === 'running' || j.status === 'queued');
    $('#pulls-dot').classList.toggle('hidden', !anyRunning);
    if (!jobs.length) {
      t.innerHTML = '<tbody><tr><td class="empty">No pulls yet — start one from the People tab.</td></tr></tbody>';
      return;
    }
    const head = '<thead><tr><th>Started</th><th>Client</th><th>Campaign</th><th>Progress</th><th>Emails</th><th>Used-lead handling</th><th>Status</th><th>Actions</th></tr></thead>';
    const body = jobs.map(j => {
      const pct = Math.round(jobFraction(j) * 100);
      const canDownload = (j.collected > 0 || j.blocked_stale_title > 0) && j.status !== 'running' && j.status !== 'queued';
      const canResume = ['paused', 'error', 'cancelled'].includes(j.status);
      const canCancel = j.status === 'running' || j.status === 'queued';
      const used = j.skip_used
        ? (j.skipped_used ? fmt(j.skipped_used) + ' skipped' : 'skip mode')
        : (j.annotated_used ? fmt(j.annotated_used) + ' tagged' : 'tag mode');
      return '<tr>' +
        '<td>' + esc((j.created_at || '').replace('T', ' ').slice(0, 16)) + '</td>' +
        '<td>' + esc(j.client || '—') + '</td>' +
        '<td>' + esc(j.campaign || '—') + '</td>' +
        '<td><span class="mini-progress"><i style="width:' + pct + '%"></i></span>' + fmt(j.collected) + ' / ' + fmt(j.goal) + '</td>' +
        '<td>' + fmt(j.emails_found || 0) + '</td>' +
        '<td>' + esc(used) + '</td>' +
        '<td><span class="job-status ' + esc(j.status) + '">' + esc(jobPhaseLabel(j)) + '</span>' +
        (j.error ? '<br><span class="muted small">' + esc(j.error) + '</span>' : '') +
        (j.domains_requested && !j.zero_domain_matches ? '<br><span class="muted small">' + fmt(j.domains_matched) + ' / ' + fmt(j.domains_requested) + ' company URLs matched</span>' : '') +
        (j.blocked_stale_title ? '<br><span class="muted small">' + fmt(j.blocked_stale_title) + ' set aside on the "Needs Title Confirmation" tab (past-role match)</span>' : '') +
        '</td>' +
        '<td>' +
        (canCancel ? '<button class="btn" data-job-cancel="' + j.id + '">Cancel</button> ' : '') +
        (canResume ? '<button class="btn" data-job-resume="' + j.id + '">Resume</button> ' : '') +
        (canDownload ? '<a class="btn btn-accent" href="/app/jobs/' + j.id + '/download">⬇ Workbook</a>' : '') +
        '</td>' +
        '</tr>';
    }).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
    t.querySelectorAll('[data-job-cancel]').forEach(b => b.onclick = async () => {
      await appFetch('/app/jobs/' + b.dataset.jobCancel + '/cancel', { method: 'POST' }).catch(e => toast(e.message));
      renderJobs();
    });
    t.querySelectorAll('[data-job-resume]').forEach(b => b.onclick = async () => {
      try {
        await appFetch('/app/jobs/' + b.dataset.jobResume + '/resume', {
          method: 'POST', headers: { 'x-api-key': Api.getKey() },
        });
        toast('Job resumed.');
        watchJob(b.dataset.jobResume, true);
        renderJobs();
      } catch (e) { toast('Resume failed: ' + e.message); }
    });
  }

  // ── clients ──
  function currentClient() { return $('#client-select').value === '__new' ? '' : $('#client-select').value; }

  async function loadClientList() {
    let clients = [];
    try { clients = await appFetch('/app/clients'); } catch { /* server route unavailable */ }
    const sel = $('#client-select');
    const saved = localStorage.getItem('blitz_client') || '';
    sel.innerHTML = '<option value="">No client</option>' +
      clients.map(c => {
        const dncTotal = c.dnc ? (c.dnc.emails + c.dnc.domains) : 0;
        return '<option value="' + esc(c.name) + '">' + esc(c.name) + ' (' + fmt(c.used_leads) + ' used' + (dncTotal ? ', ' + fmt(dncTotal) + ' blocked' : '') + ')</option>';
      }).join('') +
      '<option value="__new">+ New client…</option>';
    if (saved && clients.some(c => c.name === saved)) sel.value = saved;
  }

  async function onClientChange() {
    const sel = $('#client-select');
    if (sel.value === '__new') {
      const name = prompt('New client name:');
      if (name && name.trim()) {
        try {
          await appFetch('/app/clients', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
          });
          await loadClientList();
          sel.value = name.trim();
        } catch (e) { toast('Could not add client: ' + e.message); sel.value = ''; }
      } else sel.value = localStorage.getItem('blitz_client') || '';
    }
    localStorage.setItem('blitz_client', currentClient());
  }

  // ── TAM check (1 credit: runs the search with max_results=1) ──
  async function checkTam(kind) {
    const el = $('#' + kind + '-tam');
    el.textContent = 'Checking…';
    try {
      if (kind === 'people') {
        const domains = chipVals('pc_domains');
        const q = buildPeopleQuery(1);
        if (domains.length) {
          const { urls, unresolvedCount } = await resolveDomainsClient(domains);
          if (!urls.length) { el.textContent = 'TAM: 0 people match (no pasted company URLs matched)'; return; }
          if (unresolvedCount) toast(unresolvedCount + ' of ' + domains.length + ' company URLs didn’t match a company.');
          const combined = combinedCompanyUrls(q, urls);
          if (combined.length > MAX_COMPANY_URLS_PER_QUERY) {
            el.textContent = 'Checking ' + fmt(combined.length) + ' companies in batches…';
            const { total, batches } = await sumTamAcrossBatches(q, combined);
            el.textContent = 'TAM: ' + fmt(total) + ' people match (' + fmt(combined.length) + ' companies, ' + batches + ' batches)';
            return;
          }
          mergeDomainUrls(q, urls);
        }
        const res = await Api.searchPeople(q);
        el.textContent = 'TAM: ' + fmt(res.total_results || 0) + ' people match';
      } else {
        const res = await Api.searchCompanies(buildCompaniesQuery(1));
        el.textContent = 'TAM: ' + fmt(res.total_results || 0) + ' companies match';
      }
    } catch (err) {
      el.textContent = '';
      toast('TAM check failed: ' + err.message);
    }
  }

  // Samples up to 50 real matches and runs the same current-role check Pull
  // leads would apply, so you can see the impact of "Only current role"
  // before committing to a full pull — without needing to run one twice
  // (TAM alone can't show this: it never looks at an individual person, so
  // there's nothing for the current-role check to run against).
  async function estimateTitleImpact() {
    const el = $('#people-title-impact');
    const q = buildPeopleQuery(50);
    const titleFilter = q.people && q.people.job_title;
    if (!titleFilter || !titleFilter.include || !titleFilter.include.length) {
      return toast('Add at least one job title first — there’s nothing to estimate without one.');
    }
    el.textContent = 'Sampling up to 50 matches…';
    try {
      const domains = chipVals('pc_domains');
      if (domains.length) {
        const { urls, unresolvedCount } = await resolveDomainsClient(domains);
        if (unresolvedCount) toast(unresolvedCount + ' of ' + domains.length + ' company URLs didn’t match a company.');
        if (!urls.length) { el.textContent = 'No matches — none of the pasted company URLs resolved.'; return; }
        const combined = combinedCompanyUrls(q, urls);
        if (combined.length > MAX_COMPANY_URLS_PER_QUERY) {
          q.company = q.company || {};
          q.company.linkedin_url = combined.slice(0, MAX_COMPANY_URLS_PER_QUERY);
        } else {
          mergeDomainUrls(q, urls);
        }
      }
      const res = await Api.searchPeople(q);
      const total = res.total_results || 0;
      const sampleRows = (res.results || []).map(Api.personToRow);
      const sampleSize = sampleRows.length;
      if (!sampleSize) { el.textContent = 'No matches to sample.'; return; }
      let currentCount = 0;
      for (const row of sampleRows) {
        if (titleMatchesCurrentRole(titleFilter.include, row.job_title, row.headline, !!titleFilter.include_linkedin_headline)) currentCount++;
      }
      const pct = Math.round((currentCount / sampleSize) * 100);
      const estCurrent = Math.round(total * (currentCount / sampleSize));
      const estPast = Math.max(0, total - estCurrent);
      el.innerHTML = 'Sample of <strong>' + fmt(sampleSize) + '</strong>: <strong>' + pct + '%</strong> hold that title right now (~' +
        fmt(estCurrent) + ' of ' + fmt(total) + ' est.) · <strong>' + (100 - pct) + '%</strong> only matched a past role (~' + fmt(estPast) + ' est.)';
    } catch (err) {
      el.textContent = '';
      toast('Estimate failed: ' + err.message);
    }
  }

  // ── saved ICP presets (People tab filters only, stored in this browser) ──
  const ICP_CHIP_KEYS = [
    'p_titles', 'p_titles_exclude', 'p_countries', 'p_cities',
    'pc_industries', 'pc_industries_exclude', 'pc_keywords', 'pc_keywords_exclude',
    'pc_names', 'pc_names_exclude', 'pc_linkedin_urls', 'pc_domains', 'pc_countries', 'pc_cities',
  ];
  const ICP_CHECK_GROUPS = ['p_levels', 'p_functions', 'p_regions', 'p_continents', 'pc_ranges', 'pc_types', 'pc_regions'];
  const ICP_FIELD_IDS = ['p_titles_exact', 'p_headline', 'p_enforce_current', 'p_min_connections', 'pc_emp_min', 'pc_emp_max', 'pc_founded_min', 'pc_founded_max', 'pc_min_followers'];
  const ICP_PRESETS_KEY = 'blitz_icp_presets';

  function capturePreset() {
    const snap = { chips: {}, checks: {}, fields: {} };
    ICP_CHIP_KEYS.forEach(k => { snap.chips[k] = (chips[k] || []).slice(); });
    ICP_CHECK_GROUPS.forEach(id => { snap.checks[id] = checkedVals(id); });
    ICP_FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) snap.fields[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return snap;
  }

  function applyPreset(snap) {
    ICP_CHIP_KEYS.forEach(k => { chips[k] = (snap.chips && snap.chips[k]) ? snap.chips[k].slice() : []; });
    $$('.chips-input').forEach(b => b._render && b._render());
    ICP_CHECK_GROUPS.forEach(id => {
      const vals = new Set((snap.checks && snap.checks[id]) || []);
      $$('#' + id + ' input[type=checkbox]').forEach(cb => { cb.checked = vals.has(cb.value); });
    });
    ICP_FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !snap.fields || !(id in snap.fields)) return;
      if (el.type === 'checkbox') el.checked = !!snap.fields[id];
      else el.value = snap.fields[id];
    });
  }

  function loadPresets() {
    try { return JSON.parse(localStorage.getItem(ICP_PRESETS_KEY) || '[]'); } catch { return []; }
  }
  function savePresetsList(list) { localStorage.setItem(ICP_PRESETS_KEY, JSON.stringify(list)); }

  function refreshPresetSelect() {
    const sel = $('#icp-preset-select');
    const current = sel.value;
    const list = loadPresets();
    sel.innerHTML = '<option value="">— Load a preset —</option>' +
      list.map((p, i) => '<option value="' + i + '">' + esc(p.name) + '</option>').join('');
    if (list[Number(current)]) sel.value = current;
  }

  function wirePresets() {
    refreshPresetSelect();
    $('#btn-preset-save').onclick = () => {
      const name = $('#icp-preset-name').value.trim();
      if (!name) return toast('Type a name for this ICP first.');
      const list = loadPresets();
      const snap = capturePreset();
      const idx = list.findIndex(p => p.name === name);
      const entry = { name, snap, saved_at: new Date().toISOString().slice(0, 10) };
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      savePresetsList(list);
      refreshPresetSelect();
      $('#icp-preset-select').value = String(list.indexOf(entry) >= 0 ? list.indexOf(entry) : list.length - 1);
      $('#icp-preset-name').value = '';
      toast('Saved ICP preset "' + name + '".');
    };
    $('#btn-preset-load').onclick = () => {
      const idx = $('#icp-preset-select').value;
      if (idx === '') return toast('Pick a preset to load first.');
      const list = loadPresets();
      const p = list[Number(idx)];
      if (!p) return toast('Preset not found.');
      applyPreset(p.snap);
      toast('Loaded ICP preset "' + p.name + '".');
    };
    $('#btn-preset-delete').onclick = () => {
      const idx = $('#icp-preset-select').value;
      if (idx === '') return toast('Pick a preset to delete first.');
      const list = loadPresets();
      const removed = list.splice(Number(idx), 1);
      savePresetsList(list);
      refreshPresetSelect();
      if (removed[0]) toast('Deleted preset "' + removed[0].name + '".');
    };
  }

  // ── do-not-contact list modal ──────────────────────────────────────
  function splitDncInput(text) {
    return String(text || '').split(/[,;\n\t]+/).map(s => s.trim()).filter(Boolean);
  }

  async function renderDnc() {
    const client = currentClient();
    $('#dnc-client-label').textContent = client ? 'Managing the list for: ' + client : 'Pick a client first — the DNC list is per client.';
    $('#dnc-add').disabled = !client;
    if (!client) {
      $('#dnc-emails').innerHTML = '<div class="empty small">No client selected.</div>';
      $('#dnc-domains').innerHTML = '<div class="empty small">No client selected.</div>';
      $('#dnc-summary').textContent = '';
      return;
    }
    let dnc;
    try { dnc = await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc'); }
    catch (err) { toast('Could not load DNC list: ' + err.message); return; }

    const renderCol = (elId, items, kind) => {
      const el = $('#' + elId);
      if (!items.length) { el.innerHTML = '<div class="empty small">None yet.</div>'; return; }
      el.innerHTML = items.map(v =>
        '<div class="dnc-row"><span>' + esc(v) + '</span><button class="dnc-remove" data-kind="' + kind + '" data-val="' + esc(v) + '" title="Remove">×</button></div>'
      ).join('');
      el.querySelectorAll('.dnc-remove').forEach(btn => btn.onclick = async () => {
        try {
          await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc/remove', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [btn.dataset.kind]: btn.dataset.val }),
          });
          renderDnc();
          loadClientList();
        } catch (err) { toast('Remove failed: ' + err.message); }
      });
    };
    renderCol('dnc-emails', dnc.emails, 'email');
    renderCol('dnc-domains', dnc.domains, 'domain');
    $('#dnc-summary').textContent = fmt(dnc.emails.length) + ' emails · ' + fmt(dnc.domains.length) + ' domains blocked';
  }

  function openDncModal() {
    $('#dnc-modal').classList.remove('hidden');
    $('#dnc-input').value = '';
    renderDnc();
  }

  function wireDnc() {
    $('#btn-dnc').onclick = openDncModal;
    $('#dnc-close').onclick = () => $('#dnc-modal').classList.add('hidden');
    $('#dnc-add').onclick = async () => {
      const client = currentClient();
      if (!client) return toast('Pick a client first.');
      const tokens = splitDncInput($('#dnc-input').value);
      if (!tokens.length) return toast('Paste at least one email or domain.');
      const emails = tokens.filter(t => t.includes('@'));
      const domains = tokens.filter(t => !t.includes('@'));
      try {
        await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails, domains }),
        });
        $('#dnc-input').value = '';
        renderDnc();
        loadClientList();
        toast('Added to the DNC list for ' + client + '.');
      } catch (err) { toast('Add failed: ' + err.message); }
    };
    $('#dnc-clear').onclick = async () => {
      const client = currentClient();
      if (!client) return toast('Pick a client first.');
      if (!confirm('Clear the entire do-not-contact list for ' + client + '? This cannot be undone.')) return;
      try {
        await appFetch('/app/clients/' + encodeURIComponent(client) + '/dnc/clear', { method: 'POST' });
        renderDnc();
        loadClientList();
        toast('DNC list cleared for ' + client + '.');
      } catch (err) { toast('Clear failed: ' + err.message); }
    };
  }

  function csvRow(r) {
    const o = {};
    PEOPLE_CSV_COLS.forEach(k => { o[k] = r[k]; });
    return o;
  }
  function csvName(kind) {
    const d = new Date().toISOString().slice(0, 10);
    return 'blitz-' + kind + '-' + d + '.csv';
  }

  // Batch enrichment with live progress; the limiter keeps us under 5 req/s.
  async function enrichRows(rows, kind, prog, onTick) {
    const targets = rows.filter(r => r.linkedin_url && !r[kind] && r[kind + '_status'] !== 'not_found');
    if (!targets.length) return;
    let done = 0;
    prog.show('Enriching ' + kind + 's 0 / ' + targets.length);
    await Promise.all(targets.map(async (r) => {
      try {
        if (kind === 'email') {
          const res = await Api.findEmail(r.linkedin_url);
          if (res.found && res.email) { r.email = res.email; r.email_status = 'verified'; }
          else r.email_status = 'not_found';
        } else {
          const res = await Api.findPhone(r.linkedin_url);
          if (res.found && res.phone) { r.phone = res.phone; r.phone_status = 'found'; }
          else r.phone_status = 'not_found';
        }
      } catch (err) {
        r[kind + '_status'] = 'not_found';
      }
      done++;
      prog.set(done, targets.length, 'Enriching ' + kind + 's ' + done + ' / ' + targets.length);
      if (done % 5 === 0 && onTick) onTick();
    }));
    if (onTick) onTick();
  }

  // Looks up industry + exact employee count for every unique company
  // referenced by these rows, via the server's cached /app/companies/enrich
  // route (shared cache with the Pull-leads job engine — never re-bought).
  async function enrichCompanies(rows, prog, onTick) {
    const targets = rows.filter(r => r.company_linkedin_url && !r.industry && r.company_size_exact === '');
    const uniqueUrls = Array.from(new Set(targets.map(r => r.company_linkedin_url)));
    if (!uniqueUrls.length) return;
    if (prog) prog.show('Looking up ' + fmt(uniqueUrls.length) + ' companies (industry + size)…');
    try {
      const map = await appFetch('/app/companies/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': Api.getKey() },
        body: JSON.stringify({ urls: uniqueUrls }),
      });
      for (const r of rows) {
        const c = r.company_linkedin_url && map[r.company_linkedin_url];
        if (c) {
          r.industry = c.industry || '';
          r.company_size_exact = (c.company_size_exact !== '' && c.company_size_exact != null) ? c.company_size_exact : '';
        }
      }
    } catch (err) {
      toast('Company lookup failed: ' + err.message);
    }
    if (onTick) onTick();
  }

  // ══════════════════════════════════════════════════════════ COMPANIES TAB
  const companyState = { rows: [], cursor: null, total: 0, seen: new Set(), busy: false };
  const COMPANY_CSV_COLS = [
    'name', 'domain', 'website', 'industry', 'size', 'employees_on_linkedin', 'type',
    'founded_year', 'followers', 'hq_city', 'hq_state', 'hq_country', 'linkedin_url', 'specialties', 'about',
  ];

  function renderCompanyTable(rows) {
    const t = $('#companies-table');
    if (!rows.length) {
      t.innerHTML = '<tbody><tr><td class="empty">No results yet.</td></tr></tbody>';
      return;
    }
    const cols = ['Company', 'Industry', 'Size', 'Type', 'HQ', 'Founded', 'Followers', 'LinkedIn'];
    const head = '<thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead>';
    const body = rows.map(r =>
      '<tr>' +
      '<td title="' + esc(r.about) + '"><strong>' + esc(r.name) + '</strong>' + (r.domain ? ' <span class="muted">· ' + esc(r.domain) + '</span>' : '') + '</td>' +
      '<td>' + esc(r.industry) + '</td>' +
      '<td>' + esc(r.size) + (r.employees_on_linkedin !== '' ? ' <span class="muted">(' + fmt(r.employees_on_linkedin) + ' on LI)</span>' : '') + '</td>' +
      '<td>' + esc(r.type) + '</td>' +
      '<td>' + esc([r.hq_city, r.hq_country].filter(Boolean).join(', ')) + '</td>' +
      '<td>' + esc(r.founded_year) + '</td>' +
      '<td>' + (r.followers !== '' ? fmt(r.followers) : '') + '</td>' +
      '<td>' + (r.linkedin_url ? '<a href="' + esc(r.linkedin_url) + '" target="_blank" rel="noopener">page ↗</a>' : '') + '</td>' +
      '</tr>'
    ).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function updateCompanyMeta() {
    $('#companies-meta').innerHTML =
      '<strong>' + fmt(companyState.rows.length) + '</strong> companies loaded' +
      (companyState.total ? ' of <strong>' + fmt(companyState.total) + '</strong> matching' : '');
    $('#btn-companies-csv').disabled = !companyState.rows.length;
    $('#btn-companies-more').disabled = !companyState.cursor;
    $('#btn-companies-to-waterfall').disabled = !companyState.rows.length;
  }

  async function searchCompanies(fresh) {
    if (companyState.busy) return;
    companyState.busy = true;
    try {
      if (fresh) { companyState.rows = []; companyState.cursor = null; companyState.seen = new Set(); }
      $('#companies-meta').textContent = 'Searching…';
      const res = await Api.searchCompanies(buildCompaniesQuery(25, companyState.cursor));
      companyState.total = res.total_results || 0;
      companyState.cursor = res.cursor || null;
      for (const c of res.results || []) {
        const key = c.linkedin_url || c.domain || JSON.stringify(c);
        if (companyState.seen.has(key)) continue;
        companyState.seen.add(key);
        companyState.rows.push(Api.companyToRow(c));
      }
      renderCompanyTable(companyState.rows);
      updateCompanyMeta();
    } catch (err) {
      toast('Search failed: ' + err.message);
      updateCompanyMeta();
    } finally { companyState.busy = false; }
  }

  async function pullCompanies() {
    if (companyState.busy) return;
    const goal = Math.max(1, Math.min(5000, num('c_pull_count') || 100));
    const prog = progress('companies');
    companyState.busy = true;
    companyState.rows = []; companyState.cursor = null; companyState.seen = new Set();
    try {
      prog.show('Collecting companies…');
      let emptyPages = 0;
      while (companyState.rows.length < goal) {
        const res = await Api.searchCompanies(buildCompaniesQuery(Math.min(50, goal - companyState.rows.length + 5), companyState.cursor));
        companyState.total = res.total_results || 0;
        const before = companyState.rows.length;
        for (const c of res.results || []) {
          const key = c.linkedin_url || c.domain || JSON.stringify(c);
          if (companyState.seen.has(key)) continue;
          companyState.seen.add(key);
          companyState.rows.push(Api.companyToRow(c));
        }
        companyState.cursor = res.cursor || null;
        prog.set(Math.min(companyState.rows.length, goal), goal, 'Collecting ' + Math.min(companyState.rows.length, goal) + ' / ' + goal);
        if (!companyState.cursor) break;
        if (companyState.rows.length === before && ++emptyPages >= 3) break;
      }
      companyState.rows = companyState.rows.slice(0, goal);
      renderCompanyTable(companyState.rows);
      updateCompanyMeta();
      prog.hide();
      if (companyState.rows.length) {
        Api.downloadCSV(companyState.rows, COMPANY_CSV_COLS, csvName('companies'));
        toast('Done — ' + fmt(companyState.rows.length) + ' companies exported to CSV.');
      } else toast('No companies matched those filters.');
    } catch (err) {
      prog.hide();
      toast('Pull failed: ' + err.message, 5000);
    } finally { companyState.busy = false; }
  }

  // ══════════════════════════════════════════════════════════ EMPLOYEES TAB
  const empState = { rows: [], page: 1, totalPages: 0, busy: false, dnc: { domains: new Set(), emails: new Set() }, blockedEmail: 0 };

  function buildEmployeeQuery(page) {
    return prune({
      company_linkedin_url: $('#e_company_url').value.trim(),
      job_level: checkedVals('e_levels'),
      job_function: checkedVals('e_functions'),
      country_code: chipVals('e_countries'),
      sales_region: checkedVals('e_regions'),
      min_connections_count: num('e_min_connections'),
      max_results: 50,
      page: page,
    });
  }

  function updateEmpMeta() {
    $('#employees-meta').innerHTML =
      '<strong>' + fmt(empState.rows.length) + '</strong> employees loaded' +
      (empState.totalPages ? ' · page <strong>' + empState.page + '</strong> of <strong>' + fmt(empState.totalPages) + '</strong>' : '') +
      (empState.blockedEmail ? ' · <strong>' + fmt(empState.blockedEmail) + '</strong> blocked (DNC)' : '');
    const has = empState.rows.length > 0;
    $('#btn-employees-csv').disabled = !has;
    $('#btn-employees-enrich-email').disabled = !has;
    $('#btn-employees-enrich-company').disabled = !has;
    $('#btn-employees-more').disabled = !(empState.totalPages && empState.page < empState.totalPages);
  }

  async function searchEmployees(nextPage) {
    if (empState.busy) return;
    const url = $('#e_company_url').value.trim();
    if (!url) return toast('Enter a company LinkedIn URL first (or resolve one from a domain).');
    empState.busy = true;
    try {
      if (!nextPage) {
        empState.rows = []; empState.page = 1; empState.blockedEmail = 0;
        empState.dnc = await loadDncLists(currentClient());
        if (empState.dnc.domains.size) {
          $('#employees-meta').textContent = 'Checking do-not-contact list…';
          try {
            const map = await appFetch('/app/companies/enrich', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': Api.getKey() },
              body: JSON.stringify({ urls: [url] }),
            });
            const domain = map[url] && map[url].domain;
            if (domain && empState.dnc.domains.has(domain)) {
              renderPeopleTable('employees-table', []);
              empState.busy = false;
              updateEmpMeta(); // reset buttons for zero rows first — then overwrite the message it just set
              $('#employees-meta').textContent = 'This company (' + domain + ') is on the do-not-contact list for ' + currentClient() + ' — search blocked.';
              return;
            }
          } catch (err) { /* if the DNC pre-check itself fails, don't block the search over it */ }
        }
      } else empState.page++;
      $('#employees-meta').textContent = 'Loading page ' + empState.page + '…';
      const res = await Api.employeeFinder(buildEmployeeQuery(empState.page));
      empState.totalPages = res.total_pages || 0;
      for (const p of res.results || []) empState.rows.push(Api.personToRow(p));
      renderPeopleTable('employees-table', empState.rows);
      updateEmpMeta();
    } catch (err) {
      toast('Lookup failed: ' + err.message);
      updateEmpMeta();
    } finally { empState.busy = false; }
  }

  // ══════════════════════════════════════════════════════════ WATERFALL TAB
  const wfState = { rows: [], busy: false };
  let tierCount = 0;

  function addTier(includeVal) {
    tierCount++;
    const wrap = document.createElement('div');
    wrap.className = 'tier';
    wrap.innerHTML =
      '<div class="tier-head"><span>Tier ' + tierCount + '</span><b title="Remove tier">×</b></div>' +
      '<label class="lbl">Titles to match <span class="hint">comma-separated · [Exact] for exact</span></label>' +
      '<input type="text" class="txt tier-include" placeholder="e.g. CMO, VP Marketing, Head of Growth" value="' + esc(includeVal || '') + '">' +
      '<label class="lbl">Titles to exclude</label>' +
      '<input type="text" class="txt tier-exclude" placeholder="e.g. assistant, intern">' +
      '<label class="check"><input type="checkbox" class="tier-headline"> Search headline too</label>';
    wrap.querySelector('.tier-head b').onclick = () => wrap.remove();
    $('#w_cascade').appendChild(wrap);
  }

  function readCascade() {
    return $$('#w_cascade .tier').map(t => {
      const inc = t.querySelector('.tier-include').value.split(',').map(s => s.trim()).filter(Boolean);
      const exc = t.querySelector('.tier-exclude').value.split(',').map(s => s.trim()).filter(Boolean);
      if (!inc.length) return null;
      const tier = { include_title: inc };
      if (exc.length) tier.exclude_title = exc;
      if (t.querySelector('.tier-headline').checked) tier.include_headline_search = true;
      return tier;
    }).filter(Boolean);
  }

  async function runWaterfall() {
    if (wfState.busy) return;
    let companies = chipVals('w_companies');
    const cascade = readCascade();
    if (!companies.length) return toast('Add at least one company LinkedIn URL.');
    if (!cascade.length) return toast('Add at least one cascade tier with titles.');
    const maxPer = Math.max(1, Math.min(10, num('w_max') || 1));
    const prog = progress('waterfall');
    wfState.busy = true;
    wfState.rows = [];
    let done = 0;
    let blockedCompanies = 0;
    let blockedEmails = 0;
    let blockedStaleTitle = 0;
    const enforceCurrentRole = $('#w_enforce_current').checked;
    try {
      const dnc = await loadDncLists(currentClient());

      // Check every target's domain against the DNC list BEFORE spending a
      // single waterfall credit on it — pre-emptive, not a post-hoc filter.
      if (dnc.domains.size) {
        prog.show('Checking do-not-contact list for ' + fmt(companies.length) + ' companies…');
        try {
          const map = await appFetch('/app/companies/enrich', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': Api.getKey() },
            body: JSON.stringify({ urls: companies }),
          });
          const allowed = companies.filter(url => {
            const domain = map[url] && map[url].domain;
            const blocked = domain && dnc.domains.has(domain);
            if (blocked) blockedCompanies++;
            return !blocked;
          });
          companies = allowed;
        } catch (err) { /* if the pre-check itself fails, don't block the whole run over it */ }
        if (blockedCompanies) toast(fmt(blockedCompanies) + ' compan' + (blockedCompanies === 1 ? 'y is' : 'ies are') + ' on the do-not-contact list and will be skipped.', 5000);
        if (!companies.length) {
          prog.hide();
          $('#waterfall-meta').textContent = 'All target companies are on the do-not-contact list for ' + currentClient() + ' — nothing to run.';
          wfState.busy = false;
          return;
        }
      }

      prog.show('Running waterfall 0 / ' + companies.length);
      await Promise.all(companies.map(async (url) => {
        try {
          const res = await Api.waterfallIcp({ company_linkedin_url: url, cascade, max_results: maxPer });
          for (const hit of res.results || []) {
            if (!hit.person) continue;
            const row = Api.personToRow(hit.person);
            row.icp_tier = hit.icp;
            row.ranking = hit.ranking;
            row.target_company_url = url;
            if (!row.company_linkedin_url) row.company_linkedin_url = url;
            // Verify against the current title/headline, not whatever role in
            // their history Blitz's cascade actually matched on. Checked
            // against every tier's own criteria (not just the tier Blitz
            // reports) since any tier's definition still counts as "current
            // and qualified" for this ICP.
            const verified = cascade.some(tier =>
              titleMatchesCurrentRole(tier.include_title, row.job_title, row.headline, !!tier.include_headline_search)
            );
            row.title_match = verified ? 'current' : 'past';
            if (!verified && enforceCurrentRole) {
              blockedStaleTitle++;
              wfState.rows.push({
                full_name: '(stale title — filtered)', job_title: row.job_title, title_match: 'past', company: row.company, email: '', phone: '',
                city: '', state: '', country: '', linkedin_url: '', connections: '',
                icp_tier: hit.icp, ranking: hit.ranking, target_company_url: url,
              });
              continue;
            }
            wfState.rows.push(row);
          }
        } catch (err) {
          wfState.rows.push({
            full_name: '(no match)', job_title: '', company: '', email: '', phone: '',
            city: '', state: '', country: '', linkedin_url: '', connections: '',
            icp_tier: '', ranking: '', target_company_url: url, error: err.message,
          });
        }
        done++;
        prog.set(done, companies.length, 'Running waterfall ' + done + ' / ' + companies.length);
      }));

      if ($('#w_auto_company').checked) {
        await enrichCompanies(wfState.rows, prog, renderWaterfall);
      }
      if ($('#w_auto_email').checked) {
        await enrichRows(wfState.rows, 'email', prog, renderWaterfall);
        const freshDnc = await loadDncLists(currentClient()); // re-check in case the list changed mid-run
        blockedEmails = applyEmailDncClient(wfState.rows, freshDnc.emails);
        if (blockedEmails) toast(fmt(blockedEmails) + ' removed — email is on the do-not-contact list.');
      }
      renderWaterfall();
      prog.hide();
      $('#waterfall-meta').innerHTML = '<strong>' + fmt(wfState.rows.filter(r => r.linkedin_url).length) + '</strong> decision-makers found across <strong>' + companies.length + '</strong> companies' +
        (blockedCompanies ? ' · <strong>' + fmt(blockedCompanies) + '</strong> companies blocked (DNC)' : '') +
        (blockedEmails ? ' · <strong>' + fmt(blockedEmails) + '</strong> emails blocked (DNC)' : '') +
        (blockedStaleTitle ? ' · <strong>' + fmt(blockedStaleTitle) + '</strong> dropped (past role)' : '');
      $('#btn-waterfall-csv').disabled = !wfState.rows.length;
    } catch (err) {
      prog.hide();
      toast('Waterfall failed: ' + err.message, 5000);
    } finally { wfState.busy = false; }
  }

  function renderWaterfall() {
    const t = $('#waterfall-table');
    if (!wfState.rows.length) {
      t.innerHTML = '<tbody><tr><td class="empty">No results yet.</td></tr></tbody>';
      return;
    }
    const cols = ['Tier', 'Name', 'Title', 'Company', 'Email', 'Location', 'LinkedIn', 'Target company'];
    const head = '<thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead>';
    const body = wfState.rows.map(r =>
      '<tr>' +
      '<td>' + (r.icp_tier !== '' ? '<span class="pill pending">T' + esc(r.icp_tier) + '</span>' : '<span class="pill miss">×</span>') + '</td>' +
      '<td><strong>' + esc(r.full_name) + '</strong></td>' +
      '<td>' + esc(r.job_title) + '</td>' +
      '<td>' + esc(r.company) + '</td>' +
      '<td>' + (r.email ? esc(r.email) + ' <span class="pill ok">✓</span>' : (r.email_status === 'not_found' ? '<span class="pill miss">not found</span>' : '<span class="muted">—</span>')) + '</td>' +
      '<td>' + esc(personLocation(r)) + '</td>' +
      '<td>' + (r.linkedin_url ? '<a href="' + esc(r.linkedin_url) + '" target="_blank" rel="noopener">profile ↗</a>' : '') + '</td>' +
      '<td class="muted">' + esc((r.target_company_url || '').replace('https://www.linkedin.com/company/', '')) + '</td>' +
      '</tr>'
    ).join('');
    t.innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  // ══════════════════════════════════════════════════════════ LOOKUPS TAB
  const lookups = {
    'email': async () => Api.findEmail($('#l_email_url').value.trim()),
    'phone': async () => Api.findPhone($('#l_phone_url').value.trim()),
    'rev-email': async () => Api.emailToPerson($('#l_rev_email').value.trim()),
    'rev-phone': async () => Api.phoneToPerson($('#l_rev_phone').value.trim()),
    'company': async () => Api.enrichCompany($('#l_company_url').value.trim()),
    'domain-to-li': async () => Api.domainToLinkedin($('#l_domain').value.trim()),
    'li-to-domain': async () => Api.linkedinToDomain($('#l_li_url').value.trim()),
    'dist-country': async () => Api.distByCountry($('#l_dist_country').value.trim()),
    'dist-dept': async () => Api.distByDepartment($('#l_dist_dept').value.trim()),
  };
  const lookupOut = {
    'email': 'out-email', 'phone': 'out-phone', 'rev-email': 'out-rev-email',
    'rev-phone': 'out-rev-phone', 'company': 'out-company',
    'domain-to-li': 'out-domain', 'li-to-domain': 'out-domain',
    'dist-country': 'out-dist-country', 'dist-dept': 'out-dist-dept',
  };

  // ══════════════════════════════════════════════════════════ API KEY / BOOT
  async function refreshAccount() {
    const badge = $('#credits-badge');
    if (!Api.getKey()) {
      badge.classList.add('hidden');
      $('#btn-key').textContent = 'Connect API key';
      return false;
    }
    try {
      const info = await Api.keyInfo();
      const credits = info.remaining_credits === 'unlimited' ? '∞' : fmt(info.remaining_credits);
      const plan = (info.active_plans && info.active_plans[0] && info.active_plans[0].name) || 'connected';
      badge.textContent = plan + ' · ' + credits + ' credits';
      badge.classList.remove('hidden');
      $('#btn-key').textContent = 'API key ✓';
      return true;
    } catch (err) {
      badge.classList.add('hidden');
      $('#btn-key').textContent = 'Connect API key';
      return false;
    }
  }

  function openKeyModal() {
    $('#key-modal').classList.remove('hidden');
    $('#key-input').value = Api.getKey();
    $('#key-status').textContent = '';
    $('#key-status').className = 'key-status';
    $('#key-input').focus();
  }

  async function saveKey() {
    const v = $('#key-input').value.trim();
    const status = $('#key-status');
    if (!v) { status.textContent = 'Enter a key.'; status.className = 'key-status err'; return; }
    Api.setKey(v);
    status.textContent = 'Verifying…';
    status.className = 'key-status';
    try {
      const info = await Api.keyInfo();
      if (info.valid === false) throw new Error('Key rejected');
      status.textContent = '✓ Connected — plan: ' + ((info.active_plans && info.active_plans[0] && info.active_plans[0].name) || 'active') +
        ', rate limit ' + (info.max_requests_per_seconds || '?') + ' req/s';
      status.className = 'key-status ok';
      await refreshAccount();
      setTimeout(() => $('#key-modal').classList.add('hidden'), 900);
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'key-status err';
    }
  }

  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
    if (name === 'pulls') renderJobs();
  }

  // Sends every company currently loaded in the Companies tab to Waterfall
  // ICP as target accounts (merged with whatever's already there), so a
  // firmographic search becomes an account-based decision-maker search in
  // one click instead of copying LinkedIn URLs by hand.
  function sendCompaniesToWaterfall() {
    const urls = Array.from(new Set(companyState.rows.map(r => r.linkedin_url).filter(Boolean)));
    if (!urls.length) return toast('No companies with a LinkedIn URL to send.');
    if (urls.length > 300) {
      const ok = confirm(
        'This will run the Waterfall search on ' + fmt(urls.length) + ' companies — that\'s a lot of API calls, ' +
        'could take a while, and uses real credits (roughly 1+ credit per company). Continue?'
      );
      if (!ok) return;
    }
    const before = chipVals('w_companies').length;
    urls.forEach(u => { if (!chips['w_companies'].includes(u)) chips['w_companies'].push(u); });
    $$('.chips-input[data-chips="w_companies"]').forEach(b => b._render && b._render());
    const added = chipVals('w_companies').length - before;
    switchTab('waterfall');
    toast(
      'Sent ' + fmt(added) + ' new compan' + (added === 1 ? 'y' : 'ies') + ' to Waterfall ICP (' +
      fmt(chipVals('w_companies').length) + ' total target' + (chipVals('w_companies').length === 1 ? '' : 's') +
      ') — set your title cascade and click Run waterfall.', 6000
    );
  }

  // ══════════════════════════════════════════════════════════ WIRING
  function boot() {
    initChips();

    // checkbox groups
    buildChecks('p_levels', D.jobLevels);
    buildChecks('p_functions', D.jobFunctions, true);
    buildChecks('p_regions', D.salesRegions);
    buildChecks('p_continents', D.continents);
    buildChecks('pc_ranges', D.employeeRanges);
    buildChecks('pc_types', D.companyTypes);
    buildChecks('pc_regions', D.salesRegions);
    buildChecks('c_ranges', D.employeeRanges);
    buildChecks('c_types', D.companyTypes);
    buildChecks('c_regions', D.salesRegions);
    buildChecks('c_continents', D.continents);
    buildChecks('e_levels', D.jobLevels);
    buildChecks('e_functions', D.jobFunctions, true);
    buildChecks('e_regions', D.salesRegions);

    // tabs
    $('#tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    // clear-all buttons
    $$('[data-clear]').forEach(b => b.addEventListener('click', () => {
      const scope = b.dataset.clear;
      const prefixes = { people: ['p_', 'pc_'], companies: ['c_'], employees: ['e_'], waterfall: ['w_'] }[scope] || [];
      prefixes.forEach(clearChips);
      clearChecks('#pane-' + scope);
      if (scope === 'waterfall') { $('#w_cascade').innerHTML = ''; tierCount = 0; addTier(); }
      toast('Filters cleared.');
    }));

    // people
    $('#btn-search-people').onclick = () => searchPeople(true);
    $('#btn-people-more').onclick = () => searchPeople(false);
    $('#btn-pull-leads').onclick = pullLeads;
    $('#btn-tam-people').onclick = () => checkTam('people');
    $('#btn-tam-companies').onclick = () => checkTam('companies');
    $('#btn-title-impact').onclick = estimateTitleImpact;
    $('#client-select').addEventListener('change', onClientChange);
    $('#btn-pulls-refresh').onclick = renderJobs;
    loadClientList();
    renderJobs();
    wirePresets();
    wireDnc();
    // background poll keeps the Pulls tab + running-dot fresh
    setInterval(() => {
      const pullsActive = $('#pane-pulls').classList.contains('active');
      const running = !$('#pulls-dot').classList.contains('hidden');
      if (pullsActive || running) renderJobs();
    }, 4000);
    $('#btn-people-csv').onclick = () => Api.downloadCSV(peopleState.rows.map(csvRow), PEOPLE_CSV_COLS, csvName('leads'));
    $('#btn-people-enrich-email').onclick = async () => {
      const prog = progress('people');
      await enrichRows(peopleState.rows, 'email', prog, () => renderPeopleTable('people-table', peopleState.rows));
      prog.hide(); updatePeopleMeta(); refreshAccount();
    };
    $('#btn-people-enrich-phone').onclick = async () => {
      const prog = progress('people');
      await enrichRows(peopleState.rows, 'phone', prog, () => renderPeopleTable('people-table', peopleState.rows));
      prog.hide(); updatePeopleMeta(); refreshAccount();
    };
    $('#btn-people-enrich-company').onclick = async () => {
      const prog = progress('people');
      await enrichCompanies(peopleState.rows, prog, () => renderPeopleTable('people-table', peopleState.rows));
      prog.hide(); updatePeopleMeta(); refreshAccount();
    };

    // companies
    $('#btn-search-companies').onclick = () => searchCompanies(true);
    $('#btn-companies-more').onclick = () => searchCompanies(false);
    $('#btn-pull-companies').onclick = pullCompanies;
    $('#btn-companies-csv').onclick = () => Api.downloadCSV(companyState.rows, COMPANY_CSV_COLS, csvName('companies'));
    $('#btn-companies-to-waterfall').onclick = sendCompaniesToWaterfall;

    // employees
    $('#btn-search-employees').onclick = () => searchEmployees(false);
    $('#btn-employees-more').onclick = () => searchEmployees(true);
    $('#btn-employees-csv').onclick = () => Api.downloadCSV(empState.rows.map(csvRow), PEOPLE_CSV_COLS, csvName('employees'));
    $('#btn-employees-enrich-email').onclick = async () => {
      const prog = progress('employees');
      await enrichRows(empState.rows, 'email', prog, () => renderPeopleTable('employees-table', empState.rows));
      // re-fetch DNC fresh here rather than trusting state captured back at search time —
      // the list may have changed since (including because of what just got enriched)
      const dnc = await loadDncLists(currentClient());
      const removed = applyEmailDncClient(empState.rows, dnc.emails);
      if (removed) { empState.blockedEmail += removed; toast(fmt(removed) + ' removed — email is on the do-not-contact list.'); }
      renderPeopleTable('employees-table', empState.rows);
      prog.hide(); updateEmpMeta(); refreshAccount();
    };
    $('#btn-employees-enrich-company').onclick = async () => {
      const prog = progress('employees');
      await enrichCompanies(empState.rows, prog, () => renderPeopleTable('employees-table', empState.rows));
      prog.hide(); updateEmpMeta(); refreshAccount();
    };
    $('#btn-resolve-domain').onclick = async () => {
      const d = $('#e_domain').value.trim();
      if (!d) return toast('Type a domain first.');
      try {
        const res = await Api.domainToLinkedin(d);
        if (res.found && res.company_linkedin_url) {
          $('#e_company_url').value = res.company_linkedin_url;
          toast('Resolved: ' + res.company_linkedin_url);
        } else toast('No LinkedIn page found for ' + d);
      } catch (err) { toast('Resolve failed: ' + err.message); }
    };

    // waterfall
    addTier('Chief Marketing Officer, VP Marketing, Head of Marketing');
    addTier('Marketing Director, Growth Lead');
    addTier('CEO, Founder, Co-Founder, Owner');
    $('#btn-add-tier').onclick = () => addTier();
    $('#btn-run-waterfall').onclick = runWaterfall;
    $('#btn-waterfall-csv').onclick = () => {
      const cols = ['icp_tier', 'ranking', 'target_company_url'].concat(PEOPLE_CSV_COLS);
      Api.downloadCSV(wfState.rows.map(r => {
        const o = { icp_tier: r.icp_tier, ranking: r.ranking, target_company_url: r.target_company_url };
        PEOPLE_CSV_COLS.forEach(k => { o[k] = r[k] || ''; });
        return o;
      }), cols, csvName('waterfall'));
    };

    // lookups
    $$('[data-lookup]').forEach(btn => btn.addEventListener('click', async () => {
      const kind = btn.dataset.lookup;
      const out = $('#' + lookupOut[kind]);
      out.textContent = 'Loading…';
      try {
        const res = await lookups[kind]();
        out.textContent = JSON.stringify(res, null, 2);
        refreshAccount();
      } catch (err) {
        out.textContent = '✗ ' + err.message;
      }
    }));

    // key modal
    $('#btn-key').onclick = openKeyModal;
    $('#key-cancel').onclick = () => $('#key-modal').classList.add('hidden');
    $('#key-save').onclick = saveKey;
    $('#key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKey(); });

    renderPeopleTable('people-table', []);
    renderCompanyTable([]);
    renderPeopleTable('employees-table', []);
    renderWaterfall();

    refreshAccount().then(ok => { if (!ok) openKeyModal(); });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
