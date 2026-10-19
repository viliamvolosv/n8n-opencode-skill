#!/usr/bin/env python3
"""Check the OpenCode pack, references, examples and upstream snapshot coverage."""
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

import yaml

ROOT = Path(__file__).resolve().parents[1]


def outside_fences(text):
    fence = None
    for line in text.splitlines():
        marker = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if marker:
            value = marker.group(1)
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence) and not marker.group(2).strip():
                fence = None
            continue
        if fence is None:
            yield line


def validate():
    errors = []
    skills = ROOT / "skills"
    names = set()
    for path in sorted(skills.glob("*/SKILL.md")):
        text = path.read_text()
        match = re.match(r"^---\n(.*?)\n---\n(.+)$", text, re.S)
        if not match:
            errors.append(f"{path}: missing frontmatter or body")
            continue
        try:
            header = yaml.safe_load(match[1])
        except yaml.YAMLError as exc:
            errors.append(f"{path}: {exc}")
            continue
        if not isinstance(header, dict):
            errors.append(f"{path}: frontmatter must be a mapping")
            continue
        unknown = set(header) - {"name", "description", "license", "compatibility", "metadata"}
        if unknown:
            errors.append(f"{path}: unsupported fields {unknown}")
        name = header.get("name")
        if (not isinstance(name, str) or not 1 <= len(name) <= 64
                or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name)
                or name != path.parent.name or name in names):
            errors.append(f"{path}: invalid, duplicate or mismatched name")
        else:
            names.add(name)
        description = header.get("description")
        if not isinstance(description, str) or not 1 <= len(description) <= 1024:
            errors.append(f"{path}: description must contain 1–1024 characters")
        if header.get("compatibility") != "OpenCode V2 (2.x); OpenCode V1 is not supported.":
            errors.append(f"{path}: missing V2-only compatibility declaration")
        metadata = header.get("metadata", {})
        if not isinstance(metadata, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in metadata.items()):
            errors.append(f"{path}: metadata must be a string-to-string map")

    # Check actual prose links, not example Markdown embedded in code blocks.
    docs = [ROOT / "README.md", *skills.rglob("*.md"), * (ROOT / "examples").glob("*.md")]
    for path in docs:
        text = "\n".join(outside_fences(path.read_text()))
        prose = re.sub(r"`[^`\n]*`", "", text)
        for link in re.findall(r"\[[^\]]*\]\(([^\s)]+)(?:[^)]*)\)", prose):
            if ":" in link or link.startswith("#"):
                continue
            target = path.parent / unquote(link.split("#")[0])
            if not target.exists():
                errors.append(f"{path.relative_to(ROOT)}: missing link {link}")
        # Inline skill names are used as load targets throughout the router.
        for name in re.findall(r"`((?:n8n-|using-n8n-)[a-z0-9-]+)`", text):
            if name in {"n8n-mcp", "n8n-skills", "n8n-mcp-skills"}:
                continue
            if path.parent.name == "using-n8n-mcp-skills" and name not in names:
                errors.append(f"{path.relative_to(ROOT)}: missing specialist {name}")

    manifest = json.loads((ROOT / "upstream.json").read_text())
    actual = {str(path.relative_to(skills)) for path in skills.rglob("*") if path.is_file()}
    expected = set(manifest["source_sha256"])
    if actual != expected:
        errors.append(f"Snapshot coverage: missing={expected - actual}, extra={actual - expected}")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest["commit"]):
        errors.append("Invalid upstream commit")
    evaluations = ROOT / "tests/evaluations/upstream"
    evaluation_hashes = {str(p.relative_to(evaluations)): hashlib.sha256(p.read_bytes()).hexdigest()
                         for p in evaluations.glob("*/*.json")}
    if evaluation_hashes != manifest.get("evaluation_sha256"):
        errors.append("Upstream evaluation snapshot hash/coverage mismatch")
    if not names:
        errors.append("No skills found")
    examples = [ROOT / "opencode.json.example", ROOT / "opencode.json.mcp-in-docker.example"]
    for path in examples:
        config = json.loads(path.read_text())
        server = config["mcp"]["servers"]["n8n-mcp"]
        if server["type"] != "local" or not isinstance(server["command"], list):
            errors.append(f"{path}: invalid local MCP configuration")
        if "enabled" in server or not isinstance(server["timeout"], dict):
            errors.append(f"{path}: V1 fields in V2 configuration")
        if server["environment"]["N8N_API_KEY"] != "{env:N8N_API_KEY}":
            errors.append(f"{path}: credential must come from environment")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(names)} skills, {len(actual)} snapshot files, documentation links and {len(examples)} V2 config examples")
    return 0


if __name__ == "__main__":
    raise SystemExit(validate())
