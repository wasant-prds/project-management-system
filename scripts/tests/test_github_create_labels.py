"""Contract tests for GitHub label upsert. They never contact a live service."""

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import unquote


SCRIPT = Path(__file__).resolve().parents[1] / "github-create-labels.py"
TASKS = Path(__file__).resolve().parents[1] / "github-create-tasks.py"
spec = importlib.util.spec_from_file_location("github_create_labels", SCRIPT)
labels = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = labels
spec.loader.exec_module(labels)
task_spec = importlib.util.spec_from_file_location("github_create_tasks_for_label_tests", TASKS)
tasks = importlib.util.module_from_spec(task_spec)
sys.modules[task_spec.name] = tasks
task_spec.loader.exec_module(tasks)


CATALOG = """# before

# labels

priority::high 🟠 → สูง
priority::low 🟢 → ต่ำ

role::SA → วิเคราะห์

status::todo - พร้อมเริ่ม

type::task - งานทั่วไป

# notes
ignore::me → no
"""


class FakeGitHub(labels.GitHub):
    def __init__(self, *, existing=None, archived=False, issues_enabled=True, pages=None, fail=None):
        super().__init__("https://github.com", "owner/repo", "fake-test-token")
        self.remote = {}
        for item in existing or []:
            self.remote[item["name"]] = {
                "name": item["name"],
                "color": str(item.get("color", "d93f0b")).removeprefix("#").lower(),
                "description": item.get("description", ""),
            }
        self.archived = archived
        self.issues_enabled = issues_enabled
        self.pages = pages
        self.fail = fail
        self.flip_spec = None
        self.calls = []

    def request(self, method, path, *, params=None, payload=None):
        self.calls.append((method, path, payload))
        collection = self.repo_path + "/labels"
        if method == "GET" and path == self.repo_path:
            return {"archived": self.archived, "has_issues": self.issues_enabled}, {}
        if method == "GET" and path == collection:
            if self.fail == "auth":
                raise labels.LabelError("GitHub GET /labels: HTTP 401: bad fake-test-token", status=401)
            if self.pages is not None:
                assert params["per_page"] == 100
                batch, headers = self.pages[int(params["page"]) - 1]
                return batch, headers
            return list(self.remote.values()), {}
        if method == "GET" and path.startswith(collection + "/"):
            name = unquote(path[len(collection) + 1 :])
            if self.fail == "flip" and self.flip_spec is not None:
                spec = self.flip_spec
                return {"name": name, "color": spec.color.lower(), "description": spec.description}, {}
            found = self.remote.get(name)
            if found is None:
                raise labels.LabelError(f"GitHub GET {path}: HTTP 404", status=404)
            return dict(found), {}
        if method == "POST":
            if self.fail == "url":
                raise labels.LabelError("GitHub POST failed (URLError). Check GitHub before rerunning; writes are never retried automatically.")
            if self.fail == "stick":
                return {"name": payload["name"], "color": "000000", "description": payload["description"]}, {}
            self.remote[payload["name"]] = {
                "name": payload["name"],
                "color": payload["color"].lower(),
                "description": payload["description"],
            }
            return dict(self.remote[payload["name"]]), {}
        if method == "PATCH":
            name = unquote(path[len(collection) + 1 :])
            current = self.remote[name]
            current["color"] = payload["color"].lower()
            current["description"] = payload["description"]
            return dict(current), {}
        raise AssertionError((method, path))

    @property
    def writes(self):
        return [call for call in self.calls if call[0] in {"POST", "PATCH", "DELETE"}]


class LabelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.catalog = self.folder / "work_items.md"
        self.catalog.write_text(CATALOG, encoding="utf-8")
        self.parsed = labels.read_labels(self.catalog)

    def tearDown(self):
        self.temp.cleanup()

    def env(self, text="GITHUB_URL=https://github.com\nGITHUB_REPO=owner/repo\nGITHUB_TOKEN=fake-file-token\n"):
        path = self.folder / ".env"
        path.write_text(text, encoding="utf-8")
        return path

    def run_main(self, args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = labels.main(args)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_same_prefix_shares_one_color_and_emoji_is_not_the_label(self):
        by_prefix = {}
        for label in self.parsed:
            by_prefix.setdefault(label.prefix, set()).add(label.color)
            self.assertNotIn("🟠", label.name + label.description)
            self.assertNotIn("🟢", label.name + label.description)
        self.assertEqual(by_prefix, {
            "priority": {labels.COLORS["priority"]},
            "role": {labels.COLORS["role"]},
            "status": {labels.COLORS["status"]},
            "type": {labels.COLORS["type"]},
        })
        self.assertEqual(len(set(labels.COLORS.values())), len(labels.COLORS))
        self.assertEqual([label.name for label in self.parsed], ["priority::high", "priority::low", "role::SA", "status::todo", "type::task"])
        self.assertEqual(self.parsed[0].description, "สูง")
        self.assertNotIn("ignore::me", [label.name for label in self.parsed])

    def test_catalog_rejects_malformed_sections(self):
        cases = {
            "no heading\npriority::high → สูง\n": "exactly one",
            "# labels\n\n# labels\npriority::high → สูง\n": "exactly one",
            "# labels\n\n": "empty",
            "# labels\npriority::high สูง\n": "expected",
            "# labels\npriority::high → สูง\npriority::high → ซ้ำ\n": "duplicate",
            "# labels\nnote::x → ข้อความ\n": "no shared color",
            "# labels\npriority::" + ("n" * 41) + " → ข้อความ\n": "name limit",
            "# labels\npriority::high → " + ("ก" * 101) + "\n": "100",
        }
        for text, expected in cases.items():
            path = self.folder / "bad.md"
            path.write_text(text, encoding="utf-8")
            with self.subTest(expected=expected):
                with self.assertRaises(labels.LabelError) as caught:
                    labels.read_labels(path)
                self.assertIn(expected, str(caught.exception))

    def test_repository_catalog_uses_shared_colors(self):
        if not labels.DEFAULT_CATALOG.exists():
            self.skipTest("local design catalog is not in this workspace")
        parsed = labels.read_labels(labels.DEFAULT_CATALOG)
        by_name = {label.name: label for label in parsed}
        self.assertLessEqual(
            {"type::task", "status::todo", "priority::high", "role::SA", "role::infra", "role::Developer"},
            set(by_name),
        )
        for label in parsed:
            with self.subTest(label=label.name):
                self.assertEqual(label.color, labels.COLORS[label.prefix])
                self.assertLessEqual(len(label.name), labels.NAME_LIMIT)
                self.assertLessEqual(len(label.description), labels.DESCRIPTION_LIMIT)
                self.assertNotRegex(label.description, r"[🟠🟢🟡⚪🔴]")
        self.assertEqual(by_name["priority::high"].description, "สำคัญมาก ควรทำก่อนงานทั่วไป")
        self.assertEqual(by_name["role::SA"].description, "System Analyst : งานวิเคราะห์ระบบ, Requirement, Design, Review Flow")
        self.assertEqual(by_name["status::sa-testing"].description, "DEV พัฒนาเสร็จแล้ว รอ/อยู่ระหว่าง SA ทดสอบ (DEV ต้องเปลี่ยนเป็นสถานะนี้ก่อนส่งงาน)")
        self.assertEqual(by_name["type::data"].description, "Query, Data Analysis, Report, Data Extraction")

    def test_config_keys_match_the_issue_script_and_example_file(self):
        self.assertEqual(labels.CONFIG_KEYS, tasks.CONFIG_KEYS)
        config = labels.read_config(labels.ROOT / "scripts/github/.env.example")
        self.assertEqual(config["GITHUB_TOKEN"], "")
        self.assertEqual(config["GITHUB_REPO"], "wasant-prds/project-management-system")
        path = self.folder / ".env"
        path.write_text("GITHUB_TOKEN=fake-secret\nGITHUB_TOKEN=fake-secret\n", encoding="utf-8")
        with self.assertRaises(labels.LabelError) as caught:
            labels.read_config(path)
        self.assertNotIn("fake-secret", str(caught.exception))

    def test_offline_preview_does_not_read_token_or_call_github(self):
        broken = self.env("NOT_A_SETTING=secret-token\n")
        with patch.object(labels, "GitHub", side_effect=AssertionError("network")):
            code, stdout, stderr = self.run_main(["--catalog", str(self.catalog), "--env-file", str(broken)])
        self.assertEqual(code, 0, stderr)
        self.assertIn("PREVIEW (offline; no GitHub requests): 5 label(s)", stdout)
        self.assertIn("priority #D93F0B", stdout)
        self.assertIn("role #5319E7", stdout)
        self.assertNotIn("🟠", stdout)
        self.assertNotIn("secret-token", stdout + stderr)

    def test_output_json_and_protected_paths(self):
        output = self.folder / "out" / "labels.json"
        code, _, stderr = self.run_main(["--catalog", str(self.catalog), "--output", str(output)])
        self.assertEqual(code, 0, stderr)
        saved = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(saved[0]["action"], "catalog")
        self.assertEqual(saved[0]["color"], "D93F0B")
        code, _, stderr = self.run_main(["--catalog", str(self.catalog), "--output", str(self.catalog)])
        self.assertEqual(code, 1)
        self.assertIn("must not overwrite", stderr)

    def test_upsert_preview_classifies_without_writes(self):
        api = FakeGitHub(existing=[
            {"name": "priority::low", "color": "00ff00", "description": "ต่ำ"},
            {"name": "role::SA", "color": "#5319E7", "description": "วิเคราะห์"},
            {"name": "bug", "color": "d73a4a", "description": "default"},
        ])
        plan = labels.sync(api, self.parsed, apply=False)
        self.assertEqual([row["action"] for row in plan], ["create", "update", "unchanged", "create", "create"])
        self.assertEqual(plan[1]["before"]["color"], "00ff00")
        self.assertEqual(api.writes, [])
        self.assertNotIn("DELETE", [call[0] for call in api.calls])

    def test_apply_creates_and_updates_with_the_shared_color(self):
        api = FakeGitHub(existing=[
            {"name": "priority::low", "color": "00ff00", "description": "ต่ำ"},
            {"name": "role::SA", "color": "5319e7", "description": "วิเคราะห์"},
        ])
        labels.sync(api, self.parsed, apply=True)
        posts = [call for call in api.writes if call[0] == "POST"]
        patches = [call for call in api.writes if call[0] == "PATCH"]
        self.assertEqual([call[2]["name"] for call in posts], ["priority::high", "status::todo", "type::task"])
        self.assertEqual({call[2]["color"] for call in posts if call[2]["name"].startswith("priority::")}, {"D93F0B"})
        self.assertEqual(patches[0][2], {"color": "D93F0B", "description": "ต่ำ"})
        self.assertNotIn("new_name", patches[0][2])
        self.assertEqual(api.remote["priority::high"]["color"], "d93f0b")
        self.assertEqual(api.remote["priority::low"]["color"], "d93f0b")
        again = labels.sync(api, self.parsed, apply=True)
        self.assertTrue(all(row["action"] == "unchanged" for row in again))
        self.assertEqual(len(api.writes), len(posts) + len(patches))

    def test_write_mismatch_or_drift_stops_the_rest(self):
        stuck = FakeGitHub(fail="stick")
        with self.assertRaises(labels.LabelError) as caught:
            labels.sync(stuck, self.parsed, apply=True)
        self.assertIn("differs", str(caught.exception))
        self.assertEqual(len(stuck.writes), 1)

        flipped = FakeGitHub(fail="flip")
        flipped.flip_spec = self.parsed[0]
        with self.assertRaises(labels.LabelError) as caught:
            labels.sync(flipped, self.parsed[:1], apply=True)
        self.assertIn("changed after the preview", str(caught.exception))
        self.assertEqual(flipped.writes, [])

    def test_repository_and_auth_failures_do_not_write(self):
        for api in (FakeGitHub(archived=True), FakeGitHub(issues_enabled=False), FakeGitHub(fail="auth")):
            with self.subTest(fail=api.fail, archived=api.archived, issues=api.issues_enabled):
                with self.assertRaises(labels.LabelError):
                    labels.sync(api, self.parsed, apply=True)
                self.assertEqual(api.writes, [])

    def test_pagination_joins_pages_and_rejects_a_stuck_link(self):
        api = FakeGitHub(pages=[
            ([{"name": "priority::high", "color": "aaaaaa", "description": "สูง"}], {"Link": '<https://api.github.com/labels?page=2>; rel="next"'}),
            ([{"name": "priority::low", "color": "d93f0b", "description": "ต่ำ"}], {}),
        ])
        plan = labels.sync(api, self.parsed[:2], apply=False)
        self.assertEqual([row["action"] for row in plan], ["update", "unchanged"])

        stuck = FakeGitHub(pages=[
            ([{"name": "priority::high", "color": "d93f0b", "description": "สูง"}], {"Link": '<https://api.github.com/labels?page=1>; rel="next"'}),
        ])
        with self.assertRaises(labels.LabelError) as caught:
            labels.sync(stuck, self.parsed[:1], apply=False)
        self.assertIn("did not advance", str(caught.exception))

    def test_http_errors_redact_the_token(self):
        api = labels.GitHub("https://github.com", "owner/repo", "fake-secret-token")
        self.assertTrue(any(isinstance(handler, labels.NoRedirect) for handler in api.opener.handlers))

        def forbidden(req, timeout=None):
            raise HTTPError(req.full_url, 403, "no", {}, io.BytesIO(b'{"token":"fake-secret-token"}'))

        api.opener.open = forbidden
        with self.assertRaises(labels.LabelError) as caught:
            api.request("GET", "/repos/owner/repo")
        self.assertNotIn("fake-secret-token", str(caught.exception))
        self.assertIn("[REDACTED]", str(caught.exception))
        self.assertEqual(caught.exception.status, 403)

        def offline(req, timeout=None):
            raise URLError("fake-secret-token down")

        api.opener.open = offline
        with self.assertRaises(labels.LabelError) as caught:
            api.request("POST", "/repos/owner/repo/labels", payload={"name": "priority::high"})
        self.assertNotIn("fake-secret-token", str(caught.exception))
        self.assertIn("never retried", str(caught.exception))

    def test_apply_does_not_retry_a_failed_write(self):
        api = FakeGitHub(fail="url")
        with self.assertRaises(labels.LabelError):
            labels.sync(api, self.parsed, apply=True)
        self.assertEqual([call[0] for call in api.writes], ["POST"])

    def test_connection_rejects_bad_url_repo_and_embedded_token(self):
        self.assertEqual(labels.api_base("https://github.com"), "https://api.github.com")
        self.assertEqual(labels.api_base("https://github.example.com"), "https://github.example.com/api/v3")
        for url in ("http://github.com", "https://api.github.com", "https://user:token@github.com/path"):
            with self.assertRaises(labels.LabelError):
                labels.api_base(url)
        with self.assertRaises(labels.LabelError):
            labels.split_repo("owner/repo.git")
        with self.assertRaises(labels.LabelError):
            labels.GitHub("https://github.com/fake-secret-token", "owner/repo", "fake-secret-token")

    def test_cli_apply_uses_env_file_and_stops_when_token_is_missing(self):
        env = self.env()
        api = FakeGitHub()
        with patch.object(labels, "GitHub", return_value=api):
            code, stdout, stderr = self.run_main(["--catalog", str(self.catalog), "--env-file", str(env), "--upsert"])
        self.assertEqual(code, 0, stderr)
        self.assertIn("UPSERT preview", stdout)
        self.assertEqual(api.writes, [])
        self.assertNotIn("fake-file-token", stdout + stderr)

        missing = self.env("GITHUB_URL=https://github.com\nGITHUB_REPO=owner/repo\nGITHUB_TOKEN=\n")
        with patch.object(labels, "GitHub", side_effect=AssertionError("network")):
            code, _, stderr = self.run_main(["--catalog", str(self.catalog), "--env-file", str(missing), "--create"])
        self.assertEqual(code, 1)
        self.assertIn("GITHUB_TOKEN", stderr)


if __name__ == "__main__":
    unittest.main()
