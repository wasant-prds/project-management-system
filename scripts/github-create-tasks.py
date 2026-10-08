#!/usr/bin/env python3
"""Preview, create, or upsert selected Markdown work items as GitHub issues.

Python 3.10+, standard library only. See document/github-create-tasks.md.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT / "scripts/github/.env"
DEFAULT_CHECKLIST = ROOT / "design/projects/project-management-system/work_items/00_checklist.md"
OWNER = "wasant-prds"
DEFAULT_ASSIGNEE_KEY = "GITHUB_ASSIGNEE"
# Role in Markdown -> (title prefix, assignee setting). Labels come from each file's **Labels** heading.
ROLES = {
    "SA": ("SA", "GITHUB_ASSIGNEE_SA"),
    "Infra": ("Infra", "GITHUB_ASSIGNEE_INFRA"),
    "Developer": ("Developer", "GITHUB_ASSIGNEE_DEVELOPER"),
    "Developer / Infra": ("Developer / Infra", "GITHUB_ASSIGNEE_DEVELOPER_INFRA"),
    "Developer / Data Migration": ("Developer / Data Migration", "GITHUB_ASSIGNEE_DEVELOPER_DATA_MIGRATION"),
}
ASSIGNEE_KEYS = {DEFAULT_ASSIGNEE_KEY, *(setting for _, setting in ROLES.values())}
CONFIG_KEYS = {"GITHUB_URL", "GITHUB_REPO", "GITHUB_TOKEN", *ASSIGNEE_KEYS}
LABEL_NAME = re.compile(r"[A-Za-z][A-Za-z0-9-]*::[A-Za-z0-9][A-Za-z0-9-]*")
MARKER = re.compile(r"<!--\s*github-issue:(\d+)\s*-->")
ENTRY = re.compile(r"^\s*-\s+\[([ xX])\]\s+\*\*#(\d+)\*\*\s+\[[^\]]+\]\(([^)]+)\)(?:\s+.*)?$")
TITLE = re.compile(r"^(?:\*\*Title(?:\s*\(required\))?:?\*\*|#{1,6}\s+Title(?:\s*\(required\))?:?)\s*$", re.I)
LOGIN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}")
REFERENCE = re.compile(r"(?<![\w&#/])#(\d+)\b")
CODE_SPAN = re.compile(r"(`+)(.+?)\1")
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
# GitHub autolinks #N even when backslash-escaped; a zero-width space between # and N renders as #N without a link.
UNLINKED_HASH = "#&#8203;"
REFERENCE_MODES = ("plain", "keep")
TITLE_ROLE = re.compile(r"^\[([^\]]+)\]\s+(.+)$", re.DOTALL)
# Short prefixes already used on GitHub name the same role as the canonical file prefix.
ROLE_ALIASES = {
    "sa": "SA",
    "infra": "Infra",
    "dev": "Developer",
    "developer": "Developer",
    "developer / infra": "Developer / Infra",
    "developer / data migration": "Developer / Data Migration",
}
TITLE_LIMIT = 256
BODY_LIMIT = 65536


class TaskError(Exception):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


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
            raise TaskError(f"{path}, line {number}: expected one supported GITHUB_KEY=value setting (no duplicates)")
        key, value = match.groups()
        if value.startswith(("'", '"')):
            quote_char = value[0]
            quoted = re.fullmatch(rf"{quote_char}(.*?){quote_char}\s*(?:#.*)?", value)
            if not quoted:
                raise TaskError(f"{path}, line {number}: invalid quoted value")
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
        raise TaskError(f"GitHub connection: missing {', '.join(missing)}. Set them in {args.env_file} or the shell environment; --repo also sets GITHUB_REPO. Token needs permission to read and write issues.")
    return url, repo, token


def valid_login(value: str, source: str) -> str:
    login = value.strip().lstrip("@")
    if not LOGIN.fullmatch(login):
        raise TaskError(f"{source} must be a GitHub login such as {OWNER}")
    return login


def role_assignees(config: dict[str, str], override: str | None = None) -> dict[str, str]:
    """CLI override, then role setting, then GITHUB_ASSIGNEE, then OWNER; an empty value falls back."""
    if override is not None:
        login = valid_login(override, "--assignee")
        return {role: login for role in ROLES}

    def setting(key: str) -> str:
        shell = os.environ.get(key, "").strip()
        return shell or config.get(key, "").strip()

    shared = setting(DEFAULT_ASSIGNEE_KEY)
    default = valid_login(shared, DEFAULT_ASSIGNEE_KEY) if shared else OWNER
    assignees = {}
    for role, (_, key) in ROLES.items():
        value = setting(key)
        assignees[role] = valid_login(value, key) if value else default
    return assignees


@dataclass(frozen=True)
class Entry:
    number: int
    path: Path
    section: str
    closed: bool


@dataclass(frozen=True)
class Task:
    planned_issue: int
    source: str
    title: str
    description: str
    assignee: str
    section: str
    marker: str
    labels: str
    closed: bool = False


def selection(value: str) -> list[int]:
    """Accept 39, 31-33, or #31-#33,39 in numeric order."""
    numbers = set()
    for part in value.replace("–", "-").replace("—", "-").split(","):
        match = re.fullmatch(r"\s*#?(\d+)\s*(?:-\s*#?(\d+))?\s*", part)
        if not match:
            raise TaskError(f"Invalid --issues segment: {part!r}; use 39 or 31-33,39")
        start = int(match[1])
        end = int(match[2] or start)
        if start < 1 or end < start or end - start > 10000:
            raise TaskError(f"Invalid issue range: {part!r}")
        numbers.update(range(start, end + 1))
    return sorted(numbers)


def number_mapping(value: str | None, numbers: list[int]) -> dict[int, int]:
    mapping = {}
    if value is None:
        return mapping
    for part in value.split(","):
        match = re.fullmatch(r"\s*#?(\d+)\s*=\s*#?(\d+)\s*", part)
        if not match:
            raise TaskError("--number-map must use planned=GitHub pairs, for example 39=120,38=119")
        planned, actual = map(int, match.groups())
        if planned not in numbers or planned in mapping or actual < 1 or actual in mapping.values():
            raise TaskError("--number-map requires selected planned numbers and unique positive GitHub issue numbers")
        mapping[planned] = actual
    return mapping


def read_checklist(path: Path) -> dict[int, Entry]:
    entries = {}
    section = None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("## "):
            section = line[3:].strip() or None
        match = ENTRY.fullmatch(line)
        if not match:
            continue
        number = int(match[2])
        if section is None or number in entries:
            raise TaskError(f"Checklist #{number}: missing section heading or duplicate entry")
        source = (path.parent / match[3]).resolve()
        if not source.is_relative_to(path.parent.resolve()) or source.suffix.lower() != ".md":
            raise TaskError(f"Checklist #{number}: file must be a Markdown file inside {path.parent}")
        entries[number] = Entry(number, source, section, match[1].lower() == "x")
    if not entries:
        raise TaskError(f"No work item entries found in {path}")
    return entries


def metadata(text: str, name: str, *, required: bool) -> str | None:
    matches = re.findall(rf"^\*\*{re.escape(name)}:\*\*\s*(.+)$", text, re.M)
    if len(matches) > 1 or (required and len(matches) != 1):
        raise TaskError(f"Expected exactly one **{name}:** field before Title")
    return matches[0].strip() if matches else None


def label_block(name: str, lines: list[str]) -> tuple[int, int, list[str]]:
    """Return the **Labels** heading span and its names. End is the first line after the block."""
    headings = [index for index, line in enumerate(lines) if line.strip() == "**Labels**"]
    if len(headings) != 1:
        raise TaskError(f"{name}: expected exactly one **Labels** heading")
    found = []
    index = headings[0] + 1
    started = False
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            if started:
                break
            index += 1
            continue
        if line.strip().startswith(("**", "#")):
            break
        item = re.fullmatch(r"\s*[-*]\s+(\S+)\s*", line)
        if item is None or not LABEL_NAME.fullmatch(item[1]):
            raise TaskError(f"{name}: **Labels** entries must be bullet items such as '- type::feature'")
        if item[1] in found:
            raise TaskError(f"{name}: duplicate label {item[1]}")
        found.append(item[1])
        started = True
        index += 1
    if not found:
        raise TaskError(f"{name}: **Labels** needs at least one label")
    return headings[0], index, found


def description_lines(lines: list[str], *, title_heading: int, title_text: int, label_start: int, label_end: int) -> list[str]:
    """Drop Role, Labels, and Title. Those values are already the GitHub title, labels, and role prefix."""
    skip = set(range(label_start, label_end))
    skip.add(title_heading)
    skip.update(range(title_heading + 1, title_text + 1))
    for index, line in enumerate(lines):
        if re.fullmatch(r"\*\*Role:\*\*\s+\S.*", line.strip()):
            skip.add(index)
    kept = []
    previous_blank = True
    for index, line in enumerate(lines):
        if index in skip:
            continue
        if not line.strip():
            if previous_blank:
                continue
            kept.append("")
            previous_blank = True
            continue
        kept.append(line)
        previous_blank = False
    while kept and kept[-1] == "":
        kept.pop()
    return kept


def unlink_references(text: str) -> str:
    """Stop GitHub from linking planned #N numbers to unrelated GitHub issues; code stays literal."""
    lines, fence = [], None
    for line in text.split("\n"):
        opening = FENCE.match(line)
        if fence:
            if opening and opening[1][0] == fence[0] and len(opening[1]) >= len(fence):
                fence = None
            lines.append(line)
            continue
        if opening:
            fence = opening[1]
            lines.append(line)
            continue
        parts, last = [], 0
        for span in CODE_SPAN.finditer(line):
            parts.append(REFERENCE.sub(UNLINKED_HASH + r"\1", line[last:span.start()]))
            parts.append(span[0])
            last = span.end()
        parts.append(REFERENCE.sub(UNLINKED_HASH + r"\1", line[last:]))
        lines.append("".join(parts))
    return "\n".join(lines)


def read_task(entry: Entry, *, allow_closed: bool = False, assignees: dict[str, str] | None = None, references: str = "plain") -> Task:
    if entry.closed and not allow_closed:
        raise TaskError(f"#{entry.number} is checked [x] in the checklist; add --include-closed to create closed work")
    raw = entry.path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.splitlines()
    headings = [i for i, line in enumerate(lines) if TITLE.fullmatch(line)]
    if len(headings) != 1:
        raise TaskError(f"{entry.path.name}: expected exactly one Title heading")
    header = headings[0]
    meta = "\n".join(lines[:header])
    issue = metadata(meta, "Issue", required=False)
    if issue is not None and issue != f"#{entry.number}":
        raise TaskError(f"{entry.path.name}: Issue does not match checklist #{entry.number}")
    label_start, label_end, labels = label_block(entry.path.name, lines)
    role = metadata(meta, "Role", required=True)
    if role not in ROLES:
        raise TaskError(f"{entry.path.name}: unsupported Role {role!r}; expected {', '.join(ROLES)}")
    title_line = header + 1
    while title_line < len(lines) and not lines[title_line].strip():
        title_line += 1
    if title_line == len(lines) or lines[title_line].startswith(("**", "#")):
        raise TaskError(f"{entry.path.name}: missing title text")
    title = f"[{ROLES[role][0]}] {lines[title_line].strip()}"
    if len(title) > TITLE_LIMIT:
        raise TaskError(f"{entry.path.name}: title exceeds GitHub's {TITLE_LIMIT} character limit")
    if not "\n".join(lines[title_line + 1:]).strip():
        raise TaskError(f"{entry.path.name}: missing description below title")
    marker = f"<!-- github-issue:{entry.number} -->"
    own = re.compile(rf"<!--\s*github-issue:{entry.number}\s*-->")
    body = description_lines(lines, title_heading=header, title_text=title_line, label_start=label_start, label_end=label_end)
    text = "\n".join(line for line in body if not own.fullmatch(line.strip())).strip()
    if MARKER.search(text):
        raise TaskError(f"{entry.path.name}: remove the github-issue marker from the Markdown; the script appends its own marker")
    if references == "plain":
        text = unlink_references(text)
    elif references != "keep":
        raise TaskError(f"--references must be one of {', '.join(REFERENCE_MODES)}")
    description = f"{text}\n\n{marker}\n"
    if len(description) > BODY_LIMIT:
        raise TaskError(f"{entry.path.name}: description exceeds GitHub's {BODY_LIMIT} character limit")
    assignee = (assignees or {}).get(role, OWNER)
    return Task(entry.number, str(entry.path), title, description, assignee, entry.section, marker, ",".join(labels), entry.closed)


class NoRedirect(HTTPRedirectHandler):
    # Keep the token on the explicitly configured host.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def split_repo(repo: str) -> tuple[str, str]:
    parts = repo.split("/")
    if len(parts) != 2 or not all(parts) or any(char.isspace() or char in "\\?#@:" for char in repo) or parts[1].lower().endswith(".git"):
        raise TaskError("GITHUB_REPO / --repo must be owner/name without .git")
    return parts[0], parts[1]


def api_base(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise TaskError("--url must be an HTTPS GitHub base URL without credentials/query/fragment")
    host = (parsed.hostname or "").lower()
    if host == "api.github.com":
        raise TaskError("--url must be https://github.com; the script derives the API host")
    if host in {"github.com", "www.github.com"}:
        return "https://api.github.com"
    return f"{parsed.scheme}://{parsed.netloc}/api/v3"


def next_page(headers) -> int | None:
    link = headers.get("Link") or ""
    for part in link.split(","):
        if 'rel="next"' not in part:
            continue
        match = re.search(r"[?&]page=(\d+)", part)
        if not match:
            raise TaskError("GitHub pagination link has no page number")
        return int(match[1])
    return None


def label_names(issue: dict) -> list[str]:
    return [label.get("name") if isinstance(label, dict) else str(label) for label in issue.get("labels") or []]


def assignee_logins(issue: dict) -> list[str]:
    return [user.get("login") if isinstance(user, dict) else str(user) for user in issue.get("assignees") or []]


def is_pull_request(issue: dict) -> bool:
    return bool(issue.get("pull_request"))


def normalize_issue(issue: dict) -> dict:
    return {
        "id": issue.get("id"),
        "number": issue.get("number"),
        "title": issue.get("title"),
        "body": issue.get("body") or "",
        "labels": label_names(issue),
        "assignees": [{"login": login} for login in assignee_logins(issue)],
        "state": issue.get("state"),
        "html_url": issue.get("html_url") or issue.get("web_url"),
        "updated_at": issue.get("updated_at"),
        "pull_request": issue.get("pull_request"),
    }


class GitHub:
    def __init__(self, url: str, repo: str, token: str):
        if not token or token in url or token in repo:
            raise TaskError("GitHub token must be a non-empty value and must not be embedded in the URL or repository")
        owner, name = split_repo(repo)
        self.base = api_base(url)
        self.repo_path = "/repos/" + quote(owner, safe="") + "/" + quote(name, safe="")
        self.token = token
        self.opener = build_opener(NoRedirect())
        self._issues: list[dict] | None = None

    def request(self, method: str, path: str, *, params=None, payload=None):
        url = self.base + path
        if params:
            url += "?" + urlencode(params)
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "project-management-system-github-create-tasks",
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
            raise TaskError(message.replace(self.token, "[REDACTED]"), status=exc.code) from exc
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            # A timeout may occur after a write succeeded. Do not retry writes.
            message = f"GitHub {method} {path} failed ({type(exc).__name__}). Check GitHub before rerunning; writes are never retried automatically."
            raise TaskError(message.replace(self.token, "[REDACTED]")) from exc

    def forget_issues(self) -> None:
        self._issues = None

    def paginate(self, path: str, **params) -> list:
        results = []
        page = 1
        while True:
            batch, headers = self.request("GET", path, params={**params, "per_page": 100, "page": page})
            if not isinstance(batch, list):
                raise TaskError(f"GitHub {path}: expected a list response")
            results.extend(batch)
            following = next_page(headers)
            if not following:
                return results
            page = following

    def all_issues(self, *, fresh: bool = False) -> list[dict]:
        # One listing serves the whole plan; writes and pre-write checks read again.
        if fresh or self._issues is None:
            self._issues = [normalize_issue(issue) for issue in self.paginate(self.repo_path + "/issues", state="all")]
        return self._issues

    def duplicates(self, task: Task, *, fresh: bool = False) -> list[dict]:
        matches = {}
        number = str(task.planned_issue)
        for issue in self.all_issues(fresh=fresh):
            body = issue.get("body") or ""
            if number in MARKER.findall(body) or same_work(task.title, issue.get("title")):
                matches[issue.get("id") or issue.get("number")] = issue
        return list(matches.values())

    def find_issue(self, task: Task, mapped_number: int | None = None, *, fresh: bool = False) -> dict | None:
        issues = self.all_issues(fresh=fresh)
        marked = [issue for issue in issues if str(task.planned_issue) in MARKER.findall(issue.get("body") or "")]
        if mapped_number is not None:
            if any(issue.get("number") != mapped_number for issue in marked):
                raise TaskError(f"Planned #{task.planned_issue}: --number-map conflicts with the existing marker")
            try:
                issue, _ = self.request("GET", f"{self.repo_path}/issues/{mapped_number}")
            except TaskError as exc:
                if exc.status != 404:
                    raise
                raise TaskError(f"GitHub #{mapped_number} was not found (HTTP 404) for planned #{task.planned_issue}. Check the number and that the token can read this repository's issues; refusing to create a replacement", status=404) from exc
            issue = normalize_issue(issue)
        else:
            # The planned number is the original issue, even when its title wording still differs.
            # A later copy that only carries the marker must not replace it.
            numbered = [issue for issue in issues if issue.get("number") == task.planned_issue]
            titled = [issue for issue in issues if same_work(task.title, issue.get("title"))]
            selected_by_marker = False
            if len(numbered) == 1:
                chosen = numbered[0]
            elif len(marked) > 1:
                raise TaskError(f"Planned #{task.planned_issue}: multiple GitHub issues contain this marker; resolve duplicates before upsert")
            elif len(marked) == 1:
                chosen = marked[0]
                selected_by_marker = True
            elif len(titled) > 1:
                raise TaskError(f"Planned #{task.planned_issue}: multiple GitHub issues match the title; use --number-map")
            elif len(titled) == 1:
                chosen = titled[0]
            else:
                return None
            issue, _ = self.request("GET", f"{self.repo_path}/issues/{chosen['number']}")
            issue = normalize_issue(issue)
            if selected_by_marker and str(task.planned_issue) not in MARKER.findall(issue.get("body") or ""):
                raise TaskError(f"Planned #{task.planned_issue}: identity changed while looking up the issue; use --number-map")
        if is_pull_request(issue):
            raise TaskError(f"GitHub #{issue['number']}: expected an issue; refusing to update a pull request")
        markers = set(MARKER.findall(issue.get("body") or ""))
        if markers and markers != {str(task.planned_issue)}:
            raise TaskError(f"GitHub #{issue['number']}: marker belongs to another planned issue; refusing upsert")
        return issue


def preflight(api: GitHub, tasks: list[Task]) -> tuple[dict, dict[str, str]]:
    # Validate the whole selected batch before the first write.
    api.forget_issues()
    repo, _ = api.request("GET", api.repo_path)
    if repo.get("archived") or repo.get("has_issues") is False:
        raise TaskError("Repository is archived or has issues disabled")
    labels = api.paginate(api.repo_path + "/labels")
    active = {label.get("name") for label in labels}
    required = {label for task in tasks for label in task.labels.split(",")}
    missing = sorted(required - active)
    if missing:
        raise TaskError(f"Existing repository labels not found: {', '.join(missing)}; no label/issue created")
    by_login = {}
    for user in api.paginate(api.repo_path + "/assignees"):
        login = user.get("login") or ""
        key = login.lower()
        if not key or key in by_login:
            raise TaskError("Assignee list returned an empty or duplicate login")
        by_login[key] = login
    assignees = {}
    for login in sorted({task.assignee for task in tasks}):
        canonical = by_login.get(login.lower())
        if not canonical:
            raise TaskError(f"Assignee @{login} must be an assignable user on the repository")
        assignees[login] = canonical
    return repo, assignees


def create_payload(task: Task, assignee: str) -> dict:
    return {
        "title": task.title,
        "body": task.description,
        "labels": task.labels.split(","),
        "assignees": [assignee],
    }


def reject_pull_matches(task: Task, existing: list[dict]) -> None:
    pulls = [issue for issue in existing if is_pull_request(issue)]
    if pulls:
        numbers = ", ".join(f"#{issue.get('number')}" for issue in pulls)
        raise TaskError(f"Planned #{task.planned_issue}: matched pull request {numbers}; refusing to create or update it")


def post_issue(api: GitHub, task: Task, payload: dict, assignee: str) -> dict:
    """Create one issue, close it when the checklist is [x], and verify what GitHub returned."""
    result, _ = api.request("POST", api.repo_path + "/issues", payload=payload)
    result = normalize_issue(result)
    print(f"CREATED planned #{task.planned_issue} -> GitHub #{result.get('number')}: {result.get('html_url')}", flush=True)
    assigned = {login.lower() for login in assignee_logins(result)}
    if is_pull_request(result) or not set(task.labels.split(",")).issubset(result.get("labels", [])) or assignee.lower() not in assigned:
        raise TaskError("Issue was created but returned label/assignee differs from requested values. Inspect the printed URL; remaining issues were stopped. GitHub silently drops assignees the token cannot set.")
    if task.closed:
        closed, _ = api.request("PATCH", f"{api.repo_path}/issues/{result['number']}", payload={"state": "closed", "state_reason": "completed"})
        result = normalize_issue(closed)
        if result.get("state") != "closed":
            raise TaskError(f"GitHub #{result.get('number')} was created but is not closed. Close it manually; remaining issues were stopped.")
        print(f"CLOSED planned #{task.planned_issue} -> GitHub #{result.get('number')} (checklist [x])", flush=True)
    return result


def create_tasks(api: GitHub, tasks: list[Task]) -> None:
    repo, assignees = preflight(api, tasks)
    pending = []
    for task in tasks:
        existing = api.duplicates(task)
        reject_pull_matches(task, existing)
        if existing:
            print(f"SKIP planned #{task.planned_issue}: already exists: " + ", ".join(str(issue.get("html_url") or issue["number"]) for issue in existing), flush=True)
        else:
            pending.append(task)
    print(f"Target: {repo.get('html_url', api.repo_path)}; selected={len(tasks)}, new={len(pending)}", flush=True)
    for task in pending:
        # Recheck immediately before POST to reduce accidental rerun/race duplicates.
        existing = api.duplicates(task, fresh=True)
        reject_pull_matches(task, existing)
        if existing:
            print(f"SKIP planned #{task.planned_issue}: appeared during preflight", flush=True)
            continue
        post_issue(api, task, create_payload(task, assignees[task.assignee]), assignees[task.assignee])
    print("Done.")


def title_identity(title: str | None) -> tuple[str | None, str]:
    """Return the canonical role and the title text. [DEV] and [Developer] are one role."""
    text = (title or "").strip()
    match = TITLE_ROLE.fullmatch(text)
    if not match or not match[2].strip():
        return None, text
    raw = match[1].strip()
    return ROLE_ALIASES.get(raw.casefold(), raw.casefold()), match[2].strip()


def same_work(left: str | None, right: str | None) -> bool:
    left_role, left_stem = title_identity(left)
    right_role, right_stem = title_identity(right)
    return bool(left_stem) and left_stem == right_stem and left_role is not None and left_role == right_role


def description_text(value: str | None) -> str:
    return (value or "").replace("\r\n", "\n").replace("\r", "\n").rstrip("\n")


def update_changes(task: Task, issue: dict, assignee: str) -> tuple[dict, dict]:
    """Only send changed fields. Labels named in the file replace other labels in the same prefix."""
    payload, changes = {}, {}
    if issue.get("title") != task.title:
        payload["title"] = task.title
        changes["title"] = {"before": issue.get("title"), "after": task.title}
    if description_text(issue.get("body")) != description_text(task.description):
        payload["body"] = task.description
        changes["body"] = {"before": issue.get("body") or "", "after": task.description}
    current_logins = assignee_logins(issue)
    if sorted(login.lower() for login in current_logins) != [assignee.lower()]:
        payload["assignees"] = [assignee]
        changes["assignees"] = {"before": current_logins, "after": [assignee]}
    current_labels = set(label_names(issue))
    required = task.labels.split(",")
    missing = [label for label in required if label not in current_labels]
    scopes = {label.split("::", 1)[0] for label in required if "::" in label}
    obsolete = sorted(label for label in current_labels if "::" in label and label.split("::", 1)[0] in scopes and label not in required)
    if missing or obsolete:
        # PATCH replaces every label, so send the full resulting set.
        after = sorted((current_labels - set(obsolete)) | set(missing))
        payload["labels"] = after
        changes["labels"] = {"before": sorted(current_labels), "after": after}
    return payload, changes


def snapshot(issue: dict) -> dict:
    # Ignore label/assignee ordering, but detect concurrent content/workflow edits.
    return {
        "title": issue.get("title"),
        "body": description_text(issue.get("body")),
        "assignees": sorted(login.lower() for login in assignee_logins(issue)),
        "labels": sorted(label_names(issue)),
        "state": issue.get("state"),
        "pull_request": bool(issue.get("pull_request")),
        "updated_at": issue.get("updated_at"),
    }


@dataclass
class SyncPlan:
    task: Task
    issue: dict | None
    action: str
    payload: dict
    changes: dict

    def to_dict(self) -> dict:
        return {
            **asdict(self.task),
            "action": self.action,
            "github_number": self.issue["number"] if self.issue else None,
            "html_url": self.issue.get("html_url") if self.issue else None,
            "changes": self.changes,
        }


def print_plan(plan: SyncPlan) -> None:
    task, issue = plan.task, plan.issue
    target = f" -> GitHub #{issue['number']} ({issue.get('html_url', '')})" if issue else ""
    closing = " (then close: checklist [x])" if issue is None and task.closed else ""
    print(f"\n{plan.action.upper()} planned #{task.planned_issue}{target}{closing}: {task.title}", flush=True)
    if issue is None:
        print(f"  Assignee: @{task.assignee} | Labels: {task.labels} | Section: {task.section}\n\n{task.description}", flush=True)
    for field, change in plan.changes.items():
        if field == "body":
            before = description_text(change["before"]).splitlines(keepends=True)
            after = description_text(change["after"]).splitlines(keepends=True)
            diff = difflib.unified_diff(
                [line.rstrip("\n") + "\n" for line in before],
                [line.rstrip("\n") + "\n" for line in after],
                fromfile="GitHub body",
                tofile="Markdown body",
            )
            print("".join(diff), end="", flush=True)
        else:
            print(f"  {field}: {json.dumps(change['before'], ensure_ascii=False)} -> {json.dumps(change['after'], ensure_ascii=False)}", flush=True)


def upsert_tasks(api: GitHub, tasks: list[Task], *, apply: bool = False, mapping: dict[int, int] | None = None, save_plan: Callable[[list[dict]], None] | None = None, include_closed: bool = False) -> list[dict]:
    repo, assignees = preflight(api, tasks)
    plans, targets = [], set()
    for task in tasks:
        issue = api.find_issue(task, (mapping or {}).get(task.planned_issue))
        if issue is None:
            if task.closed and not include_closed:
                raise TaskError(f"Planned #{task.planned_issue}: checklist is [x] but no existing issue was found; add --include-closed to create it as a closed issue")
            plans.append(SyncPlan(task, None, "create", create_payload(task, assignees[task.assignee]), {}))
            continue
        if issue["number"] in targets:
            raise TaskError(f"GitHub #{issue['number']} matched more than one selected work item; check markers or --number-map")
        targets.add(issue["number"])
        payload, changes = update_changes(task, issue, assignees[task.assignee])
        plans.append(SyncPlan(task, issue, "update" if payload else "unchanged", payload, changes))
    print(f"UPSERT {'APPLY' if apply else 'PREVIEW (read-only)'}: {repo.get('html_url', api.repo_path)}; selected={len(plans)}, create={sum(plan.action == 'create' for plan in plans)}, update={sum(plan.action == 'update' for plan in plans)}, unchanged={sum(plan.action == 'unchanged' for plan in plans)}", flush=True)
    for plan in plans:
        print_plan(plan)
    data = [plan.to_dict() for plan in plans]
    if save_plan:
        save_plan(data)
    if not apply:
        print("Read-only preview complete. Add --create to apply the selected upsert.")
        return data
    for plan in plans:
        task, issue = plan.task, plan.issue
        if plan.action == "unchanged":
            continue
        if issue is None:
            if api.find_issue(task, fresh=True):
                raise TaskError(f"Planned #{task.planned_issue}: an issue appeared after preflight; rerun the preview")
            result = post_issue(api, task, plan.payload, assignees[task.assignee])
        else:
            path = f"{api.repo_path}/issues/{issue['number']}"
            current, _ = api.request("GET", path)
            if snapshot(normalize_issue(current)) != snapshot(issue):
                raise TaskError(f"GitHub #{issue['number']} changed after preflight; no update sent for this issue. Rerun preview before applying.")
            result, _ = api.request("PATCH", path, payload=plan.payload)
            result = normalize_issue(result)
            print(f"UPDATED planned #{task.planned_issue} -> GitHub #{result.get('number')}: {result.get('html_url')}", flush=True)
        remaining, _ = update_changes(task, result, assignees[task.assignee])
        if remaining or is_pull_request(result):
            raise TaskError("GitHub write completed but returned fields differ from the plan. Inspect the printed URL; remaining issues were stopped.")
    print("Done.")
    return data


def write_output(path: Path, data: list[dict], protected: set[Path]) -> None:
    if path.resolve() in protected:
        raise TaskError("--output must not overwrite the checklist, source files, or GitHub settings")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checklist", type=Path, default=DEFAULT_CHECKLIST)
    parser.add_argument("--issues", help="Required selection: 39, 31-33, or 31-33,39 (planned numbers)")
    parser.add_argument("--list", action="store_true", help="List checklist numbers only; cannot create")
    parser.add_argument("--create", action="store_true", help="Apply selected writes; alone creates missing issues, with --upsert also updates existing issues")
    parser.add_argument("--upsert", action="store_true", help="Read GitHub and preview create/update/no-change; add --create to apply")
    parser.add_argument("--include-closed", action="store_true", help="Allow checklist [x] items to be created; they are closed as completed right after creation")
    parser.add_argument("--number-map", "--iid-map", dest="number_map", help="Explicit planned=GitHub issue number pairs, e.g. 39=120,38=119; requires --upsert")
    parser.add_argument("--assignee", help=f"GitHub login for every selected issue; overrides GITHUB_ASSIGNEE* settings (default: {OWNER})")
    parser.add_argument("--references", choices=REFERENCE_MODES, default="plain", help="plain (default): planned #N stays readable but is not linked to GitHub issue N; keep: leave #N links as written")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="GitHub settings file; default: scripts/github/.env")
    parser.add_argument("--url", help="GitHub HTTPS site URL; overrides shell/file settings. Default: https://github.com")
    parser.add_argument("--repo", help="owner/name; overrides shell/file settings")
    parser.add_argument("--output", type=Path, help="Save selected issues or upsert actions/diffs as UTF-8 JSON (no credentials)")
    args = parser.parse_args(argv)
    if args.list and (args.create or args.upsert or args.issues or args.output or args.number_map or args.assignee or args.include_closed):
        parser.error("--list cannot be combined with --create, --upsert, --issues, --output, --number-map, --assignee, or --include-closed")
    if args.number_map is not None and not args.upsert:
        parser.error("--number-map requires --upsert")
    if not args.list and not args.issues:
        parser.error("--issues is required; no automatic 'all' selection")
    try:
        entries = read_checklist(args.checklist.resolve())
        if args.list:
            for entry in entries.values():
                print(f"#{entry.number} | {entry.section} | {'[x]' if entry.closed else '[ ]'} | {entry.path.name}")
            return 0
        numbers = selection(args.issues)
        missing = [number for number in numbers if number not in entries]
        if missing:
            raise TaskError("Issues not in checklist: " + ", ".join(f"#{number}" for number in missing))
        # Assignee settings are not secret; preview reads them but never uses the token.
        config = read_config(args.env_file)
        assignees = role_assignees(config, args.assignee)
        allow_closed = args.upsert or args.include_closed
        tasks = [read_task(entries[number], allow_closed=allow_closed, assignees=assignees, references=args.references) for number in numbers]
        mapping = number_mapping(args.number_map, numbers)
        connection = connection_settings(args, config) if args.create or args.upsert else None
        protected = {args.checklist.resolve(), args.env_file.resolve(), DEFAULT_ENV_FILE.resolve(), *(entry.path for entry in entries.values())}
        if args.output and args.output.resolve() in protected:
            raise TaskError("--output must not overwrite the checklist, source files, or GitHub settings")
        if args.upsert:
            url, repo, token = connection
            save_plan = (lambda data: write_output(args.output, data, protected)) if args.output else None
            upsert_tasks(GitHub(url, repo, token), tasks, apply=args.create, mapping=mapping, save_plan=save_plan, include_closed=args.include_closed)
            return 0
        if args.output:
            write_output(args.output, [asdict(task) for task in tasks], protected)
        print(f"{'CREATE' if args.create else 'PREVIEW (offline; no GitHub requests)'}: {len(tasks)} selected issue(s)", flush=True)
        for task in tasks:
            closing = " | Closed after create: checklist [x]" if task.closed else ""
            print(f"\nPlanned #{task.planned_issue} | {task.title}\nAssignee: @{task.assignee} | Labels: {task.labels} | Section: {task.section}{closing}\n\n{task.description}")
        if args.create:
            url, repo, token = connection
            create_tasks(GitHub(url, repo, token), tasks)
        return 0
    except (TaskError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
