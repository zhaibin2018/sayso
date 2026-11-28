"""Verify the pinned archive in memory. Never extract package members."""
from hashlib import sha256
from pathlib import PurePosixPath
import io
import json
import sys
import zipfile

def main(label, manifest_digest):
    with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
        entries = [i for i in archive.infolist() if not i.is_dir()]
        names = {i.filename for i in entries}
        if len(names) != len(entries):
            raise ValueError("Duplicate package member")
        prefix = label + "/"
        for member in names:
            path = PurePosixPath(member)
            if not member.startswith(prefix) or "\\" in member or ".." in path.parts or path.suffix.lower() in {".p8",".p12",".pem"}:
                raise ValueError("Unexpected release member")
        raw = archive.read(prefix+"manifest.json")
        if sha256(raw).hexdigest() != manifest_digest:
            raise ValueError("Archive contains a different manifest")
        manifest = json.loads(raw)
        files = {prefix+f["path"]:f for f in manifest["files"]}
        if len(files) != len(manifest["files"]) or names != set(files) | {prefix+"manifest.json"}:
            raise ValueError("Archive inventory differs from manifest")
        for name, record in files.items():
            if archive.getinfo(name).file_size != record["bytes"]:
                raise ValueError("Archive size mismatch")
            with archive.open(name) as member:
                digest = sha256()
                for block in iter(lambda: member.read(1 << 20),b""):
                    digest.update(block)
            if digest.hexdigest() != record["sha256"]:
                raise ValueError("Archive file differs from manifest")
if __name__ == "__main__":
    main(sys.argv[1],sys.argv[2])
