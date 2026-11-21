"""Verify exact release inventory and scan without ever printing matched values."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re

PATTERNS = {
    "private Site origin": rb"https://(?!YOUR-SITE\.)[a-zA-Z0-9.-]+\.chatgpt\.site",
    "owner binding": rb"(?:appgprj_|plugin_asdk_app_sites_|dev-)[0-9a-f]{20,}",
    "private key": rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "provider credential": rb"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16})",
    "JWT": rb"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "credential URL": rb"https?://[^\s/]+:[^\s/]+@",
    "literal authorization": rb"(?i)(?:authorization|x-sayso-(?:retention|timing)[-a-z]*key)[\"']?\s*[:=]\s*[\"'](?:Bearer\s+)?[A-Za-z0-9_+/=-]{24,}",
    "literal protected env": rb"SAYSO_(?:FRAME_PERMIT_HMAC|TIMING_JOURNAL_READ|RETENTION_MAINTENANCE)_KEY_HEX\s*[:=]\s*[\"'][a-fA-F0-9]{64}[\"']",
}


def inventory(root):
    files = {}
    for p in sorted(root.rglob("*")):
        if p.is_symlink():
            raise ValueError("Symlinks are forbidden")
        if p.is_file() and p != root / "manifest.json":
            data = p.read_bytes()
            files[p.relative_to(root).as_posix()] = {"path": p.relative_to(root).as_posix(), "bytes": len(data),
                                                   "sha256": hashlib.sha256(data).hexdigest()}
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--private-config-dir", type=Path, help="Optional local-only exact secret comparison; values are never printed or stored")
    args = parser.parse_args()
    root = args.package.resolve()
    files = inventory(root)
    if args.write_manifest:
        provenance = json.loads((root / "PROVENANCE.json").read_text(encoding="utf-8"))
        runtime = re.search(r'runtimeVersion\s*=\s*"([^"]+)"', (root / "mcp/lib/runtime-identity.ts").read_text(encoding="utf-8"))
        presentation = json.loads((root / "plugins/sayso/plugin.json").read_text(encoding="utf-8"))
        manifest = {"schema": 1, "version": runtime.group(1), "skill_version": presentation["version"], "release_label": root.name,
                    "app_presentation": presentation["extensions"]["com.openai"]["interface"],
                    "presentation": json.loads((root / "PRESENTATION.json").read_text(encoding="utf-8")),
                    "skills": provenance["skill_directories"],
                    "migrations": json.loads((root / "MIGRATIONS.json").read_text(encoding="utf-8")),
                    "worker_commit": provenance["worker_commit"], "plugin_commit": provenance["plugin_commit"],
                    "license": "FSL-1.1-ALv2", "licensor": "ZHAI BIN",
                    "self_exclusion": f"manifest.json is excluded from its own hash list; its SHA-256 is in sibling {root.name}.manifest.sha256 and the pinned Git tree.",
                    "fresh_account_installation_verified": False, "files": list(files.values())}
        (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
        (root.parent / (root.name + ".manifest.sha256")).write_text(
            hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest() + "  " + root.name + "/manifest.json\n", encoding="utf-8", newline="\n")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    runtime = re.search(r'runtimeVersion\s*=\s*"([^"]+)"', (root / "mcp/lib/runtime-identity.ts").read_text(encoding="utf-8"))
    provenance = json.loads((root / "PROVENANCE.json").read_text(encoding="utf-8"))
    if (manifest.get("schema") != 1 or not runtime or manifest["version"] != runtime.group(1)
            or manifest["worker_commit"] != provenance["worker_commit"]
            or manifest["plugin_commit"] != provenance["plugin_commit"]):
        raise ValueError("Release version/source metadata mismatch")
    listed = {}
    for item in manifest["files"]:
        name = item["path"]
        if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts or "\\" in name or name in listed:
            raise ValueError("Invalid or duplicate manifest path")
        listed[name] = item
    if files != listed:
        raise ValueError("Manifest inventory/hash/size mismatch")
    detached = (root.parent / (root.name + ".manifest.sha256")).read_text(encoding="utf-8").split()[0]
    if detached != hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest():
        raise ValueError("Detached manifest digest mismatch")
    presentation = json.loads((root / "PRESENTATION.json").read_text(encoding="utf-8"))
    if manifest.get("presentation") != presentation:
        raise ValueError("Presentation metadata mismatch")
    icon = presentation["icon"]
    if icon["path"] != "assets/sayso-icon.png" or files[icon["path"]]["sha256"] != icon["sha256"] or files[icon["path"]]["bytes"] != icon["bytes"]:
        raise ValueError("Icon metadata mismatch")
    skills = sorted(p.name for p in (root / "plugins/sayso/skills").iterdir() if p.is_dir())
    if len(skills) != 9 or skills != manifest["skills"] or skills != provenance["skill_directories"]:
        raise ValueError("Skill inventory mismatch")
    migrations = json.loads((root / "MIGRATIONS.json").read_text(encoding="utf-8"))
    if migrations != manifest["migrations"] or len(migrations) != 36:
        raise ValueError("Migration inventory mismatch")
    if [m["path"] for m in migrations] != sorted(n for n in files if n.startswith("mcp/drizzle/") and n.endswith(".sql")):
        raise ValueError("Migration file set mismatch")
    if any(files[m["path"]]["sha256"] != m["sha256"] for m in migrations):
        raise ValueError("Migration digest mismatch")
    if manifest.get("release_label"):
        expected = {"displayName": "SaySo", "shortDescription": "Read & tap / 读屏和帮你点",
                    "longDescription": "SaySo reads the iPhone screen you choose to share. With a SaySo accessory connected, it can tap, type and scroll for you. Stop tapping or end sharing in the SaySo app. SaySo 读取已共享的 iPhone 画面；连接 SaySo 配件后，可帮你点、输入和滚动。停止帮你点与结束共享可在 SaySo App 中完成。"}
        for name in ["plugin.json", ".codex-plugin/plugin.json"]:
            p = json.loads((root / "plugins/sayso" / name).read_text(encoding="utf-8"))
            ext = p["extensions"]["com.openai"] if name == "plugin.json" else p
            if p["name"] != "sayso" or p["version"] != manifest["skill_version"] or "apps" in ext:
                raise ValueError("Owner-neutral manifest identity mismatch")
            for key, value in expected.items():
                if ext["interface"].get(key) != value or manifest["app_presentation"].get(key) != value:
                    raise ValueError("Fresh App presentation mismatch")
            if p.get("description") != expected["shortDescription"]:
                raise ValueError("Fresh App description mismatch")
    findings = []
    synthetic = []
    known_secrets = set()
    config_count = 0
    if args.private_config_dir:
        for config in args.private_config_dir.iterdir():
            if config.is_file() and (config.name.startswith(".env") or config.name.startswith(".dev.vars")):
                config_count += 1
                for line in config.read_bytes().splitlines():
                    if b"=" not in line or line.lstrip().startswith(b"#"):
                        continue
                    key, value = line.split(b"=", 1)
                    value = value.strip().strip(b"\"'")
                    if re.search(rb"(?i)key|token|secret|password|credential|access", key) and len(value) >= 20 and not re.search(rb"(?i)placeholder|example|your[_-]", value):
                        known_secrets.add(value)
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        name = p.relative_to(root).as_posix()
        if any(part in {"ios", "firmware", "node_modules", ".git", ".wrangler", ".sites-runtime"} or part.startswith(".env") for part in PurePosixPath(name).parts) or re.search(r"\.(?:swift(?:\.txt)?|cpp|ino|bin|pem|p12|pfx|sqlite|db|log|key)$", name):
            findings.append({"file": name, "category": "forbidden path"})
        for label, pattern in PATTERNS.items():
            data = p.read_bytes()
            for match in re.finditer(pattern, data):
                start = data.rfind(b"\n", 0, match.start()) + 1
                end = data.find(b"\n", match.end())
                line = data[start:end if end >= 0 else len(data)].rstrip(b"\r")
                # An exact public negative-auth assertion. No arbitrary test-directory exemption.
                if (name == "mcp/tests/bridge.test.ts" and label == "literal authorization"
                        and hashlib.sha256(line).hexdigest() == "632df88ec1f24e60d9e25b86b67ce7d01109e107acd2ed4150d69c53b8c2e6a6"):
                    synthetic.append({"file": name, "category": "pinned negative-auth synthetic fixture", "line_sha256": hashlib.sha256(line).hexdigest()})
                else:
                    findings.append({"file": name, "category": label})
        if any(value in p.read_bytes() for value in known_secrets):
            findings.append({"file": name, "category": "exact local protected configuration value"})
    report = {"version": manifest["version"], "inventory_files": len(files),
              "scanned_files": len(files) + 1, "manifest": "PASS", "credential_findings": len(findings),
              "findings": findings, "matched_values": "never printed"}
    report["synthetic_fixture_matches"] = synthetic
    report["local_configuration_files_compared"] = config_count
    print(json.dumps(report, indent=2))
    if findings:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
