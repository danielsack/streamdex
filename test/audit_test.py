"""Exercise the release boundary using only disposable, fictional kits."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

AUDITOR = Path(__file__).resolve().parents[1] / 'scripts' / 'audit.py'


class ReleaseAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='streamdex-audit-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        shutil.copy2(AUDITOR, self.root / 'scripts/audit.py')
        (self.root / 'fixture.txt').write_text('Fictional task content.\n')
        (self.root / 'package.json').write_text(json.dumps({'version': '9.8.7-beta.6'}))
        self.files = ['package.json', 'fixture.txt', 'payload.json', 'release-files.json', 'scripts/audit.py']
        self.pack()

    def pack(self):
        payload = {'version': '9.8.7-beta.6', 'files': {
            'fixture.txt': hashlib.sha256((self.root / 'fixture.txt').read_bytes()).hexdigest()
        }}
        (self.root / 'payload.json').write_text(json.dumps(payload))
        (self.root / 'release-files.json').write_text(json.dumps({'files': sorted(self.files)}))
        (self.root / '.dist').mkdir(exist_ok=True)
        with zipfile.ZipFile(self.archive, 'w') as archive:
            for name in self.files:
                archive.write(self.root / name, name)

    @property
    def archive(self):
        return self.root / '.dist/streamdex-9.8.7-beta.6-macos-arm64.zip'

    def audit(self, *args):
        result = subprocess.run(
            [sys.executable, str(self.root / 'scripts/audit.py'), *args],
            cwd=self.root, capture_output=True, text=True, timeout=15,
        )
        self.assertIn(result.returncode, (0, 1), result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(result.returncode, bool(report['findings']))
        return report

    def assertRule(self, rule, *args):
        self.assertIn(rule, {item['rule'] for item in self.audit(*args)['findings']})

    def test_accepts_exact_clean_kit(self):
        self.assertEqual(self.audit()['result'], 'PASS')

    def test_source_mode_still_checks_payload_without_requiring_zip(self):
        self.archive.unlink()
        self.assertRule('missing-release-kit')
        self.assertEqual(self.audit('--source-only')['result'], 'PASS')
        (self.root / 'fixture.txt').write_text('Changed after integrity manifest.')
        self.assertRule('payload-hash-mismatch', '--source-only')

    def test_rejects_unlisted_hidden_file_and_symlink(self):
        (self.root / '.unexpected').write_text('Fictional unexpected data.')
        (self.root / 'linked.txt').symlink_to('fixture.txt')
        rules = {item['rule'] for item in self.audit()['findings']}
        self.assertTrue({'not-allowlisted', 'unexpected-symlink'} <= rules)

    def test_rejects_nested_secret_without_printing_its_value(self):
        token = 'gh' + 'p_' + 'x' * 40  # Synthetic, never a valid credential.
        with zipfile.ZipFile(self.root / 'nested.zip', 'w') as archive:
            archive.writestr('example.txt', token)
        self.files.append('nested.zip')
        self.pack()
        report = self.audit()
        self.assertIn('github-token', {item['rule'] for item in report['findings']})
        self.assertNotIn(token, json.dumps(report))

    def test_rejects_unsafe_archive_path(self):
        with zipfile.ZipFile(self.root / 'nested.zip', 'w') as archive:
            archive.writestr('../outside.txt', 'fictional')
        self.files.append('nested.zip')
        self.pack()
        self.assertRule('unsafe-archive-entry')

    def test_rejects_live_state_and_bound_device(self):
        (self.root / 'read.json').write_text('{}')
        (self.root / 'profile.json').write_text(json.dumps({'Device': {'UUID': 'fictional-device'}}))
        self.files += ['read.json', 'profile.json']
        self.pack()
        rules = {item['rule'] for item in self.audit()['findings']}
        self.assertTrue({'forbidden-content', 'bound-device'} <= rules)

    def test_rejects_machine_path(self):
        (self.root / 'fixture.txt').write_text('/' + 'Users/' + 'fictional-owner/private.txt')
        self.pack()
        self.assertRule('personal-path')

    def test_rejects_payload_version_mismatch(self):
        (self.root / 'package.json').write_text(json.dumps({'version': '9.8.7-beta.7'}))
        self.assertRule('payload-version-mismatch', '--source-only')

    def test_rejects_unsafe_version_without_reading_other_archives(self):
        (self.root / 'package.json').write_text(json.dumps({'version': '../outside'}))
        self.assertRule('invalid-release-version')

    def test_rejects_changed_archive_content(self):
        with zipfile.ZipFile(self.archive, 'w') as archive:
            for name in self.files:
                content = b'changed' if name == 'fixture.txt' else (self.root / name).read_bytes()
                archive.writestr(name, content)
        self.assertRule('kit-content-mismatch')

    def test_staged_scan_rejects_unstaged_change(self):
        subprocess.run(['git', 'init', '--quiet', '--template='], cwd=self.root, check=True)
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'add', '--', *self.files], cwd=self.root, check=True)
        self.assertEqual(self.audit('--staged')['result'], 'PASS')
        (self.root / 'fixture.txt').write_text('New fictional content after staging.')
        self.pack()
        self.assertRule('index-worktree-mismatch', '--staged')


if __name__ == '__main__':
    unittest.main()
