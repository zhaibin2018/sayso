from pathlib import Path
import json,hashlib,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1]
package=root/'release/service/v0.13.259-20261121.1-plugin1.2.51'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(package/'manifest.json')=='440d74589eb238e21f806f02c2918e3790545ecca1a236162c8daabcee8d7e54'
subprocess.run([sys.executable,str(package/'verify.py'),str(package)],check=True)
archive=package.parent/(package.name+'.zip')
assert digest(archive)=='4fa39d77f515b7dd5dca52bf69730c590d3aa35183987a4016d268303e760cf3'
assert (archive.parent/(archive.name+'.sha256')).read_text().split()[0]==digest(archive)
files={package.name+'/'+p.relative_to(package).as_posix():p for p in package.rglob('*') if p.is_file()}
with zipfile.ZipFile(archive) as z:
 assert len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==set(files)
 assert all(z.read(name)==path.read_bytes() for name,path in files.items())
print('Pinned release manifest, ZIP, icon, nine skills and exact archive contents verified.')
