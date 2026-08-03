#!/usr/bin/env python3
"""Export active recipient contact lists using a service API key."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path


BASE_URL = "http://127.0.0.1:5000"
API_KEY = "ies_1tu1G2P2FFw1ArpRANPJdM-7xOzkAEUWnKq33Be-Vgo"

OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_FILES = (
    "staff_number_list",
    "staff_mail_list",
    "number_list",
    "mail_list",
)


def fetch_recips() -> dict:
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
        number_key = "staff_number_list" if is_staff else "number_list"
        mail_key = "staff_mail_list" if is_staff else "mail_list"

        for number in recip.get("numbers") or []:
            if not number.get("is_active", False):
                continue
            phone = format_phone(number.get("phone_number") or "")
            if phone:
                lists[number_key].append(f"{phone}    # {username}")

        for email in recip.get("emails") or []:
            if not email.get("is_active", False):
                continue
            address = (email.get("email") or "").strip()
            if address:
                lists[mail_key].append(address)

    return lists


def write_lists(lists: dict[str, list[str]]) -> None:
    for filename in OUTPUT_FILES:
        path = OUTPUT_DIR / filename
        lines = lists.get(filename) or []
        content = "\n".join(lines)
        if content:
            content += "\n"
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path} ({len(lines)} entries)")


def main() -> None:
    payload = fetch_recips()
    write_lists(build_lists(payload))


if __name__ == "__main__":
    main()
