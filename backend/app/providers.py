import random
import json
import os
from typing import Protocol
import httpx
from .config import settings
from .icp import normalize_icp

_INDUSTRY_FILE = os.path.join(os.path.dirname(__file__), "blitz_industries.json")
try:
    with open(_INDUSTRY_FILE, "r", encoding="utf-8") as _f:
        BLITZ_INDUSTRIES = json.load(_f)
except Exception:
    BLITZ_INDUSTRIES = []

_BLITZ_IND_LOWER = {i.lower(): i for i in BLITZ_INDUSTRIES}
_BLITZ_IND_SET = set(BLITZ_INDUSTRIES)

COMMON_INDUSTRY_MAP = {
    "saas": "Software Development",
    "software": "Software Development",
    "fintech": "Financial Services",
    "finance": "Financial Services",
    "e-commerce": "Internet Marketplace Platforms",
    "ecommerce": "Internet Marketplace Platforms",
    "healthcare": "Hospitals and Health Care",
    "health": "Hospitals and Health Care",
    "logistics": "Logistics and Supply Chain",
    "agency": "Advertising Services",
    "marketing": "Advertising Services",
    "edtech": "E-Learning Providers",
    "education": "Higher Education",
    "cybersecurity": "Computer and Network Security",
    "security": "Computer and Network Security",
    "biotech": "Biotechnology Research",
    "real estate": "Real Estate",
    "manufacturing": "Manufacturing",
}

def resolve_blitz_industry(raw: str) -> str | None:
    if not raw:
        return None
    r = raw.strip()
    if r in _BLITZ_IND_SET:
        return r
    low = r.lower()
    if low in _BLITZ_IND_LOWER:
        return _BLITZ_IND_LOWER[low]
    if low in COMMON_INDUSTRY_MAP:
        return COMMON_INDUSTRY_MAP[low]
    # Check semicolon replacement for commas
    semi = r.replace(",", ";")
    if semi in _BLITZ_IND_SET:
        return semi
    if semi.lower() in _BLITZ_IND_LOWER:
        return _BLITZ_IND_LOWER[semi.lower()]
    # Substring match against verified BLITZ_INDUSTRIES
    for k, v in _BLITZ_IND_LOWER.items():
        if low in k:
            return v
    return None

class Person(dict):
    """Fixed person shape: all downstream code references these keys."""
    pass

class SearchProvider(Protocol):
    def count(self, icp: dict) -> int: ...
    def search(self, icp: dict, limit: int) -> list[Person]: ...

# ----------------- Mock: synthetic data, zero API keys -----------------

_FIRST = ["Alex","Sam","Robin","Jordan","Casey","Noor","Luca","Mila","Sara","Hugo"]
_LAST  = ["Nguyen","Patel","Garcia","Smith","Rossi","Okafor","Larsen","Cohen"]
_TITLES = ["CEO","Founder","CTO","Head of Marketing","VP Sales","Growth Lead",
           "Marketing Manager","Office Manager","Executive Assistant","Data Engineer"]
_SEN = {"CEO":"c_suite","Founder":"founder","CTO":"c_suite","VP Sales":"vp",
        "Head of Marketing":"head","Growth Lead":"manager","Marketing Manager":"manager",
        "Data Engineer":"ic","Office Manager":"manager","Executive Assistant":"ic"}
_IND = ["SaaS","E-commerce","Fintech","Healthcare","Logistics","Agency","Nonprofit"]
_CC  = ["NL","GB","DE","US","SE","BE","FR"]

def _person(r):
    fn, ln = r.choice(_FIRST), r.choice(_LAST)
    title = r.choice(_TITLES)
    company = r.choice(["Acme","Northwind","Globex","Vela","Lumen"]) + " " + \
              r.choice(["Labs","Digital","Group","Systems","Co"])
    dom = company.lower().replace(" ", "") + ".com"
    has_email = r.random() > 0.35
    return {"first_name":fn,"last_name":ln,"title":title,"seniority":_SEN.get(title,"ic"),
            "department":"Marketing" if "Market" in title else "Leadership",
            "company":company,"website":dom,"industry":r.choice(_IND),
            "employee_count":r.choice([8,25,60,120,300,800,2500]),
            "country":r.choice(_CC),"city":"",
            "email":(fn+"."+ln+"@"+dom).lower() if has_email else "",
            "linkedin_url":"https://linkedin.com/in/%s-%s" % (fn.lower(), ln.lower())}

class MockProvider:
    def count(self, icp):
        norm = normalize_icp(icp)
        base = 1200
        if norm.get("titles"):
            base = int(base / max(1, len(norm["titles"]) * 0.6))
        return max(12, base)

    def search(self, icp, limit):
        seed = hash(str(sorted([(str(k), str(v)) for k, v in icp.items()]))) & 0xFFFFFFFF
        r = random.Random(seed)
        return [_person(r) for _ in range(limit)]

# ----------------- Real Blitz API Provider -----------------

BLITZ_JOB_LEVELS = ["C-Team", "VP", "Director", "Manager", "Staff", "Other"]
BLITZ_JOB_FUNCTIONS = [
    "Advertising & Marketing", "Art, Culture and Creative Professionals",
    "Construction", "Customer/Client Service", "Education", "Engineering",
    "Finance & Accounting", "General Business & Management",
    "Healthcare & Human Services", "Human Resources", "Information Technology",
    "Legal", "Manufacturing & Production", "Operations", "Other",
    "Public Administration & Safety", "Purchasing", "Research & Development",
    "Sales & Business Development", "Science", "Supply Chain & Logistics",
    "Writing/Editing"
]
BLITZ_EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"]
BLITZ_COMPANY_TYPES = ["Educational", "Government Agency", "Nonprofit", "Partnership", "Privately Held", "Public Company", "Self-Employed", "Self-Owned", "Sole Proprietorship"]

SENIORITY_TO_BLITZ_LEVEL = {
    "founder": "C-Team",
    "c_suite": "C-Team",
    "vp": "VP",
    "head": "Director",
    "director": "Director",
    "manager": "Manager",
    "lead": "Manager",
    "principal": "Manager",
    "ic": "Staff",
    "staff": "Staff",
    "individual": "Staff",
}

DEPT_TO_BLITZ_FUNCTION = {
    "marketing": "Advertising & Marketing",
    "sales": "Sales & Business Development",
    "business development": "Sales & Business Development",
    "engineering": "Engineering",
    "product": "Research & Development",
    "finance": "Finance & Accounting",
    "accounting": "Finance & Accounting",
    "hr": "Human Resources",
    "human resources": "Human Resources",
    "operations": "Operations",
    "legal": "Legal",
    "it": "Information Technology",
    "information technology": "Information Technology",
    "customer success": "Customer/Client Service",
    "support": "Customer/Client Service",
}

def infer_seniority(title: str, default: str = "ic") -> str:
    t = (title or "").lower()
    if any(k in t for k in ["founder", "co-founder", "owner"]):
        return "founder"
    if any(k in t for k in ["ceo", "cto", "cfo", "coo", "cmo", "cro", "cio", "ciso", "chief", "president"]):
        return "c_suite"
    if any(k in t for k in ["vp", "vice president", "svp", "evp"]):
        return "vp"
    if any(k in t for k in ["head of", "head", "director"]):
        return "head"
    if any(k in t for k in ["manager", "lead", "principal", "supervisor"]):
        return "manager"
    return default

def infer_department(title: str) -> str:
    t = (title or "").lower()
    if any(k in t for k in ["market", "growth", "brand"]):
        return "marketing"
    if any(k in t for k in ["sale", "revenue", "account executive", "business dev"]):
        return "sales"
    if any(k in t for k in ["engineer", "developer", "architect", "tech", "data"]):
        return "engineering"
    if any(k in t for k in ["product"]):
        return "product"
    if any(k in t for k in ["finance", "accounting"]):
        return "finance"
    if any(k in t for k in ["people", "hr", "human resources", "talent", "recruiting"]):
        return "hr"
    if any(k in t for k in ["operat"]):
        return "operations"
    if any(k in t for k in ["legal", "counsel"]):
        return "legal"
    return "leadership" if any(k in t for k in ["ceo", "founder", "president"]) else "general"

def emp_to_blitz_range(emp_min, emp_max):
    if emp_min is None and emp_max is None:
        return None
    ranges = []
    for r in BLITZ_EMPLOYEE_RANGES:
        if r == "1-10":
            lo, hi = 1, 10
        elif r == "11-50":
            lo, hi = 11, 50
        elif r == "51-200":
            lo, hi = 51, 200
        elif r == "201-500":
            lo, hi = 201, 500
        elif r == "501-1000":
            lo, hi = 501, 1000
        elif r == "1001-5000":
            lo, hi = 1001, 5000
        elif r == "5001-10000":
            lo, hi = 5001, 10000
        elif r == "10001+":
            lo, hi = 10001, 999999
        if (emp_min is None or hi >= emp_min) and (emp_max is None or lo <= emp_max):
            ranges.append(r)
    return ranges if ranges else None

class HttpProvider:
    def __init__(self):
        base = settings.data_api_base.rstrip("/")
        if base.endswith("/v2"):
            self.base = base[:-3]
        else:
            self.base = base
        self.key = settings.data_api_key
        self.client = httpx.Client(
            base_url=self.base,
            headers={
                "x-api-key": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json"
            },
            timeout=30.0,
        )

    def _count(self, icp: dict) -> int:
        body = self._build_search_body(icp)
        body["max_results"] = 1
        try:
            resp = self.client.post("/v2/search/people", json=body)
            resp.raise_for_status()
            return resp.json().get("total_results", 0)
        except Exception:
            return 0

    def _enrich_email(self, linkedin_url: str) -> str:
        import time
        for attempt in range(3):
            try:
                resp = self.client.post("/v2/enrichment/email", json={"person_linkedin_url": linkedin_url})
                if resp.status_code == 429:
                    time.sleep(1)
                    continue
                resp.raise_for_status()
                data = resp.json()
                if data.get("found"):
                    email = data.get("email") or ""
                    if not email:
                        for e in (data.get("all_emails") or []):
                            if e.get("email"):
                                email = e["email"]
                                break
                    return email.lower() if email else ""
                return ""
            except Exception:
                time.sleep(0.2)
        return ""

    def _search(self, icp: dict, limit: int) -> list[Person]:
        import time
        body = self._build_search_body(icp)
        all_results = []
        cursor = None
        while len(all_results) < limit:
            page_limit = min(limit - len(all_results), 50)
            body["max_results"] = page_limit
            if cursor:
                body["cursor"] = cursor
            resp = self.client.post("/v2/search/people", json=body)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if not results:
                break
            all_results.extend(results)
            cursor = data.get("cursor")
            if not cursor:
                break
        norm = normalize_icp(icp)
        people = [self._map_blitz_person(p, norm) for p in all_results[:limit]]
        for p in people:
            li = p.get("linkedin_url", "")
            if li:
                p["email"] = self._enrich_email(li)
                time.sleep(0.12)
        return people

    def _build_search_body(self, icp: dict) -> dict:
        body = {}
        norm = normalize_icp(icp)

        # ── PEOPLE ──────────────────────────────────────────────────────────
        people_src = icp.get("people") if isinstance(icp.get("people"), dict) else {}
        people = {}

        # Job title
        jt_src = people_src.get("job_title", {}) if isinstance(people_src.get("job_title"), dict) else {}
        titles_inc = jt_src.get("include") or norm.get("titles") or []
        titles_exc = jt_src.get("exclude") or norm.get("titles_exclude") or []
        headline   = jt_src.get("include_linkedin_headline")
        if titles_inc or titles_exc:
            jt = {}
            if titles_inc: jt["include"] = titles_inc
            if titles_exc: jt["exclude"] = titles_exc
            if headline:   jt["include_linkedin_headline"] = True
            people["job_title"] = jt

        # Job level
        job_level = people_src.get("job_level") or []
        if not job_level:
            for s in (norm.get("seniority") or []):
                blitz_level = SENIORITY_TO_BLITZ_LEVEL.get(str(s).lower())
                if blitz_level and blitz_level not in job_level:
                    job_level.append(blitz_level)
                elif str(s) in BLITZ_JOB_LEVELS and str(s) not in job_level:
                    job_level.append(str(s))
        if job_level:
            people["job_level"] = job_level

        # Job function
        job_function = people_src.get("job_function") or []
        if not job_function:
            for d in (norm.get("departments") or []):
                blitz_func = DEPT_TO_BLITZ_FUNCTION.get(str(d).lower())
                if blitz_func and blitz_func not in job_function:
                    job_function.append(blitz_func)
                elif str(d) in BLITZ_JOB_FUNCTIONS and str(d) not in job_function:
                    job_function.append(str(d))
        if job_function:
            people["job_function"] = job_function

        # Min connections
        mc = people_src.get("min_connections")
        if mc is not None and isinstance(mc, (int, float)) and mc > 0:
            people["min_connections"] = int(mc)

        # Location
        loc_src = people_src.get("location", {}) if isinstance(people_src.get("location"), dict) else {}
        location = {}
        cc = loc_src.get("country_code") or (norm.get("countries") or [])
        if cc:
            location["country_code"] = [c.upper() for c in cc]
        city_src = loc_src.get("city", {}) if isinstance(loc_src.get("city"), dict) else {}
        if city_src.get("include"):
            location["city"] = {"include": city_src["include"]}
        if city_src.get("exclude"):
            location.setdefault("city", {})["exclude"] = city_src["exclude"]
        if loc_src.get("sales_region"):
            location["sales_region"] = loc_src["sales_region"]
        if loc_src.get("continent"):
            location["continent"] = loc_src["continent"]
        if location:
            people["location"] = location

        if people:
            body["people"] = people

        # ── COMPANY ─────────────────────────────────────────────────────────
        comp_src = icp.get("company", {}) if isinstance(icp.get("company"), dict) else {}
        company = {}

        # Industries — always resolve through validate list, invalid ones fall to keywords
        ind_src = comp_src.get("industry", {}) if isinstance(comp_src.get("industry"), dict) else {}
        raw_inc = ind_src.get("include") or norm.get("industries") or []
        raw_exc = ind_src.get("exclude") or []

        valid_inc, kw_fallback = [], []
        for item in raw_inc:
            matched = resolve_blitz_industry(str(item))
            if matched:
                if matched not in valid_inc: valid_inc.append(matched)
            else:
                kw_fallback.append(str(item))

        valid_exc = []
        for item in raw_exc:
            matched = resolve_blitz_industry(str(item))
            if matched and matched not in valid_exc:
                valid_exc.append(matched)

        if valid_inc or valid_exc:
            company["industry"] = {}
            if valid_inc: company["industry"]["include"] = valid_inc
            if valid_exc: company["industry"]["exclude"] = valid_exc

        # Keywords (free-text; plus fallback from unresolved industries)
        kw_src = comp_src.get("keywords", {}) if isinstance(comp_src.get("keywords"), dict) else {}
        kw_inc = list(kw_src.get("include") or []) + kw_fallback
        kw_inc = list(dict.fromkeys(kw_inc))
        kw_exc = kw_src.get("exclude") or []
        if kw_inc or kw_exc:
            company["keywords"] = {}
            if kw_inc: company["keywords"]["include"] = kw_inc
            if kw_exc: company["keywords"]["exclude"] = kw_exc

        # Employee range (array of strings like "11-50")
        emp_range = comp_src.get("employee_range")
        if not emp_range:
            emp_range = emp_to_blitz_range(norm.get("employees_min"), norm.get("employees_max"))
        if emp_range:
            company["employee_range"] = emp_range

        # Company name include/exclude
        name_src = comp_src.get("name", {}) if isinstance(comp_src.get("name"), dict) else {}
        if name_src.get("include"):
            company["name"] = {"include": name_src["include"]}
        if name_src.get("exclude"):
            company.setdefault("name", {})["exclude"] = name_src["exclude"]

        # Company type
        type_src = comp_src.get("type", {}) if isinstance(comp_src.get("type"), dict) else {}
        type_inc = type_src.get("include") or norm.get("company_types") or []
        if type_inc:
            company["type"] = {"include": type_inc}

        # Min LinkedIn followers
        min_foll = comp_src.get("min_linkedin_followers")
        if min_foll and isinstance(min_foll, (int, float)) and min_foll > 0:
            company["min_linkedin_followers"] = int(min_foll)

        # LinkedIn company URLs
        li_urls = comp_src.get("linkedin_url") or []
        if li_urls:
            company["linkedin_url"] = li_urls

        # Company domains
        domains = comp_src.get("domain") or comp_src.get("domains") or []
        if domains:
            company["domain"] = domains

        # HQ filters
        hq_src = comp_src.get("hq", {}) if isinstance(comp_src.get("hq"), dict) else {}
        hq = {}
        if hq_src.get("country_code"):
            hq["country_code"] = hq_src["country_code"]
        hq_city = hq_src.get("city", {}) if isinstance(hq_src.get("city"), dict) else {}
        if hq_city.get("include"):
            hq["city"] = {"include": hq_city["include"]}
        if hq_city.get("exclude"):
            hq.setdefault("city", {})["exclude"] = hq_city["exclude"]
        if hq_src.get("sales_region"):
            hq["sales_region"] = hq_src["sales_region"]
        if hq_src.get("continent"):
            hq["continent"] = hq_src["continent"]
        if hq:
            company["hq"] = hq

        if company:
            body["company"] = company

        return body

    def _map_blitz_person(self, p: dict, norm_icp: dict) -> Person:
        experiences = p.get("experiences") or []
        curr_exp = next((e for e in experiences if e.get("job_is_current")), None) or (experiences[0] if experiences else {})
        title = curr_exp.get("job_title") or p.get("headline") or ""
        company = curr_exp.get("company_name") or ""
        website = curr_exp.get("company_domain") or ""
        loc = p.get("location") or {}
        country = (loc.get("country_code") or "").upper()
        city = loc.get("city") or ""

        email = p.get("email") or ""
        if not email and p.get("emails"):
            email = p["emails"][0] if p["emails"] else ""

        seniority = infer_seniority(title)
        department = infer_department(title)
        industry = curr_exp.get("company_industry") or (norm_icp.get("industries", [""])[0] if norm_icp.get("industries") else "")
        employee_count = curr_exp.get("company_size") or norm_icp.get("employees_min") or 0

        return {
            "first_name": p.get("first_name", ""),
            "last_name": p.get("last_name", ""),
            "title": title,
            "seniority": seniority,
            "department": department,
            "company": company,
            "website": website,
            "industry": industry,
            "employee_count": employee_count,
            "country": country,
            "city": city,
            "email": email.lower() if email else "",
            "linkedin_url": p.get("linkedin_url", ""),
        }

    def count(self, icp):
        return self._count(icp)

    def search(self, icp, limit):
        return self._search(icp, limit)

def get_provider() -> SearchProvider:
    return HttpProvider()