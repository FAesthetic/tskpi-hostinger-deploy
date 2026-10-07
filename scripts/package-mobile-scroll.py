#!/usr/bin/env python3
"""Patch only the existing site's startup command; keep booking/settings unchanged.
Usage: package-mobile-scroll.py current-compose.json output-compose.json
Input/output are private deployment manifests; never commit their environment files.
"""
import base64, gzip, hashlib, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
command = manifest['services']['site']['command']
assert command[:2] == ['/bin/sh', '-c']
assert 'd76a975c523b7b14e4077746489ce5cd1ab65d41297bd7d8385ec5acd5029857' in command[2], 'Unexpected live artifact'
assert 'mobile-scroll-20261007' not in command[2], 'Already patched'
def compressed(data):
    return base64.b64encode(gzip.compress(data, mtime=0)).decode()
js = (root / 'public/immersive.js').read_bytes()
css = (root / 'public/immersive.css').read_bytes()
marker = b'\n/* Mobile uses native document scrolling'
assert css.count(marker) == 1
append = marker + css.split(marker, 1)[1]
steps = [
    f"printf '%s' '{compressed(js)}' | base64 -d | gzip -d > /opt/fotobox/public/immersive.js",
    f"printf '%s' '{compressed(append)}' | base64 -d | gzip -d >> /opt/fotobox/public/immersive.css",
    "sed -i 's|/immersive.css?v=day1|/immersive.css?v=mobile-scroll-20261007|g;s|/immersive.js?v=one1|/immersive.js?v=mobile-scroll-20261007|g' /opt/fotobox/public/index.html",
]
for name, data in [('immersive.js', js), ('immersive.css', css)]:
    steps.append(f"echo '{hashlib.sha256(data).hexdigest()}  /opt/fotobox/public/{name}' | sha256sum -c -")
needle = 'exec nginx -c'
assert command[2].count(needle) == 1
command[2] = command[2].replace(needle, '; '.join(steps) + '; ' + needle)
encoded = json.dumps(manifest, separators=(',', ':'), ensure_ascii=False)
assert len(encoded.encode()) <= 8192, 'Hostinger manifest size exceeded'
pathlib.Path(sys.argv[2]).write_text(encoded)
