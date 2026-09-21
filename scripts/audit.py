"""Local allowlist, secret, path, nested archive, payload and Git-index audit."""
import argparse, hashlib, io, json, os, re, stat, subprocess, sys, zipfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--private-patterns');parser.add_argument('--staged',action='store_true');parser.add_argument('--report');parser.add_argument('--source-only',action='store_true',help='Audit committed source/payload without requiring a locally generated release ZIP');args=parser.parse_args()
allow=json.loads((root/'release-files.json').read_text())['files'];findings=[];scanned=[];archive_entries=0
private=json.loads(Path(args.private_patterns).read_text()) if args.private_patterns else []
rules=[('private-key',re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),('github-token',re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})')),('service-token',re.compile(rb'sk-(?:proj-)?[A-Za-z0-9_-]{40,}')),('aws-key',re.compile(rb'AKIA[0-9A-Z]{16}')),('personal-path',re.compile(b'/'+b'Users'+rb'/(?!example(?:/|\b)|test(?:/|\b)|demo(?:/|\b))[^\s/"\x00]{1,80}/'))]
for i,p in enumerate(private):rules.append(('private-identifier-'+str(i+1),re.compile(re.escape(p.encode()),re.I)))
forbidden={'travel-targets.json','live.json','read.json','.DS_Store'}
def fail(path,rule):findings.append({'file':path,'rule':rule})
def inspect(path,data,depth=0):
 global archive_entries
 if depth>5:fail(path,'archive-depth');return
 parts=Path(path).parts
 if any(v in forbidden for v in parts) or any(v in {'node_modules','.git','logs','travel-state','plus-v2-state','__MACOSX','__pycache__'} for v in parts) or path.endswith(('.map','.log','.sqlite','.sqlite-wal','.sqlite-shm')):fail(path,'forbidden-content')
 for name,pat in rules:
  if pat.search(data) or pat.search(data.replace(bytes([0]),b'')):fail(path,name)
 if path.endswith('.json'):
  try:
   value=json.loads(data)
   if isinstance(value,dict) and isinstance(value.get('Device'),dict) and value['Device'].get('UUID'):fail(path,'bound-device')
  except (ValueError,UnicodeError):fail(path,'invalid-json')
 if data[:4] in [b'PK\x03\x04',b'PK\x05\x06']:
  try:
   with zipfile.ZipFile(io.BytesIO(data)) as z:
    seen=set()
    for info in z.infolist():
     n=info.filename;archive_entries+=1
     if n in seen:fail(path+'!'+n,'duplicate-archive-entry')
     seen.add(n)
     if n.startswith('/') or '..' in Path(n).parts or stat.S_ISLNK(info.external_attr>>16):fail(path+'!'+n,'unsafe-archive-entry');continue
     if not info.is_dir():
      if info.file_size>100_000_000:fail(path+'!'+n,'oversized-archive-entry');continue
      inspect(path+'!'+n,z.read(info),depth+1)
  except (zipfile.BadZipFile,RuntimeError):fail(path,'unreadable-archive')
for name in allow:
 p=root/name
 if name.startswith('/') or '..' in Path(name).parts or not p.is_file() or p.is_symlink():fail(name,'missing-or-unsafe-allowlist-entry');continue
 data=p.read_bytes();inspect(name,data);scanned.append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
# Every candidate file must be explicitly selected, including hidden files.
ignored={'.git','node_modules','.build','.dist','coverage','.cache'}
def walk(directory):
 for p in directory.iterdir():
  if p.parent==root and p.name in ignored:continue
  if p.is_symlink():fail(str(p.relative_to(root)),'unexpected-symlink')
  elif p.is_dir() and p.name=='__pycache__':continue
  elif p.is_dir():walk(p)
  elif str(p.relative_to(root)) not in allow:fail(str(p.relative_to(root)),'not-allowlisted')
walk(root)
payload=json.loads((root/'payload.json').read_text())['files']
for name,sha in payload.items():
 if name not in allow or not (root/name).is_file() or hashlib.sha256((root/name).read_bytes()).hexdigest()!=sha:fail(name,'payload-hash-mismatch')
archive=root/'.dist/streamdex-0.1.0-beta.1-macos-arm64.zip'
if archive.exists() and not args.source_only:
 inspect('release-kit.zip',archive.read_bytes())
 with zipfile.ZipFile(archive) as z:
  names={i.filename for i in z.infolist() if not i.is_dir()}
  if names!=set(allow):fail('release-kit.zip','kit-file-set-mismatch')
  for name in names&set(allow):
   if z.read(name)!=(root/name).read_bytes():fail(name,'kit-content-mismatch')
elif not args.source_only:fail('release-kit.zip','missing-release-kit')
if args.staged:
 names=subprocess.check_output(['git','ls-files','--cached','-z'],cwd=root).decode().split('\0');names=[n for n in names if n]
 if set(names)!=set(allow):fail('git-index','staged-file-set-mismatch')
 for name in names:
  data=subprocess.check_output(['git','show',':'+name],cwd=root)
  if data!=(root/name).read_bytes():fail(name,'index-worktree-mismatch')
  inspect('index:'+name,data)
report={'result':'PASS' if not findings else 'FAIL','files':len(scanned),'archiveEntries':archive_entries,'privatePatternsApplied':len(private),'findings':findings,'inventory':scanned}
if args.report:Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='inventory'},indent=2));sys.exit(bool(findings))
