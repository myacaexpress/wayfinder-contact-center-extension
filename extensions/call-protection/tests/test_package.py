"""Standalone package and extracted-ZIP behavior checks: npm test."""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('packager', Path(__file__).resolve().parents[1] / 'scripts/build.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class StorePackageTest(unittest.TestCase):
    def test_package_is_reproducible_and_self_contained(self):
        with tempfile.TemporaryDirectory() as directory:
            first = packager.build(Path(directory) / 'first.zip')
            second = packager.build(Path(directory) / 'second.zip')
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with ZipFile(first) as archive:
                names = set(archive.namelist())
                self.assertEqual(names, set(packager.FILES) | {'manifest.json'})
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(manifest['permissions'], ['storage'])
                self.assertNotIn('optional_host_permissions', manifest)
                self.assertNotIn('web_accessible_resources', manifest)
                self.assertNotIn('update_url', manifest)
                self.assertEqual(set(manifest['host_permissions']), {
                    'https://allcalls.io/*', 'https://wayfindercontactcenter.com/*',
                    'https://www.wayfindercontactcenter.com/*'})
                references = [manifest['background']['service_worker'], manifest['action']['default_popup']]
                references += list(manifest['icons'].values())
                for script in manifest['content_scripts']:
                    references += script['js']
                self.assertTrue(set(references) <= names)
                self.assertNotIn(b'capture.html', archive.read('popup.html'))
                for name in names:
                    if name.endswith('.js'):
                        source = (packager.SOURCE / name).read_bytes()
                        self.assertEqual(archive.read(name), source)
                packager.validate_assets({name: archive.read(name) for name in names})

    def test_missing_dependencies_and_feature_leaks_fail_closed(self):
        for name in ('background.js', 'popup.js', 'icons/icon-32.png'):
            assets = packager.candidate_assets()
            del assets[name]
            with self.subTest(missing=name), self.assertRaises(ValueError):
                packager.validate_assets(assets)
        for code in (b"\nimport './missing.mjs';", b"\nimportScripts('missing.js');",
                     b'\n// integrity feature accidentally included'):
            assets = packager.candidate_assets()
            assets['background.js'] += code
            with self.subTest(code=code), self.assertRaises(ValueError):
                packager.validate_assets(assets)

    def test_permissions_and_duplicate_version_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'
            shutil.copytree(packager.SOURCE, source)
            path = source / 'manifest.json'
            original = json.loads(path.read_text())
            for change in ({'permissions': ['storage', 'scripting']},
                           {'optional_host_permissions': ['https://example.com/*']},
                           {'version': '0.3.11'}):
                path.write_text(json.dumps({**original, **change}))
                with self.subTest(change=change), self.assertRaises(ValueError):
                    packager.build(Path(directory) / 'invalid.zip', source)

    def test_package_version_is_the_only_version_source(self):
        assets = packager.candidate_assets()
        self.assertEqual(json.loads(assets['manifest.json'])['version'], packager.version())
        metadata = json.loads((packager.ROOT / 'package.json').read_text())
        lock = json.loads((packager.ROOT / 'package-lock.json').read_text())
        self.assertEqual(metadata['version'], lock['version'])
        self.assertEqual(metadata['version'], lock['packages']['']['version'])

    def test_invalid_release_versions_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(packager, 'ROOT', root):
                for value in ('0.0.0', '1.0.0-beta', '01.2.3', '65536.0.0', '1.2'):
                    (root / 'package.json').write_text(json.dumps({'version': value}))
                    with self.subTest(version=value), self.assertRaises(ValueError):
                        packager.version()
                (root / 'package.json').write_text(json.dumps({'version': '1.2.3'}))
                self.assertEqual(packager.version(), '1.2.3')

    def test_packaged_call_protection_passes_behavior_suite(self):
        # Exercise extracted ZIP code, not the combined developer extension.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = packager.build(root / 'store.zip')
            extension = root / 'extension'
            extension.mkdir(parents=True)
            with ZipFile(package) as archive:
                archive.extractall(extension)
            for script in extension.glob('*.js'):
                subprocess.run(['node', '--check', str(script)], check=True, capture_output=True)
            tests = []
            for name in ('background', 'detector', 'allcalls', 'popup'):
                target = extension / f'{name}.test.cjs'
                shutil.copyfile(packager.ROOT / 'tests' / target.name, target)
                tests.append(str(target))
            result = subprocess.run(['node', '--test', *tests], capture_output=True, text=True,
                                    env={**os.environ, 'NODE_PATH': str(packager.ROOT / 'node_modules')}, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
