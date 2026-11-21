from pathlib import Path
import json,hashlib,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1]
package=root/'release/service/v0.13.259-20261121-plugin1.2.51'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(package/'manifest.json')=='69aa53ee740ca8e3eb11f8935120210fc3b8ac61a87ce790ddd6fda29edcadd4'
subprocess.run([sys.executable,str(package/'verify.py'),str(package)],check=True)
archive=package.parent/(package.name+'.zip')
assert digest(archive)=='08f5ae01ade52faf99890419c3e7f73b62a7f9c5e186271ef3be907db951655d'
assert (archive.parent/(archive.name+'.sha256')).read_text().split()[0]==digest(archive)
files={package.name+'/'+p.relative_to(package).as_posix():p for p in package.rglob('*') if p.is_file()}
with zipfile.ZipFile(archive) as z:
 assert len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==set(files)
 assert all(z.read(name)==path.read_bytes() for name,path in files.items())
print('Pinned release manifest, ZIP, icon, nine skills and exact archive contents verified.')
