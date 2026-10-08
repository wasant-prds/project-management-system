"""Contract tests with fake GitHub responses; never contact a live service."""

import argparse
import contextlib
import copy
import importlib.util
import io
import json
import os
from dataclasses import replace
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError


SCRIPT = Path(__file__).resolve().parents[1] / "github-create-tasks.py"
spec = importlib.util.spec_from_file_location("github_create_tasks", SCRIPT)
tasks = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = tasks
spec.loader.exec_module(tasks)
ALL_LABEL_NAMES = (
    "type::feature", "type::task", "status::todo", "priority::high",
    "role::SA", "role::infra", "role::Developer",
)
DEVELOPER_LABELS = ["type::feature", "priority::high", "role::Developer", "status::todo"]
NO_ENV = {key: "" for key in tasks.ASSIGNEE_KEYS}


class FakeGitHub(tasks.GitHub):
    def __init__(self, *, label=True, users=(tasks.OWNER,), existing=None, label_details=None, archived=False, issues_enabled=True):
        super().__init__("https://github.com", "owner/repo", "fake-test-token")
        self.calls = []
        self.has_label = label
        self.label_details = label_details if label_details is not None else [{"name": name} for name in ALL_LABEL_NAMES]
        self.users = list(users)
        self.existing = list(existing or [])
        self.archived = archived
        self.issues_enabled = issues_enabled

    def present(self, item):
        data = copy.deepcopy(item)
        data["labels"] = [{"name": label} for label in item.get("labels", [])]
        data["assignees"] = [{"login": user["login"]} for user in item.get("assignees", [])]
        data["body"] = item.get("body") or ""
        return data

    def request(self, method, path, *, params=None, payload=None):
        self.calls.append((method, path, params, payload))
        if method == "POST":
            number = 250 + len(self.existing)
            result = {
                "id": 1000 + len(self.existing), "number": number,
                "html_url": f"https://github.com/owner/repo/issues/{number}",
                "title": payload["title"], "body": payload["body"],
                "labels": list(payload["labels"]),
                "assignees": [{"login": login} for login in payload["assignees"]],
                "state": "open", "updated_at": "version-1",
            }
            self.existing.append(result)
            return self.present(result), {}
        if method == "PATCH":
            number = int(path.rsplit("/", 1)[1])
            result = next(item for item in self.existing if item["number"] == number)
            for field in ("title", "body", "state"):
                if field in payload:
                    result[field] = payload[field]
            if "assignees" in payload:
                result["assignees"] = [{"login": login} for login in payload["assignees"]]
            if "labels" in payload:
                result["labels"] = list(payload["labels"])
            result["updated_at"] = "updated-version"
            return self.present(result), {}
        if method == "GET" and "/issues/" in path:
            number = int(path.rsplit("/", 1)[1])
            matches = [item for item in self.existing if item["number"] == number]
            if not matches:
                raise tasks.TaskError("GitHub GET: HTTP 404", status=404)
            return self.present(matches[0]), {}
        if path == self.repo_path:
            return {"archived": self.archived, "has_issues": self.issues_enabled, "html_url": "https://github.com/owner/repo"}, {}
        if path.endswith("/labels"):
            assert params["per_page"] == 100
            return (list(self.label_details) if self.has_label else []), {}
        if path.endswith("/assignees"):
            assert params["per_page"] == 100
            return [{"login": login} for login in self.users], {}
        if path.endswith("/issues"):
            assert params["state"] == "all" and params["per_page"] == 100
            return [self.present(item) for item in self.existing], {}
        raise AssertionError((method, path))

    @property
    def posts(self):
        return [call for call in self.calls if call[0] == "POST"]

    @property
    def writes(self):
        return [call for call in self.calls if call[0] in {"POST", "PATCH"}]

    @property
    def listings(self):
        return [call for call in self.calls if call[0] == "GET" and call[1].endswith("/issues")]


class TaskTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.checklist = self.folder / "00_checklist.md"
        self.checklist.write_text(
            "## Developer (`#152`)\n\n- [ ] **#152** [Future task](./152_example.md) — local note\n",
            encoding="utf-8")
        self.source = self.folder / "152_example.md"
        self.source.write_text(
            "**Role:** Developer\n\n**Labels**\n\n- type::feature\n- priority::high\n- role::Developer\n- status::todo\n\n**Title**\n\nFuture task\n\n**Dependencies:** #140\n\n"
            "**New Section**\n\nภาษาไทย\n\n- [ ] Keep this checklist\n", encoding="utf-8")
        self.entry = tasks.read_checklist(self.checklist)[152]
        self.env = patch.dict(os.environ, NO_ENV)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def main_args(self, args, env_file=None):
        return ["--checklist", str(self.checklist), "--env-file", str(env_file or self.folder / ".env"), *args]

    def quiet_main(self, args, env_file=None):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return tasks.main(self.main_args(args, env_file))

    def remote_issue(self, task=None, **overrides):
        task = task or tasks.read_task(self.entry)
        return {
            "id": 1000, "number": 250, "title": task.title,
            "body": task.description, "assignees": [{"login": tasks.OWNER}],
            "labels": task.labels.split(","), "state": "open",
            "updated_at": "original-version",
            "html_url": "https://github.com/owner/repo/issues/250",
            **overrides,
        }

    def quiet_upsert(self, api, selected=None, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()):
            return tasks.upsert_tasks(api, selected or [tasks.read_task(self.entry)], **kwargs)

    def other(self, task, number, title):
        marker = f"<!-- github-issue:{number} -->"
        return replace(task, planned_issue=number, title=title, marker=marker, description=task.description.replace(task.marker, marker))

    # Upsert behavior

    def test_upsert_preview_has_remote_diff_and_no_writes(self):
        task = tasks.read_task(self.entry)
        old = self.remote_issue(body="Old Thai requirements\n\n" + task.marker)
        api = FakeGitHub(existing=[old])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            plans = tasks.upsert_tasks(api, [task])
        self.assertEqual(plans[0]["action"], "update")
        self.assertEqual(plans[0]["github_number"], 250)
        self.assertEqual(plans[0]["changes"]["body"]["before"], old["body"])
        self.assertIn("--- GitHub body", output.getvalue())
        self.assertIn("+ภาษาไทย", output.getvalue())
        self.assertEqual(api.writes, [])

    def test_upsert_uses_actual_number_and_updates_only_different_fields(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n" + task.marker)])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(len(api.writes), 1)
        method, path, _, payload = api.writes[0]
        self.assertEqual(method, "PATCH")
        self.assertTrue(path.endswith("/issues/250"))
        self.assertEqual(payload, {"body": task.description})
        self.quiet_upsert(api, apply=True)
        self.assertEqual(len(api.writes), 1)

    def test_upsert_unchanged_ignores_line_endings_and_final_newlines(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(body=task.description.replace("\n", "\r\n").rstrip())])
        plan = self.quiet_upsert(api, apply=True)
        self.assertEqual(plan[0]["action"], "unchanged")
        self.assertEqual(api.writes, [])

    def test_upsert_title_and_assignee_changes_match_by_marker(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(title="[SA] Old title", assignees=[{"login": "other-user"}])])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][3], {"title": task.title, "assignees": [tasks.OWNER]})

    def test_upsert_creates_missing_with_file_labels(self):
        api = FakeGitHub()
        preview = self.quiet_upsert(api)
        self.assertEqual(preview[0]["action"], "create")
        self.assertEqual(api.writes, [])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(len(api.posts), 1)
        self.assertEqual(api.posts[0][3]["labels"], DEVELOPER_LABELS)
        self.assertEqual(api.posts[0][3]["assignees"], [tasks.OWNER])

    def test_upsert_keeps_unscoped_labels_and_replaces_named_scopes(self):
        task = tasks.read_task(self.entry)
        labels = ["customer-request", *DEVELOPER_LABELS]
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n" + task.marker, state="closed", labels=labels)])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][3], {"body": task.description})
        self.assertEqual(api.existing[0]["state"], "closed")
        self.assertEqual(api.existing[0]["labels"], labels)

        replaced = ["type::task", "status::doing", "priority::low", "role::SA", "customer-request"]
        api = FakeGitHub(existing=[self.remote_issue(labels=replaced)])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][3]["labels"], ["customer-request", "priority::high", "role::Developer", "status::todo", "type::feature"])

    def test_upsert_adds_missing_file_labels(self):
        api = FakeGitHub(existing=[self.remote_issue(labels=["priority::high"])])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][3]["labels"], ["priority::high", "role::Developer", "status::todo", "type::feature"])

    def test_file_labels_leave_prefixes_they_do_not_name(self):
        self.source.write_text(
            "**Role:** Developer\n\n**Labels**\n\n- role::SA\n\n**Title**\n\nFuture task\n\nbody\n",
            encoding="utf-8")
        task = tasks.read_task(self.entry)
        self.assertEqual(task.labels, "role::SA")
        api = FakeGitHub(existing=[self.remote_issue(labels=["priority::low", "role::Developer", "customer-request"])])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][3]["labels"], ["customer-request", "priority::low", "role::SA"])

    def test_labels_heading_rejects_missing_empty_and_duplicate_entries(self):
        original = self.source.read_text(encoding="utf-8")
        cases = {
            original.replace("**Labels**\n\n- type::feature\n- priority::high\n- role::Developer\n- status::todo\n\n", ""): "exactly one **Labels**",
            original.replace("- status::todo\n", "- status::todo\n- status::todo\n"): "duplicate label",
            original.replace("- type::feature\n- priority::high\n- role::Developer\n- status::todo\n", "no bullets here\n"): "bullet items",
        }
        for content, expected in cases.items():
            with self.subTest(expected=expected):
                self.source.write_text(content, encoding="utf-8")
                with self.assertRaises(tasks.TaskError) as caught:
                    tasks.read_task(self.entry)
                self.assertIn(expected, str(caught.exception))

    def test_upsert_title_fallback_adopts_marker_on_manual_issue(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(body="Manual issue without marker")])
        self.quiet_upsert(api, apply=True)
        self.assertEqual(api.writes[0][0], "PATCH")
        self.assertIn(task.marker, api.existing[0]["body"])

    def test_upsert_marker_identity_wins_over_another_identical_title(self):
        api = FakeGitHub(existing=[
            self.remote_issue(title="Renamed"),
            self.remote_issue(id=1001, number=251, body="Different manual issue"),
        ])
        self.quiet_upsert(api, apply=True)
        self.assertTrue(api.writes[0][1].endswith("/issues/250"))

    def test_upsert_explicit_mapping_handles_missing_marker_and_changed_title(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(title="Old unrelated title", body="No marker")])
        self.quiet_upsert(api, apply=True, mapping={task.planned_issue: 250})
        self.assertEqual(api.writes[0][0], "PATCH")
        self.assertEqual(api.existing[0]["title"], task.title)

    def test_upsert_wrong_marker_or_pull_request_refuses_all_writes(self):
        for overrides in [{"body": "<!-- github-issue:999 -->"}, {"pull_request": {"url": "https://github.com/owner/repo/pull/250"}}]:
            with self.subTest(overrides=overrides):
                api = FakeGitHub(existing=[self.remote_issue(**overrides)])
                with self.assertRaises(tasks.TaskError):
                    self.quiet_upsert(api, apply=True)
                self.assertEqual(api.writes, [])

    def test_upsert_ambiguity_later_in_batch_prevents_earlier_creation(self):
        task = tasks.read_task(self.entry)
        missing = self.other(task, 151, "[Developer] Missing")
        for duplicate in [self.remote_issue(id=1001, number=251), self.remote_issue(id=1001, number=251, body="No marker")]:
            first = self.remote_issue() if tasks.MARKER.findall(duplicate["body"]) else self.remote_issue(body="Manual")
            api = FakeGitHub(existing=[first, duplicate])
            with self.assertRaises(tasks.TaskError):
                self.quiet_upsert(api, [missing, task], apply=True)
            self.assertEqual(api.writes, [])

    def test_upsert_mapping_conflict_or_missing_number_never_creates(self):
        for mapping in [{152: 251}, {152: 999}]:
            api = FakeGitHub(existing=[self.remote_issue()])
            with self.assertRaises(tasks.TaskError):
                self.quiet_upsert(api, apply=True, mapping=mapping)
            self.assertEqual(api.writes, [])
        empty = FakeGitHub()
        with self.assertRaises(tasks.TaskError) as exc:
            self.quiet_upsert(empty, apply=True, mapping={152: 999})
        self.assertIn("token can read", str(exc.exception))
        self.assertEqual(exc.exception.status, 404)
        self.assertEqual(empty.writes, [])

    def test_mapped_number_permission_errors_are_not_reported_as_missing(self):
        api = FakeGitHub(existing=[self.remote_issue()])
        request = api.request

        def unauthorized(method, path, **kwargs):
            if method == "GET" and path.endswith("/issues/250"):
                raise tasks.TaskError("GitHub GET: HTTP 401: Bad credentials", status=401)
            return request(method, path, **kwargs)

        with patch.object(api, "request", side_effect=unauthorized):
            with self.assertRaises(tasks.TaskError) as exc:
                self.quiet_upsert(api, apply=True, mapping={152: 250})
        self.assertEqual(exc.exception.status, 401)
        self.assertNotIn("not found", str(exc.exception))
        self.assertEqual(api.writes, [])

    def test_upsert_mixed_batch_creates_updates_and_skips_in_one_run(self):
        changed = tasks.read_task(self.entry)
        new = self.other(changed, 151, "[Developer] New")
        same = self.other(changed, 153, "[Developer] Same")
        api = FakeGitHub(existing=[
            self.remote_issue(changed, body="Old\n" + changed.marker),
            self.remote_issue(same, id=1001, number=251),
        ])
        plans = self.quiet_upsert(api, [new, changed, same], apply=True)
        self.assertEqual([item["action"] for item in plans], ["create", "update", "unchanged"])
        self.assertEqual([call[0] for call in api.writes], ["POST", "PATCH"])
        self.quiet_upsert(api, [new, changed, same], apply=True)
        self.assertEqual(len(api.writes), 2)

    def test_planning_lists_repository_issues_once_per_run(self):
        first = tasks.read_task(self.entry)
        selected = [first, self.other(first, 153, "[Developer] Second"), self.other(first, 154, "[Developer] Third")]
        api = FakeGitHub()
        self.quiet_upsert(api, selected)
        self.assertEqual(len(api.listings), 1)
        self.quiet_upsert(api, selected)
        self.assertEqual(len(api.listings), 2)
        applied = FakeGitHub()
        self.quiet_upsert(applied, selected, apply=True)
        # One planning listing plus one fresh duplicate check before each POST.
        self.assertEqual(len(applied.listings), 1 + len(selected))

    def test_upsert_plan_save_failure_stops_before_first_write(self):
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n<!-- github-issue:152 -->")])

        def failed_save(data):
            self.assertEqual(data[0]["action"], "update")
            raise OSError("Destination not writable")

        with self.assertRaises(OSError):
            self.quiet_upsert(api, apply=True, save_plan=failed_save)
        self.assertEqual(api.writes, [])

    def test_upsert_cli_create_applies_the_selected_update(self):
        path = self.folder / ".env"
        path.write_text("GITHUB_REPO=owner/repo\nGITHUB_TOKEN=fake-token\n", encoding="utf-8")
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n<!-- github-issue:152 -->")])
        with patch.dict(os.environ, {}, clear=True), patch.object(tasks, "GitHub", return_value=api):
            self.assertEqual(self.quiet_main(["--issues", "152", "--upsert", "--create"]), 0)
        self.assertEqual([call[0] for call in api.writes], ["PATCH"])

    def test_upsert_rechecks_concurrent_edits_before_patch(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n" + task.marker)])
        request = api.request
        detail_reads = 0

        def concurrent_edit(method, path, **kwargs):
            nonlocal detail_reads
            if method == "GET" and path.endswith("/issues/250"):
                detail_reads += 1
                if detail_reads == 2:
                    api.existing[0]["body"] = "Someone just edited this\n" + task.marker
                    api.existing[0]["updated_at"] = "concurrent-edit"
            return request(method, path, **kwargs)

        with patch.object(api, "request", side_effect=concurrent_edit):
            with self.assertRaises(tasks.TaskError) as exc:
                self.quiet_upsert(api, apply=True)
        self.assertIn("changed after preflight", str(exc.exception))
        self.assertEqual(api.writes, [])

    def test_number_map_validation(self):
        self.assertEqual(tasks.number_mapping("#152=#250", [152]), {152: 250})
        for value in ["", "152:250", "153=250", "152=0", "152=250,152=251", "151=250,152=250"]:
            with self.subTest(value=value), self.assertRaises(tasks.TaskError):
                tasks.number_mapping(value, [151, 152])

    def test_upsert_cli_preview_and_json_use_only_read_requests(self):
        task = tasks.read_task(self.entry)
        config = self.folder / ".env"
        config.write_text("GITHUB_REPO=owner/repo\nGITHUB_TOKEN=fake-token\n", encoding="utf-8")
        api = FakeGitHub(existing=[self.remote_issue(body="Old\n" + task.marker)])
        output = self.folder / "upsert.json"
        with patch.dict(os.environ, {}, clear=True), patch.object(tasks, "GitHub", return_value=api):
            self.assertEqual(self.quiet_main(["--issues", "152", "--upsert", "--output", str(output)]), 0)
        plan = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(plan[0]["github_number"], 250)
        self.assertEqual(plan[0]["action"], "update")
        self.assertNotIn("fake-token", output.read_text(encoding="utf-8"))
        self.assertEqual(api.writes, [])

    # Checklist [x] items

    def test_closed_checklist_keeps_the_file_labels(self):
        checked = replace(self.entry, closed=True)
        with self.assertRaises(tasks.TaskError) as exc:
            tasks.read_task(checked)
        self.assertIn("--include-closed", str(exc.exception))
        task = tasks.read_task(checked, allow_closed=True)
        self.assertEqual(task.labels.split(","), DEVELOPER_LABELS)

    def test_upsert_checked_source_updates_existing_but_needs_flag_to_create(self):
        task = tasks.read_task(replace(self.entry, closed=True), allow_closed=True)
        api = FakeGitHub(existing=[self.remote_issue(task, body="Old\n" + task.marker, state="closed")])
        self.quiet_upsert(api, [task], apply=True)
        self.assertEqual(api.existing[0]["state"], "closed")
        self.assertNotIn("state", api.writes[0][3])
        empty_api = FakeGitHub()
        with self.assertRaises(tasks.TaskError) as exc:
            self.quiet_upsert(empty_api, [task], apply=True)
        self.assertIn("--include-closed", str(exc.exception))
        self.assertEqual(empty_api.writes, [])

    def test_include_closed_creates_then_closes_as_completed(self):
        task = tasks.read_task(replace(self.entry, closed=True), allow_closed=True)
        for runner in ("create", "upsert"):
            with self.subTest(runner=runner):
                api = FakeGitHub()
                with contextlib.redirect_stdout(io.StringIO()):
                    if runner == "create":
                        tasks.create_tasks(api, [task])
                    else:
                        tasks.upsert_tasks(api, [task], apply=True, include_closed=True)
                self.assertEqual([call[0] for call in api.writes], ["POST", "PATCH"])
                self.assertEqual(api.posts[0][3]["labels"], DEVELOPER_LABELS)
                self.assertEqual(api.writes[1][3], {"state": "closed", "state_reason": "completed"})
                self.assertEqual(api.existing[0]["state"], "closed")
                with contextlib.redirect_stdout(io.StringIO()):
                    tasks.upsert_tasks(api, [task], apply=True, include_closed=True)
                self.assertEqual(len(api.writes), 2)

    def test_include_closed_stops_batch_when_close_does_not_stick(self):
        first = tasks.read_task(replace(self.entry, closed=True), allow_closed=True)
        second = self.other(first, 153, "[Developer] Another")
        api = FakeGitHub()
        request = api.request

        def ignore_close(method, path, **kwargs):
            result, headers = request(method, path, **kwargs)
            if method == "PATCH":
                result["state"] = "open"
            return result, headers

        with patch.object(api, "request", side_effect=ignore_close), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(tasks.TaskError) as exc:
                tasks.create_tasks(api, [first, second])
        self.assertIn("not closed", str(exc.exception))
        self.assertEqual(len(api.posts), 1)

    def test_cli_include_closed_preview_and_flag_rules(self):
        self.checklist.write_text(self.checklist.read_text(encoding="utf-8").replace("[ ]", "[x]"), encoding="utf-8")
        self.assertEqual(self.quiet_main(["--issues", "152"]), 1)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(tasks.main(self.main_args(["--issues", "152", "--include-closed"])), 0)
        self.assertIn("Closed after create", output.getvalue())

    # Assignees per role

    def test_every_role_defaults_to_the_owner(self):
        assignees = tasks.role_assignees({})
        self.assertEqual(set(assignees), set(tasks.ROLES))
        self.assertEqual(set(assignees.values()), {"wasant-prds"})

    def test_role_assignee_settings_and_precedence(self):
        config = {"GITHUB_ASSIGNEE": "team-lead", "GITHUB_ASSIGNEE_SA": "@sa-person", "GITHUB_ASSIGNEE_INFRA": ""}
        assignees = tasks.role_assignees(config)
        self.assertEqual(assignees["SA"], "sa-person")
        self.assertEqual(assignees["Infra"], "team-lead")
        self.assertEqual(assignees["Developer"], "team-lead")
        with patch.dict(os.environ, {"GITHUB_ASSIGNEE_SA": "shell-sa", "GITHUB_ASSIGNEE_DEVELOPER": ""}):
            assignees = tasks.role_assignees(config)
            self.assertEqual(assignees["SA"], "shell-sa")
            self.assertEqual(assignees["Developer"], "team-lead")
            self.assertEqual(set(tasks.role_assignees(config, "cli-user").values()), {"cli-user"})

    def test_invalid_assignee_settings_are_rejected(self):
        for config in [{"GITHUB_ASSIGNEE": "bad user"}, {"GITHUB_ASSIGNEE_SA": "-dash"}, {"GITHUB_ASSIGNEE_DEVELOPER": "a" * 40}]:
            with self.subTest(config=config), self.assertRaises(tasks.TaskError):
                tasks.role_assignees(config)
        with self.assertRaises(tasks.TaskError):
            tasks.role_assignees({}, "  ")

    def test_preview_uses_role_assignee_from_env_file_without_network_or_token_output(self):
        config = self.folder / ".env"
        config.write_text("GITHUB_REPO=owner/repo\nGITHUB_TOKEN=fake-secret-token\nGITHUB_ASSIGNEE_DEVELOPER=dev-person\n", encoding="utf-8")
        output = io.StringIO()
        with patch.object(tasks, "GitHub", side_effect=AssertionError("No network in preview")), contextlib.redirect_stdout(output):
            self.assertEqual(tasks.main(self.main_args(["--issues", "152"], config)), 0)
        self.assertIn("Assignee: @dev-person", output.getvalue())
        self.assertNotIn("fake-secret-token", output.getvalue())

    def test_create_uses_role_specific_assignee_after_preflight(self):
        task = tasks.read_task(self.entry, assignees=tasks.role_assignees({"GITHUB_ASSIGNEE_DEVELOPER": "Dev-Person"}))
        api = FakeGitHub(users=(tasks.OWNER, "dev-person"))
        with contextlib.redirect_stdout(io.StringIO()):
            tasks.create_tasks(api, [task])
        self.assertEqual(api.posts[0][3]["assignees"], ["dev-person"])
        missing = FakeGitHub()
        with self.assertRaises(tasks.TaskError):
            tasks.create_tasks(missing, [task])
        self.assertEqual(missing.posts, [])

    # Configuration and CLI

    def test_env_file_parses_bom_quotes_comments_and_literal_values(self):
        path = self.folder / ".env"
        path.write_text(
            "# dedicated settings\nGITHUB_URL=https://github.com # comment\n"
            "export GITHUB_REPO='owner/repo'\nGITHUB_TOKEN=\"fake-$LITERAL#token\" # comment\n"
            "GITHUB_ASSIGNEE_SA=sa-person\n", encoding="utf-8-sig")
        self.assertEqual(tasks.read_config(path), {
            "GITHUB_URL": "https://github.com", "GITHUB_REPO": "owner/repo",
            "GITHUB_TOKEN": "fake-$LITERAL#token", "GITHUB_ASSIGNEE_SA": "sa-person",
        })

    def test_env_example_contains_only_supported_keys_and_owner_default(self):
        example = tasks.ROOT / "scripts/github/.env.example"
        config = tasks.read_config(example)
        self.assertEqual(config.get("GITHUB_TOKEN"), "")
        self.assertTrue(tasks.ASSIGNEE_KEYS.issubset(config))
        self.assertEqual(set(tasks.role_assignees(config).values()), {tasks.OWNER})

    def test_env_file_errors_do_not_echo_secret_lines(self):
        path = self.folder / ".env"
        for line in ["fake-secret", "UNKNOWN=fake-secret", 'GITHUB_TOKEN="fake-secret', "GITHUB_TOKEN=a\nGITHUB_TOKEN=fake-secret"]:
            path.write_text(line, encoding="utf-8")
            with self.assertRaises(tasks.TaskError) as exc:
                tasks.read_config(path)
            self.assertNotIn("fake-secret", str(exc.exception))

    def test_config_precedence_cli_then_shell_then_file(self):
        path = self.folder / ".env"
        path.write_text("GITHUB_URL=https://github.com\nGITHUB_REPO=file/repo\nGITHUB_TOKEN=fake-file-token\n", encoding="utf-8")
        args = argparse.Namespace(env_file=path, url=None, repo=None)
        config = tasks.read_config(path)
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(tasks.connection_settings(args, config), ("https://github.com", "file/repo", "fake-file-token"))
            with patch.dict(os.environ, {"GITHUB_URL": "https://github.example.com", "GITHUB_REPO": "shell/repo", "GITHUB_TOKEN": "fake-shell-token"}):
                self.assertEqual(tasks.connection_settings(args, config), ("https://github.example.com", "shell/repo", "fake-shell-token"))
                args.repo = "cli/repo"
                args.url = "https://cli.example.com"
                self.assertEqual(tasks.connection_settings(args, config), ("https://cli.example.com", "cli/repo", "fake-shell-token"))

    def test_create_from_env_file_only_with_mock_github(self):
        path = self.folder / ".env"
        path.write_text("GITHUB_URL=https://github.com\nGITHUB_REPO=owner/repo\nGITHUB_TOKEN=fake-file-token\n", encoding="utf-8")
        api = FakeGitHub()
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch.object(tasks, "GitHub", return_value=api) as constructor, contextlib.redirect_stdout(output):
            self.assertEqual(tasks.main(self.main_args(["--issues", "152", "--create"], path)), 0)
        constructor.assert_called_once_with("https://github.com", "owner/repo", "fake-file-token")
        self.assertEqual(len(api.posts), 1)
        self.assertNotIn("fake-file-token", output.getvalue())

    def test_missing_token_names_only_missing_key_before_network(self):
        path = self.folder / ".env"
        path.write_text("GITHUB_REPO=owner/repo\nGITHUB_TOKEN=\n", encoding="utf-8")
        output, errors = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch.object(tasks, "GitHub", side_effect=AssertionError("No network")), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            result = tasks.main(self.main_args(["--issues", "152", "--create"], path))
        self.assertEqual(result, 1)
        self.assertIn("missing GITHUB_TOKEN.", errors.getvalue())
        self.assertEqual(output.getvalue(), "")

    def test_selection_is_explicit_and_ranges_are_inclusive(self):
        self.assertEqual(tasks.selection("#31–#33,33,39"), [31, 32, 33, 39])
        for invalid in ["", "all", "8-1", "0", "1,", "1-20000"]:
            with self.subTest(invalid=invalid), self.assertRaises(tasks.TaskError):
                tasks.selection(invalid)

    def test_preview_with_token_still_never_calls_github(self):
        output = self.folder / "new-folder" / "preview.json"
        with patch.dict(os.environ, {"GITHUB_TOKEN": "fake", "GITHUB_REPO": "owner/repo"}), patch.object(tasks.GitHub, "request", side_effect=AssertionError("No network permitted")):
            self.assertEqual(self.quiet_main(["--issues", "152", "--output", str(output)]), 0)
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual([item["planned_issue"] for item in payload], [152])
        self.assertEqual(payload[0]["labels"], ",".join(DEVELOPER_LABELS))
        self.assertNotIn("fake", output.read_text(encoding="utf-8"))

    def test_output_cannot_overwrite_input(self):
        for path in [self.checklist, self.source]:
            original = path.read_text(encoding="utf-8")
            self.assertEqual(self.quiet_main(["--issues", "152", "--output", str(path)]), 1)
            self.assertEqual(path.read_text(encoding="utf-8"), original)

    def test_missing_selection_and_invalid_flag_combinations_are_rejected(self):
        for args in [[], ["--create"], ["--upsert"], ["--list", "--create"], ["--list", "--upsert"], ["--list", "--include-closed"],
                     ["--issues", "152", "--number-map", "152=250"], ["--issues", "152", "--iid-map", "152=250"],
                     ["--issues", "152", "--references", "escape"]]:
            with self.subTest(args=args), self.assertRaises(SystemExit) as exc:
                self.quiet_main(args)
            self.assertEqual(exc.exception.code, 2)

    def test_list_and_unknown_selection_are_offline(self):
        with patch.object(tasks.GitHub, "request", side_effect=AssertionError("No network permitted")):
            self.assertEqual(self.quiet_main(["--list"]), 0)
            self.assertEqual(self.quiet_main(["--issues", "151-152", "--create"]), 1)

    # Markdown parsing and body

    def test_description_omits_role_labels_and_title(self):
        task = tasks.read_task(self.entry, references="keep")
        self.assertEqual(task.title, "[Developer] Future task")
        self.assertEqual(task.assignee, tasks.OWNER)
        self.assertNotIn("**Role:**", task.description)
        self.assertNotIn("**Labels**", task.description)
        self.assertNotIn("**Title**", task.description)
        self.assertNotIn("Future task", task.description)
        self.assertTrue(task.description.startswith("**Dependencies:** #140\n"))
        self.assertIn("ภาษาไทย", task.description)
        self.assertTrue(task.description.endswith("<!-- github-issue:152 -->\n"))
        original = self.source.read_text(encoding="utf-8").strip()
        self.source.write_text(original + "\n\n<!-- github-issue:152 -->\n", encoding="utf-8")
        self.assertEqual(tasks.read_task(self.entry, references="keep").description, task.description)

    def test_planned_references_are_not_linked_by_default(self):
        self.source.write_text(
            "**Issue:** #152\n\n**Role:** Developer\n\n**Labels**\n\n- type::feature\n\n**Title**\n\nFuture task\n\n"
            "Depends on #26–#30, (#140) and #31.\n\n"
            "Keep `#41` and owner/repo#7 and &#35;9 and C#8 literal.\n\n"
            "```text\n#42 in a fence\n```\n\n- [ ] after fence #43\n", encoding="utf-8")
        body = tasks.read_task(self.entry).description
        self.assertIn("**Issue:** #&#8203;152", body)
        self.assertIn("Depends on #&#8203;26–#&#8203;30, (#&#8203;140) and #&#8203;31.", body)
        self.assertIn("`#41`", body)
        self.assertIn("owner/repo#7", body)
        self.assertIn("&#35;9", body)
        self.assertIn("C#8", body)
        self.assertIn("\n#42 in a fence\n", body)
        self.assertIn("after fence #&#8203;43", body)
        self.assertTrue(body.endswith("<!-- github-issue:152 -->\n"))
        kept = tasks.read_task(self.entry, references="keep").description
        self.assertIn("Depends on #26–#30", kept)

    def test_unlinking_is_stable_across_reruns(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(task)])
        plans = self.quiet_upsert(api, [tasks.read_task(self.entry)], apply=True)
        self.assertEqual(plans[0]["action"], "unchanged")
        self.assertEqual(api.writes, [])

    def test_preamble_before_title_stays_in_the_issue_body(self):
        original = self.source.read_text(encoding="utf-8")
        self.source.write_text("**Issue:** #152\n\nDecision before the title.\n\n" + original, encoding="utf-8")
        task = tasks.read_task(self.entry)
        self.assertIn("Decision before the title.", task.description)
        self.assertNotIn("**Role:**", task.description)
        self.assertNotIn("**Labels**", task.description)
        self.assertNotIn("**Title**", task.description)
        self.assertTrue(task.description.strip().endswith("<!-- github-issue:152 -->"))

    def test_foreign_or_inline_markers_in_markdown_are_rejected(self):
        original = self.source.read_text(encoding="utf-8")
        for extra in ["\n<!-- github-issue:40 -->\n", "\nSee <!-- github-issue:152 --> inline\n", "\ntext <!-- github-issue:153 --> here\n"]:
            with self.subTest(extra=extra):
                self.source.write_text(original + extra, encoding="utf-8")
                with self.assertRaises(tasks.TaskError) as exc:
                    tasks.read_task(self.entry)
                self.assertIn("marker", str(exc.exception))

    def test_role_changes_the_title_and_assignee_but_labels_stay_in_the_file(self):
        original = self.source.read_text(encoding="utf-8")
        for role, (prefix, _) in tasks.ROLES.items():
            with self.subTest(role=role):
                self.source.write_text(original.replace("**Role:** Developer", f"**Role:** {role}", 1), encoding="utf-8")
                task = tasks.read_task(self.entry, assignees=tasks.role_assignees({}))
                self.assertEqual(task.title, f"[{prefix}] Future task")
                self.assertEqual(task.assignee, tasks.OWNER)
                self.assertEqual(task.labels, ",".join(DEVELOPER_LABELS))
                api = FakeGitHub()
                with contextlib.redirect_stdout(io.StringIO()):
                    tasks.create_tasks(api, [task])
                self.assertEqual(api.posts[0][3]["labels"], DEVELOPER_LABELS)

    def test_metadata_mismatch_and_closed_entry_reject_before_network(self):
        original = self.source.read_text(encoding="utf-8")
        for content, expected in [("**Issue:** #153\n" + original, "Issue does not match"), (original.replace("**Role:** Developer", "**Role:** Unknown"), "unsupported Role")]:
            self.source.write_text(content, encoding="utf-8")
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors):
                self.assertEqual(tasks.main(self.main_args(["--issues", "152", "--create"])), 1)
            self.assertIn(expected, errors.getvalue())
        self.source.write_text(original, encoding="utf-8")
        self.checklist.write_text(self.checklist.read_text(encoding="utf-8").replace("[ ]", "[x]"), encoding="utf-8")
        with self.assertRaises(tasks.TaskError):
            tasks.read_task(tasks.read_checklist(self.checklist)[152])

    def test_checklist_rejects_entries_outside_its_directory(self):
        self.checklist.write_text("## Developer\n\n- [ ] **#152** [Future task](../152_example.md)\n", encoding="utf-8")
        with self.assertRaises(tasks.TaskError):
            tasks.read_checklist(self.checklist)
        self.checklist.write_text("- [ ] **#152** [Future task](./152_example.md)\n", encoding="utf-8")
        with self.assertRaises(tasks.TaskError):
            tasks.read_checklist(self.checklist)

    def test_repository_checklist_parses_when_present(self):
        checklist = tasks.DEFAULT_CHECKLIST
        if not checklist.exists():
            self.skipTest("local design checklist is not in this workspace")
        entries = tasks.read_checklist(checklist)
        self.assertTrue(entries)
        for entry in entries.values():
            with self.subTest(issue=entry.number):
                task = tasks.read_task(entry, allow_closed=True, assignees=tasks.role_assignees({}))
                self.assertEqual(task.assignee, tasks.OWNER)
                self.assertTrue(task.description.endswith(f"<!-- github-issue:{entry.number} -->\n"))
                self.assertNotIn("**Role:**", task.description)
                self.assertNotIn("**Labels**", task.description)
                self.assertNotRegex(task.description, r"(?m)^(?:\*\*Title(?:\s*\(required\))?:?\*\*|#{1,6}\s+Title)")
                self.assertGreaterEqual(len(task.labels.split(",")), 1)
                if entry.number == 11:
                    self.assertTrue(task.description.startswith("**Objective**"))
                    self.assertEqual(task.labels, "type::documentation,priority::high,role::SA,status::completed")
                if entry.number == 16:
                    self.assertTrue(task.description.startswith("**Scope**"))
                if entry.number == 31:
                    self.assertIn("Public UUID handoff", task.description)
                    self.assertIn("role::Developer", task.labels)
                    self.assertIn("role::infra", task.labels)
                if entry.number == 32:
                    self.assertIn("type::data", task.labels)
                    self.assertNotIn("role::Data-Migration", task.labels)
                if entry.number == 40:
                    self.assertIn("status::todo", task.labels)
                self.assertLessEqual(len(task.title), tasks.TITLE_LIMIT)
                self.assertLessEqual(len(task.description), tasks.BODY_LIMIT)

    # Preflight and create

    def test_no_posts_if_label_or_user_missing(self):
        task = tasks.read_task(self.entry)
        for api in [FakeGitHub(label=False), FakeGitHub(users=())]:
            with self.assertRaises(tasks.TaskError):
                tasks.create_tasks(api, [task])
            self.assertEqual(api.posts, [])

    def test_archived_or_disabled_issues_stop_before_post(self):
        task = tasks.read_task(self.entry)
        for api in [FakeGitHub(archived=True), FakeGitHub(issues_enabled=False)]:
            with self.assertRaises(tasks.TaskError):
                tasks.create_tasks(api, [task])
            self.assertEqual(api.posts, [])

    def test_each_file_label_must_exist(self):
        task = tasks.read_task(self.entry)
        for missing in DEVELOPER_LABELS:
            with self.subTest(missing=missing):
                api = FakeGitHub(label_details=[{"name": name} for name in ALL_LABEL_NAMES if name != missing])
                with self.assertRaises(tasks.TaskError) as exc:
                    tasks.create_tasks(api, [task])
                self.assertIn(missing, str(exc.exception))
                self.assertEqual(api.posts, [])

    def test_missing_label_in_created_response_stops_remaining_issues(self):
        first = tasks.read_task(self.entry)
        second = self.other(first, 153, "[Developer] Another")
        for omitted in DEVELOPER_LABELS:
            with self.subTest(omitted=omitted):
                api = FakeGitHub()
                request = api.request

                def omit_label(method, path, **kwargs):
                    result, headers = request(method, path, **kwargs)
                    if method == "POST":
                        result["labels"] = [label for label in result["labels"] if label["name"] != omitted]
                    return result, headers

                with patch.object(api, "request", side_effect=omit_label), contextlib.redirect_stdout(io.StringIO()):
                    with self.assertRaises(tasks.TaskError):
                        tasks.create_tasks(api, [first, second])
                self.assertEqual(len(api.posts), 1)

    def test_dropped_assignee_in_created_response_stops_remaining_issues(self):
        first = tasks.read_task(self.entry)
        second = self.other(first, 153, "[Developer] Another")
        api = FakeGitHub()
        request = api.request

        def drop_assignee(method, path, **kwargs):
            result, headers = request(method, path, **kwargs)
            if method == "POST":
                result["assignees"] = []
            return result, headers

        with patch.object(api, "request", side_effect=drop_assignee), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(tasks.TaskError):
                tasks.create_tasks(api, [first, second])
        self.assertEqual(len(api.posts), 1)

    def test_all_users_validated_before_first_post(self):
        owner = tasks.read_task(self.entry)
        other = replace(owner, planned_issue=153, assignee="other-user")
        api = FakeGitHub()
        with self.assertRaises(tasks.TaskError):
            tasks.create_tasks(api, [owner, other])
        self.assertEqual(api.posts, [])

    def test_payload_and_rerun_skip(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub()
        with contextlib.redirect_stdout(io.StringIO()):
            tasks.create_tasks(api, [task])
            tasks.create_tasks(api, [task])
        self.assertEqual(len(api.posts), 1)
        payload = api.posts[0][3]
        self.assertEqual(payload["labels"], DEVELOPER_LABELS)
        self.assertEqual(payload["assignees"], [tasks.OWNER])
        self.assertEqual(payload["body"], task.description)
        self.assertNotIn("number", payload)
        self.assertNotIn("state", payload)

    def test_ambiguous_post_failure_stops_batch_without_retry(self):
        first = tasks.read_task(self.entry)
        second = self.other(first, 153, "[Developer] Another")
        api = FakeGitHub()
        request = api.request

        def timeout_after_post(method, path, **kwargs):
            result = request(method, path, **kwargs)
            if method == "POST":
                raise tasks.TaskError("Simulated response timeout after GitHub saved issue")
            return result

        with patch.object(api, "request", side_effect=timeout_after_post), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(tasks.TaskError):
                tasks.create_tasks(api, [first, second])
        self.assertEqual(len(api.posts), 1)
        with contextlib.redirect_stdout(io.StringIO()):
            tasks.create_tasks(api, [first])
        self.assertEqual(len(api.posts), 1)

    def test_duplicate_marker_and_exact_title_in_closed_issues(self):
        task = tasks.read_task(self.entry)
        for existing in [
            {"id": 1, "number": 50, "title": "Renamed", "body": task.marker, "labels": [], "assignees": [], "state": "closed"},
            {"id": 2, "number": 51, "title": task.title, "body": "Manually created", "labels": [], "assignees": [], "state": "closed"},
        ]:
            api = FakeGitHub(existing=[existing])
            with contextlib.redirect_stdout(io.StringIO()):
                tasks.create_tasks(api, [task])
            self.assertEqual(api.posts, [])

    def test_marker_prefix_does_not_match_different_planned_number(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[{"id": 1, "number": 1, "title": "Other", "body": "<!-- github-issue:1520 -->", "labels": [], "assignees": []}])
        self.assertEqual(api.duplicates(task), [])

    def test_same_github_number_updates_a_different_title_prefix(self):
        task = tasks.read_task(replace(self.entry, closed=True), allow_closed=True)
        old = self.remote_issue(
            task, id=17, number=152, title="[DEV] Future task", body="Scope\n\n1. existing\n",
            html_url="https://github.com/owner/repo/issues/152",
        )
        api = FakeGitHub(existing=[old])
        plans = self.quiet_upsert(api, [task], apply=True)
        self.assertEqual(plans[0]["action"], "update")
        self.assertEqual(plans[0]["github_number"], 152)
        self.assertEqual(api.posts, [])
        self.assertEqual(api.writes[0][0], "PATCH")
        self.assertTrue(api.writes[0][1].endswith("/issues/152"))
        self.assertEqual(api.writes[0][3]["title"], task.title)
        self.assertNotIn("state", api.writes[0][3])

    def test_title_stem_updates_when_the_github_number_differs(self):
        task = tasks.read_task(self.entry)
        old = self.remote_issue(task, id=17, number=250, title="[DEV] Future task", body="Old body\n")
        api = FakeGitHub(existing=[old])
        plans = self.quiet_upsert(api, apply=True)
        self.assertEqual(plans[0]["github_number"], 250)
        self.assertEqual(api.writes[0][3]["title"], "[Developer] Future task")

    def test_role_alias_on_the_planned_number_wins_over_a_later_marker(self):
        task = tasks.read_task(self.entry)
        original = self.remote_issue(
            task, id=17, number=152, title="[DEV] Future task", body="Scope\n\n1. existing\n",
            html_url="https://github.com/owner/repo/issues/152",
        )
        duplicate = self.remote_issue(task, id=39, number=390, title=task.title, body=task.description)
        api = FakeGitHub(existing=[original, duplicate])
        plans = self.quiet_upsert(api, apply=True)
        self.assertEqual(plans[0]["action"], "update")
        self.assertEqual(plans[0]["github_number"], 152)
        self.assertTrue(api.writes[0][1].endswith("/issues/152"))
        self.assertEqual(api.writes[0][3]["title"], "[Developer] Future task")

    def test_planned_number_updates_when_the_title_wording_differs(self):
        task = tasks.read_task(self.entry)
        original = self.remote_issue(
            task, id=18, number=152, title="[DEV] Implement Company, Customer, and Future task", body="Scope\n\n1. existing\n",
            html_url="https://github.com/owner/repo/issues/152",
        )
        duplicate = self.remote_issue(task, id=39, number=390, title=task.title, body=task.description)
        api = FakeGitHub(existing=[original, duplicate])
        plans = self.quiet_upsert(api, apply=True)
        self.assertEqual(plans[0]["action"], "update")
        self.assertEqual(plans[0]["github_number"], 152)
        self.assertTrue(api.writes[0][1].endswith("/issues/152"))
        self.assertEqual(api.writes[0][3]["title"], task.title)

    def test_different_role_prefix_is_not_the_same_issue(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(task, id=1, number=10, title="[SA] Future task", body="other role\n")])
        plans = self.quiet_upsert(api)
        self.assertEqual(plans[0]["action"], "create")
        self.assertIsNone(plans[0]["github_number"])

    def test_multiple_title_matches_without_the_planned_number_stop(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[
            self.remote_issue(task, id=1, number=10, title="[DEV] Future task", body="one\n"),
            self.remote_issue(task, id=2, number=11, title="[Developer] Future task", body="two\n"),
        ])
        with self.assertRaises(tasks.TaskError) as exc:
            self.quiet_upsert(api)
        self.assertIn("multiple", str(exc.exception).lower())

    def test_create_skips_an_existing_issue_with_the_same_number(self):
        task = tasks.read_task(self.entry)
        api = FakeGitHub(existing=[self.remote_issue(task, id=17, number=152, title="[DEV] Future task", body="old\n")])
        with contextlib.redirect_stdout(io.StringIO()):
            tasks.create_tasks(api, [task])
        self.assertEqual(api.posts, [])

    # HTTP client

    def test_pagination_and_repository_path(self):
        api = tasks.GitHub("https://github.com", "owner/my.repo", "fake")
        self.assertEqual(api.base, "https://api.github.com")
        self.assertEqual(api.repo_path, "/repos/owner/my.repo")
        enterprise = tasks.GitHub("https://github.example.com", "org/repo", "fake")
        self.assertEqual(enterprise.base, "https://github.example.com/api/v3")
        with patch.object(api, "request", side_effect=[
            ([{"id": 1, "number": 1, "title": "a", "body": "", "labels": [], "assignees": [], "state": "open"}], {"Link": '<https://api.github.com/repos/owner/my.repo/issues?per_page=100&page=2>; rel="next"'}),
            ([{"id": 2, "number": 2, "title": "b", "body": "", "labels": [], "assignees": [], "state": "open"}], {"Link": ""}),
        ]) as request:
            self.assertEqual([issue["number"] for issue in api.all_issues()], [1, 2])
            self.assertEqual(request.call_args_list[1].kwargs["params"]["page"], 2)

    def test_insecure_or_credential_bearing_urls_and_repos_rejected(self):
        for url in ["http://github.com", "https://user:pass@github.com", "https://github.com?token=x", "https://api.github.com"]:
            with self.subTest(url=url), self.assertRaises(tasks.TaskError):
                tasks.GitHub(url, "owner/repo", "fake")
        for repo in ["owner/repo.git", "group/sub/repo", "owner", "https://github.com/owner/repo"]:
            with self.subTest(repo=repo), self.assertRaises(tasks.TaskError):
                tasks.GitHub("https://github.com", repo, "fake")
        with self.assertRaises(tasks.TaskError):
            tasks.GitHub("https://github.com", "owner/repo", "")

    def test_http_error_redacts_token_and_keeps_status(self):
        api = tasks.GitHub("https://github.com", "owner/repo", "fake-secret-token")
        error = HTTPError("https://api.github.com/repos/owner/repo", 401, "Unauthorized", None, io.BytesIO(b'{"message":"bad fake-secret-token"}'))
        with patch.object(api.opener, "open", side_effect=error):
            with self.assertRaises(tasks.TaskError) as exc:
                api.request("GET", api.repo_path)
        self.assertEqual(exc.exception.status, 401)
        self.assertIn("[REDACTED]", str(exc.exception))
        self.assertNotIn("fake-secret-token", str(exc.exception))

    def test_network_error_redacts_token_and_never_retries(self):
        api = tasks.GitHub("https://github.com", "owner/repo", "fake-secret-token")
        with patch.object(api.opener, "open", side_effect=URLError("refused fake-secret-token")) as opener:
            with self.assertRaises(tasks.TaskError) as exc:
                api.request("POST", api.repo_path + "/issues", payload={"title": "x"})
        self.assertEqual(opener.call_count, 1)
        self.assertIsNone(exc.exception.status)
        self.assertIn("never retried", str(exc.exception))
        self.assertNotIn("fake-secret-token", str(exc.exception))

    def test_redirects_are_not_followed(self):
        self.assertIsNone(tasks.NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://evil.example/steal"))


if __name__ == "__main__":
    unittest.main()
