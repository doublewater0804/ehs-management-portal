from pathlib import Path
import json,re,sys,html.parser
ROOT=Path(__file__).resolve().parents[2]
module=ROOT/'weekly-focus'
ids=set()
class IDParser(html.parser.HTMLParser):
 def handle_starttag(self,tag,attrs):
  item=dict(attrs)
  if 'id' in item:
   assert item['id'] not in ids, f'duplicate element id: {item["id"]}'
   ids.add(item['id'])
parser=IDParser();parser.feed((module/'index.html').read_text())
app=(module/'app.js').read_text()
for element in re.findall(r"\$\('([a-z][a-z0-9-]*)'\)",app):
 assert element in ids, f'unknown DOM id: {element}'
defaults=json.loads((ROOT/'portal/defaults.json').read_text());new=[x for x in defaults if x['id']=='weekly-focus']
assert len(new)==1 and new[0]['category']=='general' and new[0]['href']=='weekly-focus/index.html'
assert "id: 'weekly-focus'" in (ROOT/'portal/builtins.js').read_text()
assert 'app.js?v=20261020-weekly' in (ROOT/'index.html').read_text()
assert not list(module.rglob('*.xls')) and not list(module.rglob('*.xlsx')), 'Do not expose real files in Pages'
html=(module/'index.html').read_text()
assert 'xlsx-js-style@1.2.0' in html
assert 'Firebase' in (module/'FIREBASE_RULES_ADDENDUM.md').read_text()
assert 'allow read: if true' not in (module/'cloud.js').read_text()
print('PASS 5: UI DOM IDs, general registry, cache bump, protected-Excel packaging')
