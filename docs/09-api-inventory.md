# API Inventory (Implemented)

ეს დოკუმენტი აღწერს **ამჟამად იმპლემენტირებულ** API-ებსა და UI-ს. დაგეგმილი ფუნქციონალი მონიშნულია ცალკე.

Base URL: `http://localhost:5000/api`  
Swagger UI: `http://localhost:5000/api/docs`

---

## Implementation Status

| მოდული | სტატუსი |
|--------|---------|
| Auth (login/register/refresh/logout/reset) | Implemented |
| Accounts (profile + user admin) | Implemented |
| Service accounts + API keys (`/api/services`) | Implemented |
| Recipients (`/api/recips`) | Implemented |
| Permissions models + seed + runtime checks | Implemented |
| Permissions REST catalog (list/create/delete) | Implemented |
| User permission grant/revoke on accounts | Implemented |
| Register with optional permissions | Implemented |
| `PUT /api/auth/change_password` | Planned (UI page exists) |
| `GET /api/health` | Planned |
| Earthquakes table / SeisComP / Push / Redis / Celery | Planned |

---

## Authentication methods

| მეთოდი | Header / Cookie | გამოყენება |
|--------|-----------------|------------|
| JWT Access | `Authorization: Bearer <token>` | Web UI და მომხმარებლის API |
| JWT Refresh | HttpOnly cookie (`path=/api/auth`) | მხოლოდ `/api/auth/refresh` |
| Service API Key | `X-API-Key: ies_...` | Service accounts; უფლებები `service_permissions`-იდან |

ბევრი admin endpoint მხარდაჭერილია **JWT ან API key**-ით (`require_permissions`).

---

## Auth — `/api/auth`

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/auth/register` | JWT/API key + `can_users` | Admin creates users. Body: `first_name`, `last_name`, `email`, `password`, `passwordRepeat`, optional `permission_codes` / `permissions` (array of codes). Grants listed active permissions on create. Error `email_already_registered` if email exists |
| POST | `/api/auth/login` | Public | `access_token`, `token_type`, `expires_in`. Refresh in HttpOnly cookie |
| POST | `/api/auth/refresh` | Refresh cookie | Rotation + family revoke on reuse |
| POST | `/api/auth/logout` | Optional | Revokes current session; clears cookies |
| POST | `/api/auth/logout_all` | JWT | All sessions; response has `revoked_sessions` |
| POST | `/api/auth/request_reset_password` | Public | Body: `email`. 60s cooldown (`users.last_sent_email`) |
| PUT | `/api/auth/reset_password` | Public | Body: `token`, `password`, `retype_password`. itsdangerous URL token, TTL 300s |

Password policy: min 12 chars, upper + lower + digit + special. Hashing: Werkzeug.

---

## Accounts — `/api/accounts`

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/accounts/ourself` | JWT | Profile + flags `can_users`, `can_recips` |
| PUT | `/api/accounts/ourself` | JWT | Own `first_name`, `last_name` |
| GET | `/api/accounts/` | JWT/API key + `can_users` | `{ items, total }` |
| GET | `/api/accounts/<uuid>` | JWT/API key + `can_users` | Single user |
| PUT | `/api/accounts/<uuid>` | JWT/API key + `can_users` | `first_name`, `last_name`, `email`, `is_active`. Cannot deactivate self |
| DELETE | `/api/accounts/<uuid>` | JWT/API key + `can_users` | Hard delete when FK allows. Cannot delete self |

### User permission assignment

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/accounts/<uuid>/permissions` | same | User's active permissions |
| POST | `/api/accounts/<uuid>/permissions` | same | Grant. Body: `permission_codes` and/or `permission_ids` (or `permissions` codes array). Soft history: re-grant creates new row |
| DELETE | `/api/accounts/<uuid>/permissions/<code>` | same | Soft revoke (`degranted_at`). Cannot revoke own `can_users` / `can_permissions` |

GET `/api/accounts/<uuid>` also returns `permissions: ["can_recips", ...]` for active codes.

---

## Permissions catalog — `/api/permissions`

Catalog management is separate from user assignment. Create/list/delete requires `can_permissions` **or** `can_users`.

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/permissions/` | JWT/API key + `can_permissions` or `can_users` | All permissions (active + inactive). `{ items, total }` |
| POST | `/api/permissions/` | same | Create. Body: `code`, `name`, optional `description`. Re-activates soft-deleted same `code` (200). Conflict if active duplicate (409) |
| GET | `/api/permissions/<code_or_id>` | same | Single permission by code or numeric id |
| DELETE | `/api/permissions/<code_or_id>` | same | Hard delete if unassigned; otherwise soft-deactivate (`is_active=false`) while referenced |

---

## Services — `/api/services`

Service accounts hold hashed API keys and assigned permissions (`service_permissions`).

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/services/` | JWT/API key + `can_users` | List services + active permission codes |
| POST | `/api/services/` | JWT/API key + `can_users` | Register service. Body: `name`, optional `description`, `permissions` (array of codes). Returns **one-time** `api_key` |
| DELETE | `/api/services/<uuid>` | JWT/API key + `can_users` | Delete service + permission assignments |

Raw API key is shown only once at registration (`api_key_hash` is stored).

---

## Recipients — `/api/recips`

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/api/recips/` | JWT/API key + `can_recips` **or** `can_recips_read` | List with nested emails/numbers |
| GET | `/api/recips/<id>` | same | Detail |
| POST | `/api/recips/` | JWT/API key + `can_recips` | Create |
| PUT | `/api/recips/<id>` | `can_recips` | Update |
| DELETE | `/api/recips/<id>` | `can_recips` | Delete + cascade channels |
| POST | `/api/recips/<id>/emails` | `can_recips` | Add email |
| PUT | `/api/recips/emails/<email_id>` | `can_recips` | Update email |
| DELETE | `/api/recips/emails/<email_id>` | `can_recips` | Remove email |
| POST | `/api/recips/<id>/numbers` | `can_recips` | Add phone (`+9955XXXXXXXX`) |
| PUT | `/api/recips/numbers/<number_id>` | `can_recips` | Update phone |
| DELETE | `/api/recips/numbers/<number_id>` | `can_recips` | Remove phone |

---

## Seeded permissions

| Code | Usage |
|------|--------|
| `can_users` | Register users, accounts admin, services admin UI/API |
| `can_permissions` | Permission catalog CRUD; also grant/revoke on accounts (or with `can_users`) |
| `can_recips` | Full recipients write + Notify UI |
| `can_recips_read` | Read-only recipients (typical for service API keys) |

Admin seed (`flask populate_db`):

- email: `roma.grigalashvili@iliauni.edu.ge`
- password: `PASSWORD` (change before production)
- all four permissions assigned

---

## Implemented data models

| Table | Purpose |
|-------|---------|
| `users` | Identity users |
| `permissions` | Permission catalog |
| `user_permissions` | User ↔ permission grants (with degrant history) |
| `refresh_tokens` | Refresh token sessions / rotation |
| `services` | Service accounts + API key hash/prefix |
| `service_permissions` | Service ↔ permission grants |
| `recips` | Notification recipients |
| `recip_emails` | Recipient emails |
| `recip_numbers` | Recipient phones |

---

## Web UI (server-rendered)

| Path | Purpose | Permission (navbar) |
|------|---------|---------------------|
| `/<lang>/login` | Login | Public |
| `/<lang>/accounts` | Accounts admin (+ link to Services) | `can_users` |
| `/<lang>/registration` | Register new user (full page) | `can_users` (client-checked; API enforces) |
| `/<lang>/services` | Service registration / delete (from Accounts) | `can_users` |
| `/<lang>/notify` | Recipients admin | `can_recips` |
| `/<lang>/change_password` | Change password page | Logged-in (API pending) |
| `/<lang>/reset_password/<token>` | Reset password | Public |
| `/<lang>/forgot` (or auth forgot flow) | Request reset | Public |

Registration of users happens on `/<lang>/registration` (linked from Accounts → Add user). API: `POST /api/auth/register` with optional permissions from `GET /api/permissions/`.  
Service API keys are shown once after register on the Services page.

UI strings: EN/KA via `app/static/js/i18n.js`.

---

## Code layout (API)

| Area | Files |
|------|--------|
| Auth | `app/api/auth.py`, `app/api/nsmodels/auth.py` |
| Accounts | `app/api/accounts.py`, `app/api/nsmodels/accounts.py` |
| Services | `app/api/services.py`, `app/api/nsmodels/services.py` |
| Recips | `app/api/recips.py`, `app/api/nsmodels/recips.py` |
