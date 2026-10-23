"""Fetch the CC0 sources of the T-109 A2 spike and RIG v3 (tools/art/spike/cc0.json).

    /opt/hb-art/bin/python -I tools/art/spike/fetch_cc0.py

Each archive goes into its own directory, tools/art/build/cc0/<id>/ (git-
ignored; HB_ART_CC0=<dir> puts them elsewhere -- the renderers read the same
variable), is checked against the recorded sha256 (a changed upstream file is a
hard error, never a silent swap), and only the listed members are extracted —
with any absolute or '..' member name refused. The downloads are data: nothing
in them is executed (the .blend is later opened with Python auto-run off and
only its objects appended).
"""

import hashlib
import json
import os
import shutil
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.environ.get('HB_ART_CC0') or os.path.join(HERE, '..', 'build', 'cc0')


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    spec = json.load(open(os.path.join(HERE, 'cc0.json')))
    for src in spec['sources']:
        d = os.path.abspath(os.path.join(DEST, src['id']))
        os.makedirs(d, exist_ok=True)
        archive = os.path.join(d, 'download.zip')
        if not (os.path.exists(archive) and sha256(archive) == src['sha256']):
            print('downloading', src['url'])
            with urllib.request.urlopen(src['url'], timeout=600) as r, open(archive, 'wb') as fh:
                shutil.copyfileobj(r, fh)
        got = sha256(archive)
        if got != src['sha256']:
            sys.exit('%s: sha256 %s != recorded %s' % (src['id'], got, src['sha256']))
        with zipfile.ZipFile(archive) as z:
            for name in src['extract']:
                if name.startswith('/') or '..' in name.split('/'):
                    sys.exit('refusing member %r' % name)
                out = os.path.join(d, 'files', os.path.basename(name))
                os.makedirs(os.path.dirname(out), exist_ok=True)
                with z.open(name) as fin, open(out, 'wb') as fout:
                    shutil.copyfileobj(fin, fout)
                print('extracted', out)
    print('ok')


if __name__ == '__main__':
    main()
