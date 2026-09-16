#!/usr/bin/env python3
"""Export active recipient contact lists using a service API key."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path


BASE_URL = "http://127.0.0.1:5000"
API_KEY = "ies_iiAb6mCtrOcOMU3_w1pNUfwJ5NaSjnKJFDrZWlm-TOb0"

# Where list files are written. See README.md → "OUTPUT_DIR".
# Examples:
#   OUTPUT_DIR = None
#       → script folder (next to this file); ignores where you run from
#   OUTPUT_DIR = Path("/var/ies/contact_lists")
#       → absolute path; always that folder; ignores where you run from
#   OUTPUT_DIR = Path(__file__).resolve().parent / "out"
#       → "out" next to this script; ignores where you run from
#   OUTPUT_DIR = Path("out")
#       → relative to current working directory (where you run the command)
OUTPUT_DIR = None

OUTPUT_FILES = (
    "staff_number_list",
    "staff_mail_list",
    "number_list",
    "mail_list",
)


def get_output_dir() -> Path:
    if OUTPUT_DIR is None:
        return Path(__file__).resolve().parent
    return Path(OUTPUT_DIR).expanduser().resolve()


def fetch_recips() -> dict | None:
    request = urllib.request.Request(
        f"{BASE_URL.rstrip('/')}/api/recips/",
        headers={
            "Accept": "application/json",
            "X-API-Key": API_KEY,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        if err.code == 401:
            print(
                "API key is incorrect or unauthorized (HTTP 401). "
                "Check API_KEY in fetch_recips.py and try again."
            )
            if detail.strip():
                print(f"Details: {detail.strip()}")
            return None
        raise RuntimeError(f"GET /api/recips/ failed with HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"Could not reach API: {err.reason}") from err


def format_phone(phone_number: str) -> str:
    return (phone_number or "").lstrip("+").strip()


def build_lists(payload: dict) -> dict[str, list[str]]:
    lists = {name: [] for name in OUTPUT_FILES}

    for recip in payload.get("items") or []:
        if not recip.get("is_active", False):
            continue

        username = (recip.get("username") or "").strip() or "unknown"
        is_staff = bool(recip.get("is_staff"))
        number_keys = ["number_list"]
        mail_keys = ["mail_list"]
        if is_staff:
            number_keys.append("staff_number_list")
            mail_keys.append("staff_mail_list")

        for number in recip.get("numbers") or []:
            if not number.get("is_active", False):
                continue
            phone = format_phone(number.get("phone_number") or "")
            if phone:
                entry = f"{phone}    # {username}"
                for key in number_keys:
                    lists[key].append(entry)

        for email in recip.get("emails") or []:
            if not email.get("is_active", False):
                continue
            address = (email.get("email") or "").strip()
            if address:
                for key in mail_keys:
                    lists[key].append(address)

    return lists


def write_lists(lists: dict[str, list[str]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename in OUTPUT_FILES:
        path = output_dir / filename
        lines = lists.get(filename) or []
        content = "\n".join(lines)
        if content:
            content += "\n"
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path} ({len(lines)} entries)")


def main() -> None:
    output_dir = get_output_dir()
    payload = fetch_recips()
    if payload is None:
        return
    write_lists(build_lists(payload), output_dir)


if __name__ == "__main__":
    main()
