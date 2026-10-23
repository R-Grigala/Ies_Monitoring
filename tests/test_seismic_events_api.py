from app import create_app
from app.extensions import db
from app.models import Magnitude, SeismicEvent


def _seed_magnitude(code="MW", description="Moment Magnitude"):
    existing = Magnitude.query.filter_by(code=code).first()
    if existing:
        return existing
    magnitude = Magnitude(code=code, description=description)
    magnitude.create()
    return magnitude


def test_list_seismic_events_requires_permission(client, user_auth_headers):
    response = client.get("/api/seismic_events/", headers=user_auth_headers)
    assert response.status_code == 403


def test_view_permission_can_list_but_not_create(client, permissions, app):
    from tests.helpers import VALID_PASSWORD, auth_headers, create_user, login

    create_user(
        email="events.viewer@example.com",
        first_name="Events",
        last_name="Viewer",
        password=VALID_PASSWORD,
        permission_codes=["can_event_view"],
    )
    login_response = login(client, "events.viewer@example.com", VALID_PASSWORD)
    assert login_response.status_code == 200
    headers = auth_headers(login_response.get_json()["access_token"])

    listed = client.get("/api/seismic_events/", headers=headers)
    assert listed.status_code == 200

    created = client.post(
        "/api/seismic_events/",
        headers=headers,
        json={
            "origin_time": "2026-08-05T12:30:00",
            "latitude": 41.7151,
            "longitude": 44.8271,
        },
    )
    assert created.status_code == 403


def test_create_list_update_delete_seismic_event(client, admin_auth_headers, app):
    create_response = client.post(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        json={
            "origin_time": "2026-08-05T12:30:00",
            "latitude": 41.7151,
            "longitude": 44.8271,
            "depth": 10.5,
            "location_en": "Near Tbilisi",
            "area": "Georgia",
        },
    )
    assert create_response.status_code == 201
    event = create_response.get_json()["event"]
    event_id = event["id"]
    assert event["latitude"] == 41.7151
    assert event["magnitudes"] == []
    assert event["beachball"] is None
    assert event["is_automatic"] is False

    list_response = client.get("/api/seismic_events/", headers=admin_auth_headers)
    assert list_response.status_code == 200
    assert list_response.get_json()["total"] >= 1

    update_response = client.put(
        f"/api/seismic_events/event_id={event_id}",
        headers=admin_auth_headers,
        json={"location_en": "Tbilisi region", "depth": 12.0, "is_automatic": True},
    )
    assert update_response.status_code == 200
    updated = update_response.get_json()["event"]
    assert updated["location_en"] == "Tbilisi region"
    assert updated["depth"] == 12.0
    assert updated["is_automatic"] is True

    delete_response = client.delete(
        f"/api/seismic_events/event_id={event_id}",
        headers=admin_auth_headers,
    )
    assert delete_response.status_code == 200


def test_event_magnitude_and_beachball_crud(client, admin_auth_headers, app):
    with app.app_context():
        magnitude = _seed_magnitude("MW")
        magnitude_id = magnitude.id

    create_response = client.post(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        json={
            "origin_time": "2026-08-05T14:00:00",
            "latitude": 41.8,
            "longitude": 44.9,
            "depth": 8.0,
        },
    )
    assert create_response.status_code == 201
    event_id = create_response.get_json()["event"]["id"]

    mag_response = client.post(
        f"/api/seismic_events/{event_id}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_code": "MW", "value": 4.2},
    )
    assert mag_response.status_code == 201
    event_magnitude = mag_response.get_json()["event_magnitude"]
    event_magnitude_id = event_magnitude["id"]
    assert event_magnitude["value"] == 4.2
    assert event_magnitude["magnitude"]["code"] == "MW"

    duplicate_mag = client.post(
        f"/api/seismic_events/{event_id}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_id": magnitude_id, "value": 4.5},
    )
    assert duplicate_mag.status_code == 409

    update_mag = client.put(
        f"/api/seismic_events/magnitudes/{event_magnitude_id}",
        headers=admin_auth_headers,
        json={"value": 4.7},
    )
    assert update_mag.status_code == 200
    assert update_mag.get_json()["event_magnitude"]["value"] == 4.7

    beachball_create = client.post(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={"rake": 90.0, "dip": 45.0, "strike": 180.0},
    )
    assert beachball_create.status_code == 201
    created_bb = beachball_create.get_json()["beachball"]
    assert created_bb["strike"] == 180.0
    expected_path = f"/static/beachballs/beachball_{event_id}.png"
    assert created_bb["beachball_path"] == expected_path

    from app.utils.gen_beachball_img import beachball_fs_path

    assert beachball_fs_path(event_id).is_file()

    beachball_dup = client.post(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={"rake": 10.0, "dip": 20.0, "strike": 30.0},
    )
    assert beachball_dup.status_code == 409

    partial_update = client.put(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={"strike": 200.0},
    )
    assert partial_update.status_code == 400
    assert partial_update.get_json()["error"] == "validation_error"

    beachball_update = client.put(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={"strike": 200.0, "dip": 45.0, "rake": 90.0, "beachball_path": "/static/bb.png"},
    )
    assert beachball_update.status_code == 200
    beachball = beachball_update.get_json()["beachball"]
    assert beachball["strike"] == 200.0
    # Client-supplied path is ignored; server regenerates fixed path.
    assert beachball["beachball_path"] == expected_path
    assert beachball_fs_path(event_id).is_file()

    get_event = client.get(f"/api/seismic_events/event_id={event_id}", headers=admin_auth_headers)
    assert get_event.status_code == 200
    detail = get_event.get_json()
    assert len(detail["magnitudes"]) == 1
    assert detail["beachball"]["strike"] == 200.0

    delete_mag = client.delete(
        f"/api/seismic_events/magnitudes/{event_magnitude_id}",
        headers=admin_auth_headers,
    )
    assert delete_mag.status_code == 200

    delete_beachball = client.delete(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
    )
    assert delete_beachball.status_code == 200
    assert not beachball_fs_path(event_id).is_file()

    catalog = client.get("/api/seismic_events/magnitude_types", headers=admin_auth_headers)
    assert catalog.status_code == 200
    assert catalog.get_json()["total"] >= 1


def test_beachball_requires_all_or_none_angles(client, admin_auth_headers):
    create_response = client.post(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        json={
            "origin_time": "2026-08-05T15:00:00",
            "latitude": 41.5,
            "longitude": 44.5,
        },
    )
    assert create_response.status_code == 201
    event_id = create_response.get_json()["event"]["id"]

    partial_create = client.post(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={"strike": 10.0, "dip": 20.0},
    )
    assert partial_create.status_code == 400
    assert partial_create.get_json()["error"] == "validation_error"

    empty_create = client.post(
        f"/api/seismic_events/{event_id}/beachball",
        headers=admin_auth_headers,
        json={},
    )
    assert empty_create.status_code == 201
    assert empty_create.get_json()["beachball"]["beachball_path"] is None


def test_filter_seismic_events(client, admin_auth_headers, app):
    with app.app_context():
        _seed_magnitude("MW")
        _seed_magnitude("ML", "Local Magnitude")

    first = client.post(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        json={
            "origin_time": "2026-08-01T10:00:00",
            "latitude": 41.7,
            "longitude": 44.8,
            "depth": 5.0,
            "seiscomp_oid": "Origin/filter-test-1",
            "iesdata_id": 20260001,
            "location_en": "Near Tbilisi",
            "area": "Georgia",
        },
    )
    assert first.status_code == 201
    first_id = first.get_json()["event"]["id"]

    second = client.post(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        json={
            "origin_time": "2026-08-10T18:00:00",
            "latitude": 42.1,
            "longitude": 43.2,
            "depth": 25.0,
            "seiscomp_oid": "Origin/filter-test-2",
            "iesdata_id": 20260099,
            "location_en": "Near Kutaisi",
            "area": "Imereti",
        },
    )
    assert second.status_code == 201
    second_id = second.get_json()["event"]["id"]

    client.post(
        f"/api/seismic_events/{first_id}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_code": "MW", "value": 3.1},
    )
    client.post(
        f"/api/seismic_events/{second_id}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_code": "MW", "value": 5.4},
    )

    by_id = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"event_id": first_id},
    )
    assert by_id.status_code == 200
    assert by_id.get_json()["total"] == 1
    assert by_id.get_json()["items"][0]["id"] == first_id

    by_ies = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"iesdata_id": 20260001},
    )
    assert by_ies.status_code == 200
    assert by_ies.get_json()["total"] == 1
    assert by_ies.get_json()["items"][0]["id"] == first_id

    by_oid = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"seiscomp_oid": "filter-test-2"},
    )
    assert by_oid.status_code == 200
    assert by_oid.get_json()["total"] == 1
    assert by_oid.get_json()["items"][0]["id"] == second_id

    by_location = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"location": "tbilisi"},
    )
    assert by_location.status_code == 200
    assert by_location.get_json()["total"] == 1
    assert by_location.get_json()["items"][0]["id"] == first_id

    by_area = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"area": "Imereti"},
    )
    assert by_area.status_code == 200
    assert by_area.get_json()["total"] == 1

    by_depth = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"depth_min": 20, "depth_max": 30},
    )
    assert by_depth.status_code == 200
    ids = {item["id"] for item in by_depth.get_json()["items"]}
    assert second_id in ids
    assert first_id not in ids

    by_date = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={
            "date_from": "2026-08-05T00:00:00",
            "date_to": "2026-08-15T00:00:00",
        },
    )
    assert by_date.status_code == 200
    ids = {item["id"] for item in by_date.get_json()["items"]}
    assert second_id in ids
    assert first_id not in ids

    by_mag = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"magnitude": "MW", "magnitude_min": 5, "magnitude_max": 6},
    )
    assert by_mag.status_code == 200
    assert by_mag.get_json()["total"] == 1
    assert by_mag.get_json()["items"][0]["id"] == second_id

    invalid_range = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"magnitude_min": 6, "magnitude_max": 3},
    )
    assert invalid_range.status_code == 400


def _create_event(client, headers, **extra):
    payload = {
        "origin_time": "2026-08-05T12:30:00",
        "latitude": 41.7,
        "longitude": 44.8,
    }
    payload.update(extra)
    response = client.post("/api/seismic_events/", headers=headers, json=payload)
    assert response.status_code == 201
    return response.get_json()["event"]


def test_get_lookup_by_exact_ids(client, admin_auth_headers):
    older = _create_event(
        client,
        admin_auth_headers,
        origin_time="2026-08-01T00:00:00",
        seiscomp_oid="ies2026abc",
        iesdata_id=539870,
    )
    newer = _create_event(
        client,
        admin_auth_headers,
        origin_time="2026-08-02T00:00:00",
        seiscomp_oid="ies2026abc123",
        iesdata_id=5398701,
    )

    by_oid = client.get(
        "/api/seismic_events/seiscomp_oid=ies2026abc",
        headers=admin_auth_headers,
    )
    assert by_oid.status_code == 200
    assert by_oid.get_json()["id"] == older["id"]
    assert by_oid.get_json()["seiscomp_oid"] == "ies2026abc"

    by_ies = client.get(
        "/api/seismic_events/iesdata_id=539870",
        headers=admin_auth_headers,
    )
    assert by_ies.status_code == 200
    assert by_ies.get_json()["id"] == older["id"]
    assert by_ies.get_json()["iesdata_id"] == 539870

    by_id = client.get(
        f"/api/seismic_events/event_id={newer['id']}",
        headers=admin_auth_headers,
    )
    assert by_id.status_code == 200
    assert by_id.get_json()["id"] == newer["id"]

    missing = client.get(
        "/api/seismic_events/seiscomp_oid=does-not-exist",
        headers=admin_auth_headers,
    )
    assert missing.status_code == 404


def test_get_list_is_bounded(client, admin_auth_headers):
    _create_event(client, admin_auth_headers, origin_time="2026-01-01T00:00:00", seiscomp_oid="page-1")
    _create_event(client, admin_auth_headers, origin_time="2026-01-02T00:00:00", seiscomp_oid="page-2")
    _create_event(client, admin_auth_headers, origin_time="2026-01-03T00:00:00", seiscomp_oid="page-3")

    page = client.get(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        query_string={"limit": 2},
    )
    assert page.status_code == 200
    payload = page.get_json()
    assert payload["total"] == 3
    assert payload["limit"] == 2
    assert payload["offset"] == 0
    assert len(payload["items"]) == 2
    assert payload["items"][0]["seiscomp_oid"] == "page-3"

    too_large = client.get(
        "/api/seismic_events/",
        headers=admin_auth_headers,
        query_string={"limit": 500},
    )
    assert too_large.status_code == 400


def test_iesdata_id_is_positive_integer(client, admin_auth_headers):
    created = _create_event(client, admin_auth_headers, iesdata_id="539870")
    assert created["iesdata_id"] == 539870

    for bad in ("IES-2026-0001", "5.5", 5.5, 0, -3, True):
        response = client.post(
            "/api/seismic_events/",
            headers=admin_auth_headers,
            json={
                "origin_time": "2026-08-05T12:30:00",
                "latitude": 41.7,
                "longitude": 44.8,
                "iesdata_id": bad,
            },
        )
        assert response.status_code == 400, bad

    updated = client.put(
        f"/api/seismic_events/event_id={created['id']}",
        headers=admin_auth_headers,
        json={"iesdata_id": 539871},
    )
    assert updated.status_code == 200
    assert updated.get_json()["event"]["iesdata_id"] == 539871


def test_seiscomp_oid_lookup_allows_slash(client, admin_auth_headers):
    created = _create_event(client, admin_auth_headers, seiscomp_oid="Origin/ies2026x")
    response = client.get(
        "/api/seismic_events/seiscomp_oid=Origin/ies2026x",
        headers=admin_auth_headers,
    )
    assert response.status_code == 200
    assert response.get_json()["id"] == created["id"]


def test_unmatched_api_urls_return_json_404(client, admin_auth_headers):
    for path in (
        "/api/seismic_events/event_id=abc",
        "/api/seismic_events/iesdata_id=abc",
        "/api/seismic_events/seiscomp_oid=",
        "/api/does-not-exist",
    ):
        response = client.get(path, headers=admin_auth_headers)
        assert response.status_code == 404, path
        assert response.get_json()["error"] == "not_found", path


def test_event_numeric_fields_are_validated(client, admin_auth_headers):
    base = {"origin_time": "2026-08-05T12:30:00", "latitude": 41.7, "longitude": 44.8}
    for bad in (
        {"latitude": 91},
        {"latitude": "nan"},
        {"longitude": -181},
        {"longitude": "inf"},
        {"depth": "abc"},
        {"latitude": True},
        {"seiscomp_oid": "x" * 21},
    ):
        response = client.post(
            "/api/seismic_events/", headers=admin_auth_headers, json={**base, **bad}
        )
        assert response.status_code == 400, bad

    event = _create_event(client, admin_auth_headers)
    _seed_magnitude("ML", "Local")
    bad_value = client.post(
        f"/api/seismic_events/{event['id']}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_code": "ML", "value": "nan"},
    )
    assert bad_value.status_code == 400

    bad_dip = client.post(
        f"/api/seismic_events/{event['id']}/beachball",
        headers=admin_auth_headers,
        json={"strike": 10, "dip": 120, "rake": 0},
    )
    assert bad_dip.status_code == 400


def test_origin_time_with_offset_is_stored_as_utc(client, admin_auth_headers):
    event = _create_event(client, admin_auth_headers, origin_time="2026-08-05T16:30:00+04:00")
    assert event["origin_time"].startswith("2026-08-05T12:30:00")


def test_update_is_partial_and_null_clears_optional_fields(client, admin_auth_headers):
    event = _create_event(
        client,
        admin_auth_headers,
        seiscomp_oid="ies2026clr",
        iesdata_id=777,
        depth=12.5,
        location_en="Somewhere",
    )
    url = f"/api/seismic_events/event_id={event['id']}"

    only_ge = client.put(url, headers=admin_auth_headers, json={"location_ge": "სადღაც"})
    assert only_ge.status_code == 200
    kept = only_ge.get_json()["event"]
    assert kept["seiscomp_oid"] == "ies2026clr"
    assert kept["iesdata_id"] == 777
    assert kept["depth"] == 12.5
    assert kept["location_en"] == "Somewhere"

    cleared = client.put(
        url,
        headers=admin_auth_headers,
        json={"seiscomp_oid": None, "iesdata_id": None, "depth": None, "location_en": None},
    )
    assert cleared.status_code == 200
    body = cleared.get_json()["event"]
    assert body["seiscomp_oid"] is None
    assert body["iesdata_id"] is None
    assert body["depth"] is None
    assert body["location_en"] is None
    assert body["location_ge"] == "სადღაც"

    required_null = client.put(url, headers=admin_auth_headers, json={"latitude": None})
    assert required_null.status_code == 400


def test_filter_is_bounded_and_validates_magnitudes(client, admin_auth_headers):
    for day in (1, 2, 3):
        _create_event(client, admin_auth_headers, origin_time=f"2026-02-0{day}T00:00:00")

    page = client.post(
        "/api/seismic_events/filter", headers=admin_auth_headers, json={"limit": 2}
    )
    assert page.status_code == 200
    payload = page.get_json()
    assert payload["total"] == 3
    assert payload["limit"] == 2
    assert [item["origin_time"][:10] for item in payload["items"]] == ["2026-02-03", "2026-02-02"]

    too_large = client.post(
        "/api/seismic_events/filter", headers=admin_auth_headers, json={"limit": 201}
    )
    assert too_large.status_code == 400

    bad_magnitude = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"magnitudes": [{"magnitude_min": "abc", "magnitude_max": 3}]},
    )
    assert bad_magnitude.status_code == 400


def test_list_and_filter_paginate_with_offset(client, admin_auth_headers):
    ids = [
        _create_event(client, admin_auth_headers, origin_time=f"2026-07-0{day}T00:00:00")["id"]
        for day in (1, 2, 3)
    ]
    newest_first = list(reversed(ids))

    first_page = client.get("/api/seismic_events/?limit=2", headers=admin_auth_headers)
    second_page = client.get("/api/seismic_events/?limit=2&offset=2", headers=admin_auth_headers)
    assert first_page.status_code == second_page.status_code == 200
    assert [item["id"] for item in first_page.get_json()["items"]] == newest_first[:2]
    assert [item["id"] for item in second_page.get_json()["items"]] == newest_first[2:]
    assert second_page.get_json()["offset"] == 2
    assert second_page.get_json()["total"] == 3

    filtered = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"date_from": "2026-07-01T00:00:00", "limit": 1, "offset": 1},
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.get_json()["items"]] == newest_first[1:2]

    negative = client.get("/api/seismic_events/?offset=-1", headers=admin_auth_headers)
    assert negative.status_code == 400


def test_list_sorts_on_server_with_missing_values_last(client, admin_auth_headers, app):
    with app.app_context():
        _seed_magnitude("ML", "Local Magnitude")
        _seed_magnitude("MW")

    small = _create_event(client, admin_auth_headers, origin_time="2026-05-01T00:00:00", depth=5.0)
    big = _create_event(client, admin_auth_headers, origin_time="2026-05-02T00:00:00", depth=30.0)
    none = _create_event(client, admin_auth_headers, origin_time="2026-05-03T00:00:00")
    mw_only = _create_event(client, admin_auth_headers, origin_time="2026-05-04T00:00:00", depth=12.0)
    for event, code, value in ((small, "ML", 2.1), (big, "MW", 6.0), (big, "ML", 4.4), (mw_only, "MW", 3.0)):
        response = client.post(
            f"/api/seismic_events/{event['id']}/magnitudes",
            headers=admin_auth_headers,
            json={"magnitude_code": code, "value": value},
        )
        assert response.status_code == 201

    def ids(**params):
        response = client.get("/api/seismic_events/", headers=admin_auth_headers, query_string=params)
        assert response.status_code == 200
        return [item["id"] for item in response.get_json()["items"]]

    # ML wins over a larger MW; an event without magnitudes stays last in both directions.
    assert ids(sort="magnitude") == [big["id"], mw_only["id"], small["id"], none["id"]]
    assert ids(sort="magnitude", order="asc") == [small["id"], mw_only["id"], big["id"], none["id"]]
    assert ids(sort="depth", order="asc") == [small["id"], mw_only["id"], big["id"], none["id"]]
    assert ids() == [mw_only["id"], none["id"], big["id"], small["id"]]

    filtered = client.post(
        "/api/seismic_events/filter",
        headers=admin_auth_headers,
        json={"date_from": "2026-05-01T00:00:00", "sort": "depth", "limit": 2, "offset": 1},
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.get_json()["items"]] == [mw_only["id"], small["id"]]

    invalid = client.get("/api/seismic_events/?sort=bogus", headers=admin_auth_headers)
    assert invalid.status_code == 400


def test_manual_update_marks_event_calculated(client, admin_auth_headers):
    event = _create_event(client, admin_auth_headers, is_automatic=True)
    assert event["is_automatic"] is True

    kept = client.put(
        f"/api/seismic_events/event_id={event['id']}",
        headers=admin_auth_headers,
        json={"depth": 9.0, "is_automatic": True},
    )
    assert kept.status_code == 200
    assert kept.get_json()["event"]["is_automatic"] is True

    edited = client.put(
        f"/api/seismic_events/event_id={event['id']}",
        headers=admin_auth_headers,
        json={"location_en": "Reviewed location"},
    )
    assert edited.status_code == 200
    assert edited.get_json()["event"]["is_automatic"] is False


def _create_service(client, headers, name, permissions):
    response = client.post(
        "/api/services/",
        headers=headers,
        json={"name": name, "permissions": permissions},
    )
    assert response.status_code == 201
    return response.get_json()


def test_event_records_who_created_and_updated_it(client, admin_auth_headers, app):
    event = _create_event(client, admin_auth_headers)
    assert event["created_by"] == {"kind": "user", "name": "Admin User"}
    assert event["updated_at"] is None
    assert event["updated_by"] is None

    service = _create_service(client, admin_auth_headers, "seiscomp-sync", ["can_event_edit"])
    service_headers = {"X-API-Key": service["api_key"]}

    updated = client.put(
        f"/api/seismic_events/event_id={event['id']}",
        headers=service_headers,
        json={"depth": 7.0, "is_automatic": True},
    )
    assert updated.status_code == 200
    body = updated.get_json()["event"]
    assert body["created_by"] == {"kind": "user", "name": "Admin User"}
    assert body["updated_by"] == {"kind": "service", "name": "seiscomp-sync"}
    assert body["updated_at"] is not None

    with app.app_context():
        _seed_magnitude("ML")
    added = client.post(
        f"/api/seismic_events/{event['id']}/magnitudes",
        headers=admin_auth_headers,
        json={"magnitude_code": "ML", "value": 3.1},
    )
    assert added.status_code == 201
    detail = client.get(
        f"/api/seismic_events/event_id={event['id']}", headers=admin_auth_headers
    ).get_json()
    assert detail["updated_by"] == {"kind": "user", "name": "Admin User"}

    listed = client.get("/api/seismic_events/", headers=admin_auth_headers).get_json()
    assert listed["items"][0]["created_by"]["name"] == "Admin User"


def test_event_authors_cannot_be_hard_deleted(client, admin_auth_headers, app):
    service = _create_service(client, admin_auth_headers, "seiscomp-sync", ["can_event_edit"])
    _create_event(client, {"X-API-Key": service["api_key"]})

    response = client.delete(
        f"/api/services/{service['service']['uuid']}", headers=admin_auth_headers
    )
    assert response.status_code == 409
    assert "seismic event" in response.get_json()["message"]


def test_upgrade_db_adds_missing_columns_without_losing_rows(tmp_path):
    import sqlalchemy as sa

    from app.commands import upgrade_db_core
    from app.config import TestingConfig

    class OldSchemaConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{tmp_path / 'old.db'}"

    application = create_app(OldSchemaConfig)
    with application.app_context():
        db.create_all()
        with db.engine.begin() as connection:
            connection.execute(sa.text("DROP TABLE seismic_events"))
            connection.execute(
                sa.text(
                    "CREATE TABLE seismic_events (id INTEGER PRIMARY KEY, iesdata_id INTEGER, "
                    "seiscomp_oid VARCHAR(20), origin_time DATETIME NOT NULL, "
                    "latitude FLOAT NOT NULL, longitude FLOAT NOT NULL, depth FLOAT, "
                    "location_ge VARCHAR(500), location_en VARCHAR(500), area VARCHAR(20), "
                    "is_automatic BOOLEAN NOT NULL, created_at DATETIME NOT NULL)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO seismic_events (origin_time, latitude, longitude, "
                    "is_automatic, created_at) VALUES "
                    "('2026-08-05 12:30:00', 41.7, 44.8, 1, '2026-08-05 12:31:00')"
                )
            )

        added = upgrade_db_core()
        assert sorted(added) == [
            "seismic_events.created_by_service_id",
            "seismic_events.created_by_user_id",
            "seismic_events.updated_at",
            "seismic_events.updated_by_service_id",
            "seismic_events.updated_by_user_id",
        ]
        assert upgrade_db_core() == []

        event = SeismicEvent.query.one()
        assert event.is_automatic is True
        assert event.to_dict()["created_by"] is None
        db.session.remove()
        db.drop_all()
