from pathlib import Path
import json,hashlib,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1]
package=root/'release/service/v0.13.258-rc.20261121-plugin1.2.50'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(package/'manifest.json')=='775b7539ae00136d22992fbee7678bd9441899a9240aa314f6113f3fd449535c'
subprocess.run([sys.executable,str(package/'verify.py'),str(package)],check=True)
archive=package.parent/(package.name+'.zip')
assert digest(archive)=='def0c30e98a805a77408859d9bac3046ed311a8ae8940e243d2ec0241302a575'
assert (archive.parent/(archive.name+'.sha256')).read_text().split()[0]==digest(archive)
files={package.name+'/'+p.relative_to(package).as_posix():p for p in package.rglob('*') if p.is_file()}
with zipfile.ZipFile(archive) as z:
 assert len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==set(files)
 assert all(z.read(name)==path.read_bytes() for name,path in files.items())
print('Pinned release manifest, ZIP, icon, nine skills and exact archive contents verified.')
