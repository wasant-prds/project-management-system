#!/usr/bin/env python3
"""Preview or upsert GitHub labels from the # labels section of a Markdown catalog.

Python 3.10+, standard library only. Labels that share the text before "::"
use one color. See document/github-create-labels.md.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT / "scripts/github/.env"
DEFAULT_CATALOG = ROOT / "design/work_items.md"
# Keep this allow-list aligned with github-create-tasks.py so both scripts read one .env file.
CONFIG_KEYS = {
    "GITHUB_URL",
    "GITHUB_REPO",
    "GITHUB_TOKEN",
    "GITHUB_ASSIGNEE",
    "GITHUB_ASSIGNEE_SA",
    "GITHUB_ASSIGNEE_INFRA",
    "GITHUB_ASSIGNEE_DEVELOPER",
    "GITHUB_ASSIGNEE_DEVELOPER_INFRA",
    "GITHUB_ASSIGNEE_DEVELOPER_DATA_MIGRATION",
}
# One color per prefix. Every priority::* label uses the priority color, and the other groups do the same.
COLORS = {
    "priority": "D93F0B",
    "role": "5319E7",
    "status": "0E8A16",
    "type": "1D76DB",
}
NAME_LIMIT = 50
DESCRIPTION_LIMIT = 100
NAME = r"[A-Za-z][A-Za-z0-9-]*::[A-Za-z0-9][A-Za-z0-9-]*"
SEPARATORS = ("→", "-")
SECTION = "# labels"


class LabelError(Exception):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Label:
    name: str
    prefix: str
    color: str
    description: str


def read_config(path: Path) -> dict[str, str]:
    """Read literal KEY=value settings without executing/interpolating values."""
    if not path.exists():
        return {}
    config = {}
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"(?:export\s+)?([A-Z_]+)\s*=\s*(.*)", line)
        if not match or match[1] not in CONFIG_KEYS or match[1] in config:
            raise LabelError(f"{path}, line {number}: expected one supported GITHUB_KEY=value setting (no duplicates)")
        key, value = match.groups()
        if value.startswith(("'", '"')):
            quote_char = value[0]
            quoted = re.fullmatch(rf"{quote_char}(.*?){quote_char}\s*(?:#.*)?", value)
            if not quoted:
                raise LabelError(f"{path}, line {number}: invalid quoted value")
            value = quoted[1]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        config[key] = value
    return config


def connection_settings(args, config: dict[str, str]) -> tuple[str, str, str]:
    def setting(key: str, explicit=None, default="") -> str:
        # Shell settings override the file, including explicitly empty values.
        value = explicit if explicit is not None else os.environ.get(key, config.get(key, default))
        return value.strip()

    url = setting("GITHUB_URL", args.url, "https://github.com")
    repo = setting("GITHUB_REPO", args.repo)
    token = setting("GITHUB_TOKEN")
    missing = [key for key, value in [("GITHUB_REPO", repo), ("GITHUB_TOKEN", token)] if not value]
    if missing:
        raise LabelError(f"GitHub connection: missing {', '.join(missing)}. Set them in {args.env_file} or the shell environment; --repo also sets GITHUB_REPO. Token needs permission to read and write issues.")
    return url, repo, token


def ensure_colors() -> None:
    invalid = [prefix for prefix, color in COLORS.items() if not re.fullmatch(r"[0-9A-F]{6}", color)]
    if invalid or len(set(COLORS.values())) != len(COLORS):
        raise LabelError("COLORS must give each prefix its own 6-digit hex color")


def parse_label_line(line: str) -> tuple[str, str] | None:
    """Return name and description. An optional emoji token may sit between them."""
    matched = re.fullmatch(rf"({NAME})\s+(.+)", line.strip())
    if not matched:
        return None
    name, rest = matched[1], matched[2]
    mark, space, tail = rest.partition(" ")
    if mark in SEPARATORS and space == " ":
        description = tail.strip()
    elif space == " " and any(ord(char) > 127 for char in mark):
        symbol, symbol_space, description = tail.partition(" ")
        if symbol not in SEPARATORS or symbol_space != " ":
            return None
        description = description.strip()
    else:
        return None
    if not description:
        return None
    return name, description


def read_labels(path: Path) -> list[Label]:
    ensure_colors()
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    starts = [index for index, line in enumerate(lines) if line.strip() == SECTION]
    if len(starts) != 1:
        raise LabelError(f"{path}: expected exactly one {SECTION!r} section")
    labels = []
    seen = set()
    for number, line in enumerate(lines[starts[0] + 1 :], starts[0] + 2):
        if line.startswith("#"):
            break
        if not line.strip():
            continue
        parsed = parse_label_line(line)
        if parsed is None:
            raise LabelError(f"{path}, line {number}: expected 'prefix::name → description'")
        name, description = parsed
        prefix = name.split("::", 1)[0]
        if len(name) > NAME_LIMIT:
            raise LabelError(f"{path}, line {number}: {name} exceeds GitHub's {NAME_LIMIT} character name limit")
        if len(description) > DESCRIPTION_LIMIT:
            raise LabelError(f"{path}, line {number}: {name} description has {len(description)} characters; GitHub allows {DESCRIPTION_LIMIT}")
        if prefix not in COLORS:
            known = ", ".join(COLORS)
            raise LabelError(f"{path}, line {number}: no shared color for prefix {prefix!r}. Known prefixes: {known}")
        if name in seen:
            raise LabelError(f"{path}, line {number}: duplicate label {name}")
        seen.add(name)
        labels.append(Label(name, prefix, COLORS[prefix], description))
    if not labels:
        raise LabelError(f"{path}: {SECTION!r} section is empty")
    return labels


class NoRedirect(HTTPRedirectHandler):
    # Keep the token on the explicitly configured host.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def split_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/")
    if len(parts) != 2 or not all(parts) or any(char.isspace() or char in "\\?#@:" for char in repo) or parts[1].lower().endswith(".git"):
        raise LabelError("GITHUB_REPO / --repo must be owner/name without .git")
    return parts[0], parts[1]


def api_base(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise LabelError("--url must be an HTTPS GitHub base URL without credentials/query/fragment")
    host = (parsed.hostname or "").lower()
    if host == "api.github.com":
        raise LabelError("--url must be https://github.com; the script derives the API host")
    if host in {"github.com", "www.github.com"}:
        return "https://api.github.com"
    return f"{parsed.scheme}://{parsed.netloc}/api/v3"


def next_page(headers, page: int) -> int | None:
    link = headers.get("Link") or ""
    for part in link.split(","):
        if 'rel="next"' not in part:
            continue
        match = re.search(r"[?&]page=(\d+)", part)
        if not match:
            raise LabelError("GitHub pagination link has no page number")
        following = int(match[1])
        if following <= page:
            raise LabelError("GitHub pagination link did not advance")
        return following
    return None


def normalize_label(label: dict) -> dict:
    name = label.get("name")
    if not isinstance(name, str) or not name:
        raise LabelError("GitHub label response has no name")
    color = str(label.get("color") or "").removeprefix("#").lower()
    if not re.fullmatch(r"[0-9a-f]{6}", color):
        raise LabelError(f"GitHub label {name}: color {label.get('color')!r} is not a 6-digit hex code")
    description = label.get("description") or ""
    if not isinstance(description, str):
        raise LabelError(f"GitHub label {name}: description is not text")
    return {"name": name, "color": color, "description": description}


class GitHub:
    def __init__(self, url: str, repo: str, token: str):
        if not token or token in url or token in repo:
            raise LabelError("GitHub token must be a non-empty value and must not be embedded in the URL or repository")
        owner, name = split_repo(repo)
        self.base = api_base(url)
        self.repo_path = "/repos/" + quote(owner, safe="") + "/" + quote(name, safe="")
        self.token = token
        self.opener = build_opener(NoRedirect())

    def request(self, method: str, path: str, *, params=None, payload=None):
        url = self.base + path
        if params:
            url += "?" + urlencode(params)
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "project-management-system-github-create-labels",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = Request(url, data=data, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
                return (json.loads(raw) if raw else {}), response.headers
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            message = f"GitHub {method} {path}: HTTP {exc.code}: {detail[:1000]}"
            raise LabelError(message.replace(self.token, "[REDACTED]"), status=exc.code) from exc
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            # A timeout may occur after a write succeeded. Do not retry writes.
            message = f"GitHub {method} {path} failed ({type(exc).__name__}). Check GitHub before rerunning; writes are never retried automatically."
            raise LabelError(message.replace(self.token, "[REDACTED]")) from exc

    def paginate(self, path: str) -> list:
        results = []
        page = 1
        while page <= 100:
            batch, headers = self.request("GET", path, params={"per_page": 100, "page": page})
            if not isinstance(batch, list):
                raise LabelError(f"GitHub {path}: expected a list response")
            results.extend(batch)
            following = next_page(headers, page)
            if not following:
                return results
            page = following
        raise LabelError("GitHub label list exceeded 100 pages")

    def repository(self) -> dict:
        repo, _ = self.request("GET", self.repo_path)
        if not isinstance(repo, dict):
            raise LabelError("GitHub repository response was not an object")
        return repo

    def list_labels(self) -> dict[str, dict]:
        found = {}
        for item in (normalize_label(label) for label in self.paginate(self.repo_path + "/labels")):
            if item["name"] in found:
                raise LabelError(f"GitHub returned duplicate label {item['name']}")
            found[item["name"]] = item
        return found

    def label(self, name: str) -> dict | None:
        try:
            found, _ = self.request("GET", self.repo_path + "/labels/" + quote(name, safe=""))
        except LabelError as exc:
            if exc.status != 404:
                raise
            return None
        return normalize_label(found)


def action_for(label: Label, existing: dict | None) -> str:
    if existing is None:
        return "create"
    if existing["color"] == label.color.lower() and existing["description"] == label.description:
        return "unchanged"
    return "update"


def plan_row(label: Label, existing: dict | None) -> dict:
    return {
        "action": action_for(label, existing),
        "name": label.name,
        "prefix": label.prefix,
        "color": label.color,
        "description": label.description,
        "before": None if existing is None else {"color": existing["color"], "description": existing["description"]},
    }


def catalog_rows(labels: list[Label]) -> list[dict]:
    return [plan_row(label, None) | {"action": "catalog", "before": None} for label in labels]


def print_catalog(labels: list[Label]) -> None:
    print(f"PREVIEW (offline; no GitHub requests): {len(labels)} label(s)", flush=True)
    prefix = None
    for label in labels:
        if label.prefix != prefix:
            prefix = label.prefix
            print(f"\n{prefix} #{label.color}", flush=True)
        print(f"  {label.name} | {label.description}", flush=True)


def print_actions(actions: list[dict], *, apply: bool) -> None:
    counts = Counter(action["action"] for action in actions)
    mode = "APPLY" if apply else "UPSERT preview"
    print(
        f"{mode}: {len(actions)} label(s); create {counts['create']}, update {counts['update']}, unchanged {counts['unchanged']}",
        flush=True,
    )
    for action in actions:
        print(f"{action['action'].upper()} {action['name']} | {action['prefix']} | #{action['color']} | {action['description']}", flush=True)
        before = action["before"]
        if action["action"] != "update" or not before:
            continue
        if before["color"] != action["color"].lower():
            print(f"  color #{before['color']} -> #{action['color']}", flush=True)
        if before["description"] != action["description"]:
            print(f"  description: {before['description']}", flush=True)
            print(f"            -> {action['description']}", flush=True)


def same_label(got: dict, label: Label) -> bool:
    return got["name"] == label.name and got["color"] == label.color.lower() and got["description"] == label.description


def sync(api: GitHub, labels: list[Label], *, apply: bool, save_plan=None) -> list[dict]:
    repo = api.repository()
    if repo.get("archived") or repo.get("has_issues") is False:
        raise LabelError("Repository is archived or has issues disabled")
    current = api.list_labels()
    actions = [plan_row(label, current.get(label.name)) for label in labels]
    if save_plan:
        save_plan(actions)
    print_actions(actions, apply=apply)
    if not apply:
        return actions
    for label, action in zip(labels, actions, strict=True):
        fresh = api.label(label.name)
        if action_for(label, fresh) != action["action"]:
            raise LabelError(f"{label.name}: label changed after the preview; rerun before writing. Remaining labels were not sent.")
        if action["action"] == "unchanged":
            continue
        if action["action"] == "create":
            result, _ = api.request("POST", api.repo_path + "/labels", payload={"name": label.name, "color": label.color, "description": label.description})
        else:
            result, _ = api.request(
                "PATCH",
                api.repo_path + "/labels/" + quote(label.name, safe=""),
                payload={"color": label.color, "description": label.description},
            )
        if not same_label(normalize_label(result), label):
            raise LabelError(f"GitHub write for {label.name} completed but the returned name, color, or description differs. Remaining labels were not sent.")
    print("Done.")
    return actions


def write_output(path: Path, data: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="Markdown file whose # labels section is the catalog")
    parser.add_argument("--create", action="store_true", help="Create missing labels and update color/description to the catalog")
    parser.add_argument("--upsert", action="store_true", help="Read GitHub and preview create/update/unchanged; add --create to apply")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="GitHub settings file; default: scripts/github/.env")
    parser.add_argument("--url", help="GitHub HTTPS site URL; overrides shell/file settings. Default: https://github.com")
    parser.add_argument("--repo", help="owner/name; overrides shell/file settings")
    parser.add_argument("--output", type=Path, help="Save the catalog or upsert plan as UTF-8 JSON (no credentials)")
    args = parser.parse_args(argv)
    try:
        labels = read_labels(args.catalog.resolve())
        protected = {args.catalog.resolve(), args.env_file.resolve(), DEFAULT_ENV_FILE.resolve()}
        if args.output and args.output.resolve() in protected:
            raise LabelError("--output must not overwrite the label catalog or GitHub settings")
        if not args.create and not args.upsert:
            if args.output:
                write_output(args.output, catalog_rows(labels))
            print_catalog(labels)
            return 0
        config = read_config(args.env_file)
        url, repo, token = connection_settings(args, config)
        save_plan = (lambda data: write_output(args.output, data)) if args.output else None
        sync(GitHub(url, repo, token), labels, apply=args.create, save_plan=save_plan)
        return 0
    except (LabelError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
