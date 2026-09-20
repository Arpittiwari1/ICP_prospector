import csv, os, time

FIELDS = ["first_name","last_name","title","seniority","department","company",
          "website","industry","employee_count","country","email",
          "linkedin_url","icp_score","icp_reason","email_status","sendable","tab"]

def write_rows(out_dir, job_id, rows):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "run_%s_%s.csv" % (job_id, int(time.time())))
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)
    return path