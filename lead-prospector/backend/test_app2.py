import requests
import uvicorn
from app.main import app
import threading
import time

def run_server():
    uvicorn.run(app, host='127.0.0.1', port=8000, log_level='error')

server = threading.Thread(target=run_server, daemon=True)
server.start()
time.sleep(2)

# Test with broader ICP - all titles, all countries
icp = {
    "titles": ["CEO", "Founder", "CTO", "VP Sales", "Head of Marketing", "Growth Lead", "Marketing Manager"],
    "countries": ["NL", "GB", "DE", "US", "SE", "BE", "FR"],
    "seniority": ["founder", "c_suite", "vp", "head", "manager"],
    "industries": ["SaaS", "E-commerce", "Fintech", "Healthcare", "Logistics", "Agency"]
}

r = requests.post('http://127.0.0.1:8000/api/count', json=icp)
print('Count:', r.json())

r = requests.post('http://127.0.0.1:8000/api/jobs', json={'icp': icp, 'goal': 5})
job = r.json()
print('Job started:', job)

for i in range(15):
    r = requests.get('http://127.0.0.1:8000/api/jobs/' + job['id'])
    j = r.json()
    print('Job status:', j['status'], ', collected:', j['collected'], ', passed:', j['passed'], ', sendable:', j['sendable'])
    if j['status'] == 'done':
        print('DONE! File:', j.get('file'))
        break
    time.sleep(1)

# Check tabs in CSV
import csv
with open(j['file'], 'r') as f:
    reader = csv.DictReader(f)
    tabs = {}
    for row in reader:
        tabs[row['tab']] = tabs.get(row['tab'], 0) + 1
    print('Tab counts:', tabs)