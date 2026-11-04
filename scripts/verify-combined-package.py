"""Offline checks for artifact integrity and manifest dependency closure."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'extensions/allcalls-mode'
archive = ROOT / 'dist/combined/wayfinder-call-modes.zip'
first = archive.read_bytes()
with ZipFile(archive) as package:
    assert package.testzip() is None, 'Corrupt ZIP member'
    names = package.namelist()
    assert len(names) == len(set(names)), 'Duplicate ZIP members'
    prefix = 'wayfinder-call-modes/'
    assets = {}
    for name in names:
        assert name.startswith(prefix) and '..' not in Path(name).parts
        relative = name[len(prefix):]
        assert relative and not relative.endswith('.test.cjs')
        content = package.read(name)
        assert content == (source / relative).read_bytes(), relative
        assert content == (archive.parent / 'unpacked' / name).read_bytes(), relative
        assets[relative] = content
    manifest = json.loads(assets['manifest.json'])
    references = [manifest['background']['service_worker'], manifest['action']['default_popup']]
    references += list(manifest['icons'].values())
    references += list(manifest['action']['default_icon'].values())
    for entry in manifest['content_scripts']:
        references += entry['js']
    for entry in manifest.get('web_accessible_resources', []):
        references += entry['resources']
    assert set(references) <= assets.keys(), 'Missing manifest resource'
subprocess.run([sys.executable, str(ROOT / 'scripts/package-call-modes.py')], check=True)
assert archive.read_bytes() == first, 'Build is not reproducible'
assert archive.with_suffix('.zip.sha256').read_text().split()[0] == hashlib.sha256(first).hexdigest()
print(f'Combined ZIP verified: {len(names)} source-identical assets; reproducible; manifest dependencies present.')
