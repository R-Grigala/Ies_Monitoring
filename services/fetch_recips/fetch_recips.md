# Fetch Recips

Exports active notification recipients from the IES Monitoring API into plain-text contact list files.

## What it does

1. Calls `GET /api/recips/` with a service API key (`X-API-Key`).
2. Keeps only **active** recipients and their **active** phones/emails.
3. Writes four files into the configured output directory:

| File | Contents |
|------|----------|
| `number_list` | Phone numbers for all active recipients (staff **and** non-staff) |
| `mail_list` | Emails for all active recipients (staff **and** non-staff) |
| `staff_number_list` | Phone numbers for **staff only** |
| `staff_mail_list` | Emails for **staff only** |

Phone lines look like: `995599123456    # username` (leading `+` is stripped).  
Email lines are the address only.

## Requirements

- Python 3.9+ (stdlib only; no extra packages)
- The Flask app running and reachable
- A service API key with **`can_recips`** or **`can_recips_read`**

## Configuration

Edit the top of `fetch_recips.py`:

```python
BASE_URL = "http://127.0.0.1:5000"   # API base URL
API_KEY = "ies_..."                  # service key from /api/services/
OUTPUT_DIR = None                    # see below
```

Do not commit real production keys. Rotate the key if it was shared.

### `OUTPUT_DIR` — where files are written

Set this variable in `fetch_recips.py`. The folder is created automatically if it does not exist.

Important distinction:

- **Script location** = the folder that contains `fetch_recips.py` (e.g. `.../services/fetch_recips/`)
- **Working directory** = the folder you are in when you type `python3 ...` (can be different)

#### 1. `OUTPUT_DIR = None` (default)

Writes into the **script folder** (next to `fetch_recips.py`).

Does **not** depend on where you run the command from.

```text
python3 services/fetch_recips/fetch_recips.py
→ files go to services/fetch_recips/
```

#### 2. Absolute path

```python
OUTPUT_DIR = Path("/var/ies/contact_lists")
```

Always writes to that exact folder on disk.

Also independent of where you run the command from. Use this on a server when another program expects lists in a fixed location.

#### 3. Path next to the script (recommended for a subfolder)

```python
OUTPUT_DIR = Path(__file__).resolve().parent / "out"
```

`__file__` is the script’s own path, so this means:  
“create/use an `out` folder **beside** `fetch_recips.py`”.

Independent of where you run the command from.

```text
Repo layout:
  services/fetch_recips/fetch_recips.py
  services/fetch_recips/out/number_list   ← written here
```

#### 4. Relative path (depends on where you run from)

```python
OUTPUT_DIR = Path("out")
```

This is relative to your **current working directory**, not the script folder.

```text
cd /tmp && python3 /path/to/fetch_recips.py
→ files go to /tmp/out
```

Prefer options 1–3 unless you intentionally want cwd-based output.

## How to run

From this directory:

```bash
cd services/fetch_recips
python3 fetch_recips.py
```

Or from the repo root:

```bash
python3 services/fetch_recips/fetch_recips.py
```

On success you will see something like:

```text
Wrote /path/to/output/staff_number_list (N entries)
Wrote /path/to/output/staff_mail_list (N entries)
Wrote /path/to/output/number_list (N entries)
Wrote /path/to/output/mail_list (N entries)
```

Files are overwritten each run. Empty lists produce empty files.

## Common errors

| Error | Likely cause |
|-------|----------------|
| `Could not reach API` | App not running, or wrong `BASE_URL` |
| `HTTP 401` | Invalid or missing `API_KEY` |
| `HTTP 403` | Key lacks `can_recips` / `can_recips_read` |
| Permission / write error | `OUTPUT_DIR` not writable |
