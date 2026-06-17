# Ies_Monitoring

Flask-based seismic monitoring platform for:
- earthquake event ingestion/storage
- ShakeMap job triggering and result browsing
- role-based user management
- JWT + API-key protected API access

---

## Core Features

- Manage seismic events (`/events`, `/api/events`)
- Run ShakeMap by `seiscomp_oid` (`/api/shakemap`)
- View ShakeMap image products (`pga`, `pgv`, `intensity`)
- Manage users/roles/permissions (`/accounts`, `/api/accounts`, `/api/roles`)
- Manage notification recipients (email/phone APIs)

---

## Main Web Pages

- `/` - Home
- `/events` - Earthquake event list and CRUD UI
- `/shakemap` - ShakeMap dashboard and gallery
- `/login`, `/registration`
- `/reset_password/<token>`, `/change_password`
- `/accounts` - User/role administration

Swagger UI:
- `/api`

---

## API Overview

### Events
- `GET /api/events`
- `POST /api/events`
- `PUT /api/events/<id>`
- `DELETE /api/events/<id>`

### ShakeMap
- `POST /api/shakemap`
- `GET /api/shakemap/<seiscomp_oid>`
- `GET /api/shakemap/<seiscomp_oid>/image/<image_type>`

### Auth
- `POST /api/login`
- `POST /api/refresh`
- `POST /api/logout`
- `POST /api/registration`

### Accounts / Roles
- `GET /api/user`
- `GET/PUT /api/accounts`, `GET/PUT /api/accounts/<uuid>`
- `GET/POST /api/roles`, `GET/PUT /api/roles/<role_id>`
- `POST /api/request_reset_password`
- `PUT /api/reset_password`
- `PUT /api/change_password`

### Filters / Recipients
- `POST /api/filter_event`
- `GET/POST /api/phone_recipients`, `GET/PUT/DELETE /api/phone_recipients/<id>`
- `GET/POST /api/email_recipients`, `GET/PUT/DELETE /api/email_recipients/<id>`

---

## Authentication Modes

1) **API Key**
- Header: `X-API-Key: <API_KEY>`
- Used for internal/system integrations

2) **JWT**
- Header: `Authorization: Bearer <access_token>`
- Used for authenticated web/API user actions

---

## Project Structure

```text
app.py
src/
  __init__.py           # App factory
  config.py             # Environment-based config
  extensions.py         # db/migrate/jwt/restx instances
  commands.py           # Flask CLI commands (init_db, populate_db)
  api/                  # REST resources
  api/nsmodels/         # RESTX namespaces/parsers/models
  models/               # SQLAlchemy models
  services/             # ShakeMap/mail/token services
  tasks/                # Celery tasks
  workers/              # Worker wrappers
  views/                # Blueprint page routes
  templates/            # Jinja templates
  static/               # JS/CSS/images
  logger/               # Logging configuration
migrations/             # Alembic migrations
tests/                  # Unit tests
instruction.txt         # Deployment/operations notes
conf_*.txt              # Gunicorn/Celery/Redis/Migration guides
```

---

## Requirements

- Python 3.10+
- Redis (for Celery broker/backend)
- MySQL (production/development), SQLite (testing default)
- ShakeMap tools available in configured conda environment

Python dependencies are listed in `requirements.txt`.

---

## Environment Variables

Set in `.env` (loaded by `src/config.py`):

- `APP_ENV` (`production` | `development` | `testing`)
- `MY_SECRET_KEY`
- `API_KEY`
- `JWT_SECRET_KEY`
- `MYSQL_HOST`, `MYSQL_DATABASE`, `DEV_MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- `SQLALCHEMY_DATABASE_URI` (optional override)
- `SHAKEMAP_BASE_PATH`
- `GOOGLE_MAPS_API_KEY`
- `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`
- `REDIS_URL` (or `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`)

---

## Local Run

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Default dev server: `http://0.0.0.0:5000`

---

## Celery Worker Run

In a separate terminal:

```bash
celery -A src.celery_app.celery_app worker --loglevel=info
```

---

## Database Commands

```bash
# Recreate schema (destructive)
flask init_db --confirm-text RESET_DB

# Seed sample data (event, roles, users)
flask populate_db
```

Migrations:

```bash
flask db migrate -m "your message"
flask db upgrade
```

---

## Logging

Application logs are written under `logs/` (created automatically), including:

- `events.log`
- `filters.log`
- `auth.log`
- `shakemap.log`
- `run_shakemap.log`
- `requests.log`

---

## Testing

```bash
python -m unittest discover tests
```

---

## Notes

- `event_id` is optional in seismic events; ShakeMap flow depends on `seiscomp_oid`.
- For full production/systemd setup details, see `instruction.txt` and `conf_*.txt`.
