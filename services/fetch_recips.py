#!/usr/bin/env python3
"""Login to the local API and export active recipient contact lists."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_BASE_URL = "http://127.0.0.1:5000"
DEFAULT_EMAIL = ""
DEFAULT_PASSWORD = ""

OUTPUT_FILES = (
    "staff_number_list",
    "staff_mail_list",
    "number_list",
    "mail_list",
)


def _request(method: str, url: str, *, data: dict | None = None, token: str | None = None) -> dict:
    headers = {"Accept": "application/json"}
    body = None

    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"

    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with HTTP {err.code}: {detail}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"Could not reach {url}: {err.reason}") from err


def login(base_url: str, email: str, password: str) -> str:
    payload = _request(
        "POST",
        f"{base_url}/api/auth/login",
        data={"email": email, "password": password},
    )
    access_token = payload.get("access_token")
    if not access_token:
        raise RuntimeError(f"Login response did not include access_token: {payload}")
    return access_token


def fetch_recips(base_url: str, access_token: str) -> dict:
    return _request(
        "GET",
        f"{base_url}/api/recips/",
        token=access_token,
    )


def format_phone(phone_number: str) -> str:
    return (phone_number or "").lstrip("+").strip()


def format_number_line(phone_number: str, username: str) -> str:
    return f"{format_phone(phone_number)}    # {username}"


def build_lists(payload: dict) -> dict[str, list[str]]:
    lists = {
        "staff_number_list": [],
        "staff_mail_list": [],
        "number_list": [],
        "mail_list": [],
    }

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
            if not phone:
                continue
            lists[number_key].append(format_number_line(phone, username))

        for email in recip.get("emails") or []:
            if not email.get("is_active", False):
                continue
            address = (email.get("email") or "").strip()
            if not address:
                continue
            lists[mail_key].append(address)

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


def print_recips(payload: dict) -> None:
    items = [r for r in (payload.get("items") or []) if r.get("is_active", False)]
    print(f"Active recipients: {len(items)}")
    print("-" * 60)

    if not items:
        print("No active recipients found.")
        return

    for recip in items:
        print(f"ID: {recip.get('id')}")
        print(f"Username: {recip.get('username')}")
        print(f"Staff: {recip.get('is_staff')} | Active: {recip.get('is_active')}")

        emails = [e for e in (recip.get("emails") or []) if e.get("is_active", False)]
        numbers = [n for n in (recip.get("numbers") or []) if n.get("is_active", False)]

        if emails:
            print("Emails:")
            for email in emails:
                print(f"  - [{email.get('id')}] {email.get('email')}")
        else:
            print("Emails: (none)")

        if numbers:
            print("Numbers:")
            for number in numbers:
                print(f"  - [{number.get('id')}] {number.get('phone_number')}")
        else:
            print("Numbers: (none)")

        print("-" * 60)


def parse_args() -> argparse.Namespace:
    default_output_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Login to localhost API and export recipient contact lists.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("API_BASE_URL", DEFAULT_BASE_URL),
        help=f"API base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--email",
        default=os.getenv("API_EMAIL", DEFAULT_EMAIL),
        help="Login email",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("API_PASSWORD", DEFAULT_PASSWORD),
        help="Login password",
    )
    parser.add_argument(
        "--output-dir",
        default=str(default_output_dir),
        help=f"Directory for list files (default: {default_output_dir})",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Also print raw JSON response",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    output_dir = Path(args.output_dir)

    print(f"Logging in as {args.email} at {base_url} ...")
    access_token = login(base_url, args.email, args.password)
    print("Login successful. Fetching recipients ...")

    payload = fetch_recips(base_url, access_token)
    lists = build_lists(payload)
    write_lists(lists, output_dir)

    if args.json:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print_recips(payload)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
