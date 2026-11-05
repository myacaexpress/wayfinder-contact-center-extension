"""Offline checks for artifact integrity and manifest dependency closure."""
import hashlib
import json
import posixpath
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile

class ResourceReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ('src', 'href'):
            value = values.get(key)
            if not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc:
                assert tag == 'a', 'Remote embedded resource is not allowed'
            elif parsed.path:
                self.paths.append(parsed.path)


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
    # Captured page fixtures exercise the reader but are never runtime assets.
    assert not any(Path(name).parts[0] == 'fixtures' for name in assets), 'Test fixture packaged'
    expected = {str(path.relative_to(source)) for path in source.rglob('*')
                if path.is_file() and path.relative_to(source).parts[0] != 'fixtures'
                and (path.suffix in {'.js', '.mjs', '.html', '.css', '.json', '.png'}
                                       or path.name == 'README.md')}
    assert set(assets) == expected, (
        f'Missing runtime assets: {sorted(expected - set(assets))}; '
        f'unexpected packaged files: {sorted(set(assets) - expected)}'
    )
    for name, content in assets.items():
        refs = []
        if name.endswith('.html'):
            parser = ResourceReferences()
            parser.feed(content.decode())
            refs += parser.paths
        elif name.endswith(('.js', '.mjs')):
            text = content.decode()
            refs += re.findall(r"(?:from\s+|import\s*\(\s*)['\"]([^'\"]+)['\"]", text)
            refs += re.findall(r"chrome\.runtime\.getURL\(['\"]([^'\"]+)['\"]\)", text)
        for ref in refs:
            assert not urlsplit(ref).scheme, f'Remote module/resource: {ref}'
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), ref))
            assert resolved in assets, f'Missing dependency: {name} -> {ref}'
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
print(f'Combined ZIP verified: {len(names)} source-identical assets; reproducible; manifest, HTML and static module dependencies present.')
