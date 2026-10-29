"""Turn a plain-English description of a target customer into ICP filters using a local Ollama model."""
import json
import re
import httpx
from .config import settings
from .providers import BLITZ_JOB_FUNCTIONS, BLITZ_JOB_LEVELS, resolve_blitz_industry

EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]
SALES_REGIONS = ["NORAM", "LATAM", "EMEA", "APAC"]
CONTINENTS = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"]
COMPANY_TYPES = ["Privately Held", "Public Company", "Nonprofit", "Partnership", "Self-Employed",
                 "Government Agency", "Educational"]

_STRINGS = {"type": "array", "items": {"type": "string"}}
SCHEMA = {
    "type": "object",
    "properties": {
        "job_titles_include": _STRINGS,
        "job_titles_exclude": _STRINGS,
        "job_levels": _STRINGS,
        "job_functions": _STRINGS,
        "person_countries": _STRINGS,
        "person_cities": _STRINGS,
        "person_regions": _STRINGS,
        "person_continents": _STRINGS,
        "company_employee_ranges": _STRINGS,
        "company_emp_min": {"type": ["integer", "null"]},
        "company_emp_max": {"type": ["integer", "null"]},
        "company_industries_include": _STRINGS,
        "company_industries_exclude": _STRINGS,
        "company_keywords_include": _STRINGS,
        "company_hq_countries": _STRINGS,
        "company_types": _STRINGS,
        "goal": {"type": ["integer", "null"]},
    },
}

SYSTEM = f"""You convert a description of an ideal customer into search filters. Reply with JSON only.
Only fill fields the description clearly implies; leave the rest as empty arrays or null.
- job_titles_include: concrete job titles, singular (e.g. "CTO", "VP Sales").
- job_levels: any of {BLITZ_JOB_LEVELS}.
- job_functions: any of {BLITZ_JOB_FUNCTIONS}.
- person_countries / company_hq_countries: ISO 3166-1 alpha-2 codes (e.g. "DE", "GB", "US").
- person_regions: any of {SALES_REGIONS}. person_continents: any of {CONTINENTS}.
- company_employee_ranges: any of {EMPLOYEE_RANGES}. Use company_emp_min/max for explicit headcounts.
- company_industries_include: plain industry names (e.g. "SaaS", "Fintech", "Cybersecurity").
- company_types: any of {COMPANY_TYPES}.
- goal: number of leads wanted, only if the user states one."""


class ParseError(Exception):
    pass


def _clean(values, allowed=None):
    out = []
    for v in values or []:
        if not isinstance(v, str) or not v.strip():
            continue
        v = v.strip()
        if allowed is not None:
            match = next((a for a in allowed if a.lower() == v.lower()), None)
            if not match:
                continue
            v = match
        if v not in out:
            out.append(v)
    return out


def _countries(values):
    return [c.upper() for c in _clean(values) if re.fullmatch(r"[A-Za-z]{2}", c)]


def _industries(values):
    resolved = [resolve_blitz_industry(v) or v for v in _clean(values)]
    return list(dict.fromkeys(resolved))


def _int(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else None


def sanitize(raw: dict) -> dict:
    filters = {
        "job_titles_include": _clean(raw.get("job_titles_include")),
        "job_titles_exclude": _clean(raw.get("job_titles_exclude")),
        "job_levels": _clean(raw.get("job_levels"), BLITZ_JOB_LEVELS),
        "job_functions": _clean(raw.get("job_functions"), BLITZ_JOB_FUNCTIONS),
        "person_countries": _countries(raw.get("person_countries")),
        "person_cities": _clean(raw.get("person_cities")),
        "person_regions": _clean(raw.get("person_regions"), SALES_REGIONS),
        "person_continents": _clean(raw.get("person_continents"), CONTINENTS),
        "company_employee_ranges": _clean(raw.get("company_employee_ranges"), EMPLOYEE_RANGES),
        "company_emp_min": _int(raw.get("company_emp_min")),
        "company_emp_max": _int(raw.get("company_emp_max")),
        "company_industries_include": _industries(raw.get("company_industries_include")),
        "company_industries_exclude": _industries(raw.get("company_industries_exclude")),
        "company_keywords_include": _clean(raw.get("company_keywords_include")),
        "company_hq_countries": _countries(raw.get("company_hq_countries")),
        "company_types": _clean(raw.get("company_types"), COMPANY_TYPES),
    }
    # Drop empties so untouched filters keep their current values in the UI.
    return {k: v for k, v in filters.items() if v not in ([], None)}


async def parse_icp(prompt: str) -> dict:
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "format": SCHEMA,
        "options": {"temperature": 0},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
    }
    try:
        headers = {"Authorization": f"Bearer {settings.ollama_api_key}"} if settings.ollama_api_key else {}
        async with httpx.AsyncClient(timeout=settings.ollama_timeout, headers=headers) as client:
            res = await client.post(f"{settings.ollama_base.rstrip('/')}/api/chat", json=payload)
            res.raise_for_status()
        raw = json.loads(res.json()["message"]["content"])
    except httpx.ConnectError:
        raise ParseError(f"Can't reach Ollama at {settings.ollama_base}. Is it running?")
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        hint = "Check OLLAMA_API_KEY." if code in (401, 403) else f"Is the model '{settings.ollama_model}' available?"
        raise ParseError(f"Ollama returned {code}. {hint}")
    except (httpx.HTTPError, KeyError, ValueError):
        raise ParseError("Ollama returned an unreadable response.")

    goal = _int(raw.get("goal"))
    return {"filters": sanitize(raw), "goal": goal or None}
