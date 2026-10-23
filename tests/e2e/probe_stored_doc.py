import requests
import re

API = 'http://localhost:3000'
login_resp = requests.post(f'{API}/auth/login', json={'email': 'test@test.com', 'password': 'asd123'})
token = login_resp.json().get('token') or login_resp.json().get('session', {}).get('access_token')
headers = {'Authorization': f'Bearer {token}'}

doc_resp = requests.get(f'{API}/documents/8018d3c6-3e42-4aa5-b1e7-21d92c464efc', headers=headers)
doc = doc_resp.json()
content = doc.get('content', '')

print('STORED DOC STATS:')
print('content length:', len(content))
print('p tags:', content.count('<p'))
print('table tags:', content.count('<table'))
print('img tags:', content.count('<img'))
print('hr tags:', content.count('<hr'))
print('page-break:', content.count('page-break'))

imgs = re.findall(r'<img[^>]*>', content)
for i, img in enumerate(imgs):
    src = re.search(r'src="([^"]*)"', img)
    width = re.search(r'width="([^"]*)"', img)
    src_len = len(src.group(1)) if src else 0
    print(f'  img {i}: src_len={src_len}, width={width.group(1) if width else None}')

# Sample one of the img HTML lines
if imgs:
    print()
    print('FIRST IMG HTML:', imgs[0][:200])
