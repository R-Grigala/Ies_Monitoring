# Earthquake Notification System (ENS)

Real-time earthquake notification platform for Android and iOS devices.

## Project Management

- Trello Board: [IES Monitoring](https://trello.com/b/ShiKsW69/iesmonitoring)

## Features

- Real-time earthquake event processing
- Push notifications for Android and iOS
- SeisComP integration
- User subscriptions and preferences
- Monitoring and analytics
- High availability and disaster recovery support

## Technology Stack

- Backend: Flask, Flask-RESTx
- Mobile: React Native
- Database: MySQL
- Queue & Cache: Redis, Celery
- Notifications: FCM, APNs
- Infrastructure: Docker, Nginx, Ubuntu
- Monitoring: Prometheus, Grafana, ELK

## Documentation

- [Project Overview](docs/01-project-overview.md)
- [System Architecture](docs/02-system-architecture.md)
- [Software Requirements](docs/03-software-requirements.md)
- [System Design](docs/04-system-design.md)
- [Authentication Design](docs/05-authentication-design.md)
- [Accounts and Permissions Design](docs/06-accounts-and-permissions-design.md)
- [Notification Design](docs/07-notification-design.md)
- [Backend Setup](docs/08-backend-setup.md)
- [API Inventory (Implemented)](docs/09-api-inventory.md)

## Current Backend Status

**Implemented**

- Auth: login, admin register, refresh/logout, password reset
- Accounts admin UI/API (`/api/accounts/...`)
- Service accounts + API keys UI/API (`/api/services`, `/services`)
- Recipients UI/API (`/api/recips`, `/notify`)
- Permissions catalog REST (`/api/permissions`) + user grant/revoke on accounts
- Permissions seed + runtime checks (`can_users`, `can_permissions`, `can_recips`, `can_recips_read`)
- JWT + service `X-API-Key` auth

**Planned**

- Change-password API
- Earthquakes / SeisComP ingest
- Push delivery, Redis/Celery
- Health endpoint

Source of truth for endpoints: [docs/09-api-inventory.md](docs/09-api-inventory.md).

## Testing

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

API tests live in `tests/` and use an in-memory SQLite database via `TestingConfig`.
