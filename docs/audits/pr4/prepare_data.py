"""Audit-only acquisition, no changes to application or contracts."""
import hashlib,json,urllib.request,zipfile
from pathlib import Path
R=Path('/tmp/lunar-spice-audit');(R/'packages').mkdir(parents=True,exist_ok=True);(R/'kernels').mkdir(exist_ok=True)
meta=json.loads(urllib.request.urlopen('https://pypi.org/pypi/skyfield-data/7.0.0/json').read())
record=next(r for r in meta['urls'] if r['filename']=='skyfield_data-7.0.0-py2.py3-none-any.whl')
expected='4279f999f7f8c5ef5d8bf1b714f301a0844ae5df3a3f0d23610b20d8789073f5'
assert record['digests']['sha256']==expected
wheel=R/'packages'/record['filename'];data=urllib.request.urlopen(record['url']).read();assert hashlib.sha256(data).hexdigest()==expected;wheel.write_bytes(data)
with zipfile.ZipFile(wheel) as z:
 data=z.read(next(n for n in z.namelist() if n.endswith('/de421.bsp')))
assert hashlib.sha256(data).hexdigest()=='a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc'
(R/'kernels/de421.bsp').write_bytes(data);(R/'package-source.json').write_text(json.dumps(record,indent=2)+'\n')
