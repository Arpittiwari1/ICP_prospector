_JUNIOR = ("assistant", "intern", "trainee", "apprentice", "student")

SENIORITY_ALIASES = {
    "founder": {"founder", "c-team", "c_suite"},
    "c_suite": {"c_suite", "c-team", "founder"},
    "vp": {"vp"},
    "head": {"head", "director"},
    "director": {"director", "head"},
    "manager": {"manager", "lead", "principal"},
    "ic": {"ic", "staff", "senior"},
}

def normalize_icp(icp: dict) -> dict:
    """Extract standard ICP fields whether icp is flat or nested Blitz query."""
    if not isinstance(icp, dict):
        return {}
    norm = dict(icp)
    people = icp.get("people", {})
    if isinstance(people, dict):
        jt = people.get("job_title", {})
        if isinstance(jt, dict):
            if "include" in jt and not norm.get("titles"):
                norm["titles"] = jt["include"]
            if "exclude" in jt and not norm.get("titles_exclude"):
                norm["titles_exclude"] = jt["exclude"]
        if "job_level" in people and not norm.get("seniority"):
            norm["seniority"] = people["job_level"]
        if "job_function" in people and not norm.get("departments"):
            norm["departments"] = people["job_function"]
        loc = people.get("location", {})
        if isinstance(loc, dict) and "country_code" in loc and not norm.get("countries"):
            norm["countries"] = loc["country_code"]

    comp = icp.get("company", {})
    if isinstance(comp, dict):
        ind = comp.get("industry", {})
        if isinstance(ind, dict) and "include" in ind and not norm.get("industries"):
            norm["industries"] = ind["include"]
        emp_cnt = comp.get("employee_count", {})
        if isinstance(emp_cnt, dict):
            if "min" in emp_cnt and norm.get("employees_min") is None:
                norm["employees_min"] = emp_cnt["min"]
            if "max" in emp_cnt and norm.get("employees_max") is None:
                norm["employees_max"] = emp_cnt["max"]

    return norm

def _title_ok(title, icp):
    t = (title or "").lower()
    inc = [x.lower().strip("[] ") for x in icp.get("titles", []) if x]
    exc = [x.lower().strip("[] ") for x in icp.get("titles_exclude", []) if x]
    if any(x in t for x in exc): return False, "Title matches an excluded term"
    if inc and not any(x in t for x in inc): return False, "Title not in target roles"
    if any(j in t for j in _JUNIOR) and "manager" not in t:
        return False, "Role looks junior/support"
    return True, ""

def _seniority_ok(sen, want):
    if not want: return True, ""
    s = (sen or "").lower()
    want_lower = {str(w).lower() for w in want}
    if s in want_lower: return True, ""
    aliases = SENIORITY_ALIASES.get(s, set())
    if aliases & want_lower: return True, ""
    return False, "Seniority '%s' off-target" % sen

def _country_ok(country, want):
    if not want: return True, ""
    c = (country or "").upper()
    want_upper = {str(w).upper() for w in want}
    if c in want_upper: return True, ""
    return False, "Country '%s' off-target" % country

def _industry_ok(ind, want):
    if not want: return True, ""
    if not ind: return True, ""  # Pre-filtered by provider query
    i = (ind or "").lower()
    if any(str(w).lower() in i or i in str(w).lower() for w in want):
        return True, ""
    return False, "Industry '%s' off-target" % ind

def _size_ok(emp, icp):
    lo, hi = icp.get("employees_min"), icp.get("employees_max")
    if emp and lo is not None and emp < lo: return False, "Company too small"
    if emp and hi is not None and emp > hi: return False, "Company too large"
    return True, ""

def classify(p, icp):
    icp = normalize_icp(icp)
    checks = [
        _title_ok(p.get("title"), icp),
        _seniority_ok(p.get("seniority"), icp.get("seniority", [])),
        _country_ok(p.get("country"), icp.get("countries", [])),
        _industry_ok(p.get("industry"), icp.get("industries", [])),
        _size_ok(p.get("employee_count"), icp),
    ]
    reasons = [why for ok, why in checks if not ok]
    score = int(round(100 * (len(checks) - len(reasons)) / len(checks)))
    return {"passed": not reasons, "score": score,
            "reason": "OK" if not reasons else "; ".join(reasons)}