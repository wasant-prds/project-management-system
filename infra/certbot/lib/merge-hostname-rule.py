#!/usr/bin/env python3
"""Merge one hostname SSL rule into a Cloudflare http_config_settings ruleset.

Configuration rules stop at the first match, so the hostname rule is inserted
first. Other rules stay in their existing order.
"""

import json
import os
import sys

KEEP = (
    "id",
    "ref",
    "description",
    "expression",
    "action",
    "action_parameters",
    "enabled",
    "logging",
)


def main() -> None:
    raw = sys.stdin.read()
    domain = os.environ["PMS_DOMAIN"]
    description = os.environ["PMS_RULE_DESCRIPTION"]
    action = os.environ.get("PMS_RULE_ACTION", "upsert")
    payload = json.loads(raw) if raw.strip() else {}
    result = payload.get("result") if isinstance(payload, dict) else None
    success = isinstance(payload, dict) and payload.get("success") is True
    if success and (not isinstance(result, dict) or not isinstance(result.get("rules"), list)):
        sys.stderr.write("ruleset response has no rules list\n")
        sys.exit(1)
    rules = []
    if isinstance(result, dict) and isinstance(result.get("rules"), list):
        rules = result["rules"]

    kept = []
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if rule.get("description") == description:
            continue
        kept.append({key: rule[key] for key in KEEP if key in rule})

    if action == "upsert":
        kept.insert(
            0,
            {
                "description": description,
                "expression": f'(http.host eq "{domain}")',
                "action": "set_config",
                "action_parameters": {"ssl": "strict"},
                "enabled": True,
            },
        )
    elif action != "remove":
        sys.stderr.write("PMS_RULE_ACTION must be upsert or remove\n")
        sys.exit(1)

    json.dump({"rules": kept}, sys.stdout)


if __name__ == "__main__":
    main()
