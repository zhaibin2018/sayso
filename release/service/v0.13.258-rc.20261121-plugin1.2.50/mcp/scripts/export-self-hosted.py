"""Export source and skill archives; never deploy or update a plugin."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--plugin-source", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
plugin = args.plugin_source.resolve()
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
hosting = json.loads((root / ".openai/hosting.json").read_text())
origin_match = re.search(r'publicOrigin\s*=\s*"([^"]+)"', (root / "lib/bridge-runtime.ts").read_text())
if not origin_match:
    raise SystemExit("Cannot identify the deployment-origin template")
private_origin = origin_match.group(1)
private_project = hosting.get("project_id", "")
template_origin = "https://YOUR-SITE.chatgpt.site"
allowed_dirs = {"app", "components", "db", "drizzle", "hooks", "lib", "public", "scripts", "worker", "contracts", "tests", "vendor"}
allowed_root = {"package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "vite.config.ts", "postcss.config.mjs", "components.json", "drizzle.config.ts", "cloudflare-env.d.ts", ".gitignore", ".npmrc", ".prettierrc.json", ".gitattributes", "ARCHITECTURE.md", "source-budgets.json", "SELF_HOSTING.md"}

def sanitized(path):
    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    text = text.replace(private_origin, template_origin)
    if private_project:
        text = text.replace(private_project, "YOUR_NEW_SITES_PROJECT_ID")
    return text.encode("utf-8")

source_archive = output / "sayso-worker-source.zip"
with zipfile.ZipFile(source_archive, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink():
            continue
        if relative.parts[0] not in allowed_dirs and str(relative) not in allowed_root:
            continue
        if any(part in {"node_modules", ".git", "__pycache__", "evidence", "private"} for part in relative.parts) or path.suffix in {".pyc", ".log", ".pem", ".key", ".p12", ".mobileprovision", ".sqlite", ".db"} or path.name.startswith(".env"):
            continue
        if relative.parts[0] == "tests" and not (path.name.endswith(".test.ts") or relative.as_posix() == "tests/fixtures/jpeg-validation.json"):
            continue  # Historical image replay fixtures are not public source evidence.
        data = sanitized(path)
        if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]", data) or re.search(rb"gh[pousr]_[A-Za-z0-9]{36,}", data):
            raise SystemExit("Potential embedded credential in " + relative.as_posix())
        archive.writestr(relative.as_posix(), data)
    template = {key: value for key, value in hosting.items() if key != "project_id"}
    archive.writestr(".openai/hosting.json", json.dumps(template, indent=2) + "\n")
    archive.writestr("SOURCE_PACKAGE.txt", "Source template only. Register a new private Site, initialize its own storage, and configure its returned origin/project ID before deployment. No owner credentials or iOS source are included.\n")

skills_archive = output / "sayso-skills-source.zip"
with zipfile.ZipFile(skills_archive, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((plugin / "skills").rglob("*")):
        if path.is_file() and not path.is_symlink():
            archive.writestr(path.relative_to(plugin).as_posix(), sanitized(path))
    archive.writestr("INSTALL.txt", "Skill source only, not a standalone installable plugin. Sites creates the canonical plugin for your new Site. Read that plugin's own manifests, preserve its App binding and identity, and overlay these skills using the supported update-plugin workflow. Never copy another owner's .app.json or create a duplicate Site wrapper. When upgrading, remove the old SaySo-owned skills/sayso-control/references/compatibility.md and google-maps-live.md through the supported plugin file-deletion workflow, if present; an overlay alone does not remove them. Preserve unrelated user files.\n")

reports = []
for path in [source_archive, skills_archive]:
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert all(not name.startswith(("/", "../")) and "/../" not in name for name in names)
        assert all(".app.json" not in name and ".codex-plugin/" not in name for name in names)
        for name in names:
            data = archive.read(name)
            assert private_origin.encode() not in data, name
            if private_project:
                assert private_project.encode() not in data, name
        reports.append({"archive": path.name, "files": len(names), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(output / "manifest.json").write_text(json.dumps({"published": False, "fresh_account_deployment_tested": False, "ios_included": False, "archives": reports}, indent=2) + "\n")
print(json.dumps(reports))
