# Alert Zones

## 1. Purpose

This document describes alert zones: polygons drawn on the map that define for which area and which ML magnitude range an earthquake should trigger a notification, who receives it, and through which channels.

### Implementation Status

| Part | Status |
|------|--------|
| `alert_zones` model | Implemented |
| REST API `/api/alert_zones` (CRUD) | Implemented |
| GeoJSON Polygon validation | Implemented |
| Web UI `/<lang>/alert_zones`: draw polygon, create, list, delete, per-zone "On map" toggle | Implemented |
| Editing existing zones in the UI | Implemented |
| Matching events against zones (point-in-polygon) and sending alerts | Planned |

---

## 2. Architecture

A zone is an independent entity. It is not linked to specific recipients: the zone defines **which group** (staff / non-staff) and **which channels** (mail / number / push_notif) should be notified, and the recipients themselves are selected from the `recips` table described in [`07-notification-design.md`](07-notification-design.md).

```text
Seismic event (lat, lon, ML)
    │
    ▼
alert_zones (enabled = true)
    ├── ML ∈ [min_magnitude, max_magnitude]
    └── (lon, lat) ∈ geometry polygon
            │
            ▼
recips (is_active = true, is_staff = notif_is_staff)
    └── notif_channels → recip_emails / recip_numbers / push
```

The database is SQLite (dev) / MySQL (prod) without PostGIS, so the polygon is stored as GeoJSON in a JSON column. The number of zones is small, so the point-in-polygon check runs in Python over the enabled zones.

---

## 3. Data Model

## alert_zones

| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| name | varchar(255) | Zone name (e.g. `Tbilisi`) |
| geometry | json | GeoJSON Polygon, coordinates as `[lon, lat]` |
| min_magnitude | float | ML magnitude lower bound (inclusive) |
| max_magnitude | float \| null | ML magnitude upper bound (inclusive); `null` = no upper limit |
| enabled | boolean | Whether the zone is active |
| notif_is_staff | boolean | `true` → staff recipients, `false` → non-staff recipients |
| notif_channels | json | List of channels: `mail`, `number`, `push_notif` |
| created_at / updated_at | datetime | Audit |
| created_by_user_id / updated_by_user_id | int \| null | Audit (FK → users.id) |

Notes:

- Thresholds are **ML** (local magnitude) values. An event may also have other magnitude types (MW, MB, ...); matching uses the event's ML value.
- `geometry` and `notif_channels` are JSON columns: always assign a new value when changing them (`zone.notif_channels = [...]`). In-place changes (`.append()`) are not persisted.

---

## 4. API Endpoints

### Read (list / detail)

Required permission (any of):

```text
can_recips
can_recips_read
```

Auth: JWT Bearer **or** service `X-API-Key`.

```http
GET    /api/alert_zones
GET    /api/alert_zones/{id}
```

### Write (create / update / delete)

Required permission:

```text
can_recips
```

```http
POST   /api/alert_zones
PUT    /api/alert_zones/{id}
DELETE /api/alert_zones/{id}
```

Create body example:

```json
{
  "name": "Tbilisi",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [44.70, 41.65],
      [44.90, 41.65],
      [44.90, 41.80],
      [44.70, 41.80],
      [44.70, 41.65]
    ]]
  },
  "min_magnitude": 4.0,
  "max_magnitude": 7.0,
  "enabled": true,
  "notif_is_staff": true,
  "notif_channels": ["mail", "push_notif"]
}
```

| Field | Create | Update (PUT) |
|-------|--------|--------------|
| name | Required | Optional |
| geometry | Required | Optional |
| min_magnitude | Required | Optional |
| max_magnitude | Optional (default `null`) | Optional; `null` removes the upper limit |
| enabled | Optional (default `true`) | Optional |
| notif_is_staff | Optional (default `false`) | Optional |
| notif_channels | Required | Optional |

PUT is a partial update: only the fields sent in the body are changed.

Create / Update response:

```json
{
  "message": "Alert zone created successfully.",
  "alert_zone": { "id": 1, "name": "Tbilisi", "geometry": { "...": "..." }, "min_magnitude": 4.0, "max_magnitude": 7.0, "...": "..." }
}
```

List response:

```json
{
  "items": [ { "id": 1, "name": "Tbilisi", "...": "..." } ],
  "total": 1
}
```

Delete response:

```json
{ "message": "Alert zone deleted successfully." }
```

---

## 5. Validation

Validation errors return `400`:

```json
{ "error": "validation_error", "message": "..." }
```

| Field | Rule |
|-------|------|
| body | Must be a JSON object |
| name | Non-empty string, max 255 characters |
| geometry.type | Exactly `"Polygon"` |
| geometry.coordinates | Non-empty list of rings; each ring has at least 3 distinct points |
| point | `[lon, lat]`, numbers; lon ∈ [-180, 180], lat ∈ [-90, 90] |
| min_magnitude | Number, ML ∈ [0, 10] |
| max_magnitude | `null` or number, ML ∈ [0, 10], `≥ min_magnitude` |
| enabled / notif_is_staff | Boolean |
| notif_channels | Non-empty list containing only `mail`, `number`, `push_notif` |

Normalization:

- An unclosed ring is closed automatically by appending its first point;
- A third coordinate (altitude) is dropped; coordinates are stored as floats;
- Duplicates in `notif_channels` are removed;
- On PUT, `min_magnitude ≤ max_magnitude` is also checked against the stored values (e.g. sending only `min_magnitude: 7` when the stored `max_magnitude` is 6 is rejected).

Other errors: `401` (authentication), `403` (missing permission), `404` (`not_found`, zone does not exist).

---

## 6. Web UI

- Page: `/<lang>/alert_zones`, opened from the **Add Alert Zone** button on `/<lang>/notify`.
- Map: Leaflet + Leaflet.draw; only the polygon tool is enabled. Drawing a new polygon replaces the previous unsaved one; it can be edited or removed with the toolbar before saving.
- Form: name, Min ML / Max ML (empty Max = no upper limit), channels (Email / SMS / Push toggle buttons), recipients (External / Staff), enabled switch. Sends `POST /api/alert_zones` with `polygon.toGeoJSON().geometry`.
- Saved zones are listed below the form. None are drawn on the map by default; a zone appears only when its **On map** switch is turned on (red; disabled zones grey and dashed). **Delete** removes the zone.
- Editing: the pencil button on a zone loads it into the form (title becomes "Edit alert zone") and puts its polygon on the map as an editable shape; the saved copy is hidden meanwhile. Vertices are moved with the toolbar's edit tool, or a new polygon can be drawn to replace it. **Save changes** sends `PUT /api/alert_zones/{id}`, **Cancel** leaves edit mode without changes. The selection is not persisted and resets on page reload.
- Navigation and feedback: "Back to recipients" button (`.page-back-btn`) returns to `/<lang>/notify`; create / update / delete results and validation errors are shown as floating alerts at the top of the viewport (see [`09-api-inventory.md`](09-api-inventory.md#shared-ui-components)).
- Files: `app/templates/notify/alertZones.html`, `app/static/js/notify/alertZones.js`, route `notify.alert_zones` in `app/views/notify/routes.py`.

---

## 7. Security

- JWT Authentication **or** service API key (`X-API-Key`);
- Read: `can_recips` or `can_recips_read`;
- Write: `can_recips`;
- Audit user ids (`created_by_user_id`, `updated_by_user_id`) on each zone.

---

## 8. Future Extensions (Planned)

- On new events, check zones (ML range + point-in-polygon) and notify the matching recipients;
- A dedicated permission if needed (e.g. `can_alert_zones`).
