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

r = requests.get('http://127.0.0.1:8000/health')
print('Health:', r.json())

r = requests.get('http://127.0.0.1:8000/api/enums')
print('Enums:', r.json())

r = requests.post('http://127.0.0.1:8000/api/count', json={'titles': ['CEO'], 'countries': ['NL']})
print('Count:', r.json())

r = requests.post('http://127.0.0.1:8000/api/jobs', json={'icp': {'titles': ['CEO'], 'countries': ['NL']}, 'goal': 5})
job = r.json()
print('Job started:', job)

for i in range(10):
    r = requests.get('http://127.0.0.1:8000/api/jobs/' + job['id'])
    j = r.json()
    print('Job status:', j['status'], ', collected:', j['collected'], ', sendable:', j['sendable'])
    if j['status'] == 'done':
        print('DONE! File:', j.get('file'))
        break
    time.sleep(1)