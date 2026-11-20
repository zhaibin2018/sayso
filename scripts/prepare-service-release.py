"""Create the owner-neutral release from pinned Git objects, never working files.

Local packaging only. No network, deployment, plugin or device operations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

WORKER = "f654165f7fae443ce219bfa21e1177913744bb15"
PLUGIN = "6347afc3535caed18366b343e2919290d96dcfa7"
VERSION = "0.13.256"
OMITTED = "tests/fixtures/app-current-action-capabilities.swift.txt"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def snapshot(repo, ref):
    tree = subprocess.check_output(["git", "-C", str(repo), "ls-tree", "-r", "-z", ref])
    entries = []
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        header, name = entry.split(b"\t", 1)
        mode, kind, oid = header.split()
        if kind != b"blob" or mode not in {b"100644", b"100755"}:
            raise ValueError("Only regular Git files may be exported")
        entries.append((name.decode(), oid))
    raw = subprocess.check_output(["git", "-C", str(repo), "cat-file", "--batch"],
                                  input=b"\n".join(oid for _, oid in entries) + b"\n")
    files, offset = {}, 0
    for name, _ in entries:
        end = raw.index(b"\n", offset)
        size = int(raw[offset:end].split()[-1])
        files[name] = raw[end + 1:end + 1 + size]
        offset = end + 2 + size
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", type=Path, required=True)
    parser.add_argument("--plugin", type=Path, required=True)
    parser.add_argument("--output", type=Path, help="Optional fresh local staging directory")
    args = parser.parse_args()
    public = Path(__file__).resolve().parents[1]
    output = args.output.resolve() if args.output else public / "release/service" / ("v" + VERSION)
    if output.exists():
        raise SystemExit("Release already exists; refuse to overwrite a versioned package")
    worker = snapshot(args.worker, WORKER)
    plugin = snapshot(args.plugin, PLUGIN)
    baseline_files = snapshot(public, "HEAD")
    hosting = json.loads(worker[".openai/hosting.json"])
    project = hosting.pop("project_id")
    origin = re.search(rb'publicOrigin\s*=\s*"([^"]+)"', worker["lib/bridge-runtime.ts"]).group(1)
    # Collect exact owner identities without writing or printing their values.
    identities = {origin, project.encode()}
    for data in [*worker.values(), *plugin.values()]:
        identities.update(re.findall(rb"(?:appgprj_|plugin_asdk_app_sites_|dev-)[0-9a-f]{20,}", data))
        identities.update(re.findall(rb"https://[a-zA-Z0-9.-]+\.chatgpt\.site", data))
    identities.discard(b"https://YOUR-SITE.chatgpt.site")

    def neutral(data):
        if b"\0" in data:
            return data
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return data
        for value in sorted(identities, key=len, reverse=True):
            replacement = (b"https://YOUR-SITE.chatgpt.site" if value.startswith(b"https://")
                           else b"YOUR_NEW_SITES_PROJECT_ID" if value.startswith(b"appgprj_")
                           else b"YOUR_OWN_SITE_PLUGIN")
            data = data.replace(value, replacement)
        return data

    output.mkdir(parents=True)
    provenance = []
    comparison = {}
    for label, files, prefix in [("worker", worker, "mcp"), ("plugin", plugin, "plugins/sayso")]:
        counts = {"identical": 0, "changed": 0, "added": 0, "removed": 0}
        changes = []
        selected = {}
        for name, original in sorted(files.items()):
            if label == "plugin" and not (name.startswith("skills/") or name == "plugin.json"):
                continue
            if label == "worker" and name == OMITTED:
                continue  # Native App implementation snippet is outside the distribution boundary.
            data = (json.dumps(hosting, indent=2) + "\n").encode() if name == ".openai/hosting.json" else neutral(original)
            if label == "worker" and name == ".gitattributes":
                data = b"# Preserve pinned distribution bytes across Windows and Unix checkouts.\n* -text\n*.png binary\n*.jpg binary\n*.jpeg binary\n"
            if label == "plugin" and name == "plugin.json":
                presentation = json.loads(original)
                presentation["name"] = "sayso"
                presentation["extensions"]["com.openai"].pop("apps", None)
                data = (json.dumps(presentation, indent=2, ensure_ascii=False) + "\n").encode()
            if any(value in data for value in identities):
                raise SystemExit("Owner identity remains in a source file; values suppressed")
            target = output / prefix / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            relative = f"{prefix}/{name}"
            selected[relative] = data
            provenance.append({"path": relative, "source": label, "source_path": name,
                               "upstream_sha256": digest(original),
                               "transformation": "distribution-byte-preservation" if label == "worker" and name == ".gitattributes" else "owner-neutral-plugin-presentation" if label == "plugin" and name == "plugin.json" else "owner-binding-neutralization" if data != original else "none"})
            baseline = baseline_files.get(relative)
            status = "added" if baseline is None else "identical" if neutral(baseline) == data else "changed"
            counts[status] += 1
            if status != "identical":
                changes.append({"path": relative, "change": status})
        for relative in sorted(name for name in baseline_files if name.startswith(prefix + "/")):
            if label == "plugin" and not (relative.startswith(prefix + "/skills/") or relative == prefix + "/plugin.json"):
                continue
            if relative not in selected:
                counts["removed"] += 1
                changes.append({"path": relative, "change": "removed"})
        comparison[label] = {"counts": counts, "changes": changes,
                             "comparison": "owner-neutral bytes against existing public checkout; includes packaging differences"}
    old = json.loads((public / "SOURCE_MANIFEST.json").read_text())
    comparison["baseline"] = {"repository": "https://github.com/zhaibin2018/sayso",
                              "commit": subprocess.check_output(["git", "-C", str(public), "rev-parse", "HEAD"], text=True).strip(),
                              "mcpRuntime": old["mcpRuntime"], "skillSourceVersion": old["skillSourceVersion"]}
    (output / "SOURCE_DIFF.json").write_text(json.dumps(comparison, indent=2) + "\n", encoding="utf-8", newline="\n")
    (output / "PROVENANCE.json").write_text(json.dumps({"worker_commit": WORKER, "plugin_commit": PLUGIN,
        "files": provenance, "exclusions": ["plugin account/App manifests (.app.json, .codex-plugin/plugin.json); plugin.json is presentation-only with neutral name and no apps dependency",
        OMITTED], "note": "Service logic is unchanged. Owner identities are neutralized; distribution Git attributes preserve exact bytes; the native Swift snippet is excluded. TypeScript protocol fixtures and synthetic firmware-info JSON are test data, not native App/firmware source."}, indent=2) + "\n", encoding="utf-8", newline="\n")
    for name in ["LICENSE.md", "LICENSE_DETAILS.md", "TRADEMARK.md", "CONTRIBUTING.md"]:
        (output / name).write_bytes((public / name).read_bytes())
    print(json.dumps({"release": str(output), "upstream_files": len(provenance),
                      "changed_by_neutralization": sum(f["transformation"] != "none" for f in provenance),
                      "comparison_counts": {k: v["counts"] for k, v in comparison.items() if k != "baseline"}}))


if __name__ == "__main__":
    main()
