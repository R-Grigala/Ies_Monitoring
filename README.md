# Ies_Monitoring

Flask-based API Gateway and web interface for seismic monitoring workflows:
event ingestion, ShakeMap generation, result visualization, and user/role management.

## Overview

This project is designed to operate as a monitoring backend + lightweight frontend for earthquake operations.

Core capabilities:
- Store and manage seismic events
- Trigger ShakeMap generation by `seiscomp_oid`
- View generated ShakeMap images (PGA / PGV / Intensity)
- Manage users, roles, and permissions with JWT auth
- Support both JWT-based auth and API-key-based internal integration

## Main Pages

- `/` - Home
- `/shakemap` - ShakeMap operations dashboard
- `/events` - Event creation and event list
- `/login` - Login page
- `/change_password` - Authenticated password change
- `/reset_password/<token>` - Password reset flow from email link
- `/accounts` - Accounts and roles management

## Main API Endpoints

### Events
- `GET /api/events` - List all events
- `POST /api/events` - Create/update event (`X-API-Key` required)

### ShakeMap
- `POST /api/shakemap` - Trigger ShakeMap generation (`seiscomp_oid`)
- `GET /api/shakemap/<seiscomp_oid>` - Get ShakeMap result metadata (images + paths)
- `GET /api/shakemap/<seiscomp_oid>/image/<image_type>` - Get image file

### Auth
- `POST /api/login`
- `POST /api/refresh`
- `POST /api/registration` (admin/authorized users only)

### Accounts
- `GET /api/user`
- `PUT /api/user/<uuid>`
- `GET /api/accounts`
- `PUT /api/accounts/<uuid>`
- `GET/POST /api/roles`
- `GET/PUT /api/roles/<role_id>`
- `POST /api/request_reset_password`
- `PUT /api/reset_password`
- `PUT /api/change_password`

## Authentication Modes

The project supports two security schemes:

1. **ApiKeyAuth**
- Header: `X-API-Key: <your_key>`
- Intended for internal/system integrations

2. **JsonWebToken**
- Header: `Authorization: Bearer <access_token>`
- Intended for user-facing authenticated actions

Swagger UI is available at:
- `/api`

## Configuration

Important environment variables:
- `SECRET_KEY`
- `API_KEY`
- `JWT_SECRET_KEY` (must be strong, at least 32 bytes recommended)
- `SHAKEMAP_BASE_PATH`
- DB variables (SQLite/MySQL setup)
- Mail variables (`MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`)

## Run Locally

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Run with Docker Compose

```bash
docker compose up --build
```

Services defined in `docker-compose.yaml`:
- Flask
- Nginx
- MySQL

## Project Structure (high-level)

```text
src/
  api/         # REST endpoints
  models/      # SQLAlchemy models
  services/    # ShakeMap, mail, serializers
  views/       # Flask blueprints (HTML pages)
  templates/   # Jinja templates
  static/      # JS/CSS/images
```

## Notes

- Event creation UI is separated into `/events`
- ShakeMap operations and visualization are available in `/shakemap`
- Password reset (email token) and authenticated password change are separated flows

For a detailed internal operation guide, see:
- `instruction.txt`
