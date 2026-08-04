# API Inventory (Implemented)

ეს დოკუმენტი აღწერს **ამჟამად იმპლემენტირებულ** API-ებს. დაგეგმილი (ჯერ არ აგებული) ფუნქციონალი მონიშნულია ცალკე.

Base URL: `http://localhost:5000/api`  
Swagger UI: `http://localhost:5000/api/docs`

---

## Implementation Status

| მოდული | სტატუსი |
|--------|---------|
| Auth (login/register/refresh/logout/reset) | Implemented |
| Accounts (profile + user admin) | Implemented |
| Recipients (`/api/recips`) | Implemented |
| Permissions REST CRUD | Planned (models + seed only) |
| `PUT /api/auth/change_password` | Planned (UI exists, API not yet) |
| `GET /api/health` | Planned |
| Earthquakes / SeisComP / Push / Redis / Celery | Planned |

---

## Auth — `/api/auth`

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/auth/register` | JWT + `can_users` | Admin creates users. Body: `first_name`, `last_name`, `email`, `password`, `passwordRepeat` |
| POST | `/api/auth/login` | Public | Returns `access_token`, `token_type`, `expires_in`. Refresh token in HttpOnly cookie |
| POST | `/api/auth/refresh` | Refresh cookie | Token rotation + family revoke on reuse |
| POST | `/api/auth/logout` | Optional / JWT | Revokes current session; clears cookies |
| POST | `/api/auth/logout_all` | JWT | Revokes all sessions; response includes `revoked_sessions` |
| POST | `/api/auth/request_reset_password` | Public | Body: `email`. 60s cooldown via `users.last_sent_email` |
| PUT | `/api/auth/reset_password` | Public | Body: `token`, `password`, `retype_password`. Signed URL token (itsdangerous), TTL 300s |

Password policy: min 12 chars, upper + lower + digit + special. Hashing: Werkzeug (`generate_password_hash`).

---

## Accounts — `/api/accounts`

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/accounts/ourself` | JWT | Current profile + flags `can_users`, `can_recips` |
| PUT | `/api/accounts/ourself` | JWT | Update own `first_name`, `last_name` |
| GET | `/api/accounts/` | JWT + `can_users` | List `{ items, total }` |
| GET | `/api/accounts/<uuid>` | JWT + `can_users` | Single user |
| PUT | `/api/accounts/<uuid>` | JWT + `can_users` | Update `first_name`, `last_name`, `email`, `is_active`. Cannot deactivate self |
| DELETE | `/api/accounts/<uuid>` | JWT + `can_users` | Hard delete when FK blockers allow. Cannot delete self |

---

## Recipients — `/api/recips`

All endpoints require JWT + `can_recips`.

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/recips/` | List `{ items, total }` with nested emails/numbers |
| POST | `/api/recips/` | Create: `username`, optional `is_staff`, `is_active` |
| GET | `/api/recips/<id>` | Detail |
| PUT | `/api/recips/<id>` | Update username / staff / active |
| DELETE | `/api/recips/<id>` | Delete recipient + cascaded channels |
| POST | `/api/recips/<id>/emails` | Add email |
| PUT | `/api/recips/emails/<email_id>` | Update email / active |
| DELETE | `/api/recips/emails/<email_id>` | Remove email |
| POST | `/api/recips/<id>/numbers` | Add phone (`+9955XXXXXXXX`) |
| PUT | `/api/recips/numbers/<number_id>` | Update phone / active |
| DELETE | `/api/recips/numbers/<number_id>` | Remove phone |

---

## Seeded Permissions

| Code | Usage |
|------|--------|
| `can_users` | Register users + manage accounts list/detail/update/delete |
| `can_permissions` | Seeded; Permissions REST API not implemented yet |
| `can_recips` | Manage notification recipients |

Admin seed (via `flask populate_db`): `roma.grigalashvili@iliauni.edu.ge` with all three permissions.

---

## Web UI (server-rendered)

| Path | Purpose |
|------|---------|
| `/<lang>/login` | Login |
| `/<lang>/accounts` | Accounts admin page |
| `/<lang>/notify` | Recipients admin page |
| `/<lang>/change_password` | Change password page (API pending) |
| `/<lang>/reset_password/<token>` | Reset password page |

Navbar shows Accounts / Notify only when the logged-in user has the matching permission.
