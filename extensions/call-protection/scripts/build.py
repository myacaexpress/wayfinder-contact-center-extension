"""Build the call-protection-only store candidate; never publish or deploy it."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
FILES = ('background.js', 'detector.js', 'allcalls.js', 'wayfinder.js',
         'popup.html', 'popup.css', 'popup.js', 'icons/icon-16.png',
         'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png')
HOSTS = ['https://allcalls.io/*', 'https://wayfindercontactcenter.com/*',
         'https://www.wayfindercontactcenter.com/*']


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for name in ('src', 'href'):
            if name in attrs:
                self.paths.append(attrs[name])


def version():
    value = json.loads((ROOT / 'package.json').read_text())['version']
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value):
        raise ValueError('Package version must be three numeric Chrome-compatible components')
    if any(int(part) > 65535 for part in value.split('.')) or value == '0.0.0':
        raise ValueError('Package version is outside Chrome limits')
    return value


def candidate_assets(source=SOURCE):
    assets = {name: (source / name).read_bytes() for name in FILES}
    manifest = json.loads((source / 'manifest.json').read_text())
    if 'version' in manifest:
        raise ValueError('Set the version only in package.json')
    manifest['version'] = version()
    assets['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    validate_assets(assets)
    return assets


def validate_assets(assets):
    manifest = json.loads(assets['manifest.json'])
    if manifest['permissions'] != ['storage', 'scripting'] or manifest['host_permissions'] != HOSTS:
        raise ValueError('Review changed call-protection permissions')
    if set(manifest) != {'manifest_version', 'name', 'version', 'description',
                         'permissions', 'host_permissions', 'background', 'action',
                         'content_scripts', 'icons'}:
        raise ValueError('Unexpected manifest fields')
    if manifest['content_scripts'] != [
        {'matches': ['https://allcalls.io/*'], 'js': ['detector.js', 'allcalls.js']},
        {'matches': HOSTS[1:], 'js': ['wayfinder.js']}
    ]:
        raise ValueError('Unexpected content scripts')
    references = [manifest['background']['service_worker'], manifest['action']['default_popup']]
    references += list(manifest['icons'].values()) + list(manifest['action']['default_icon'].values())
    for script in manifest['content_scripts']:
        references += script['js']
    popup = References()
    popup.feed(assets['popup.html'].decode())
    references += popup.paths
    if set(references) - assets.keys():
        raise ValueError('Package has missing or external resource references')
    for name, content in assets.items():
        if name.endswith(('.js', '.html', '.css', '.json')):
            text = content.decode()
            if re.search(r'integrity|capture\.html|127\.0\.0\.1|uhc\.com', text, re.I):
                raise ValueError('Non-call-protection feature remains in store package')
            # Current call-protection scripts are self-contained. Any new module
            # dependency needs explicit packaging and regression coverage.
            if name.endswith('.js') and re.search(r'\b(?:import|export|importScripts)\b', text):
                raise ValueError('Review new JavaScript module dependencies before packaging')


def build(destination, source=SOURCE):
    assets = candidate_assets(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w') as archive:
        for name, content in sorted(assets.items()):
            info = ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, content)
    return destination


if __name__ == '__main__':
    import hashlib
    import shutil
    destination = ROOT / 'dist' / f'wayfinder-call-protection-{version()}.zip'
    archive = build(destination)
    unpacked = ROOT / 'dist/unpacked'
    if unpacked.exists():
        shutil.rmtree(unpacked)
    with ZipFile(archive) as package:
        package.extractall(unpacked)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
    print(archive)
