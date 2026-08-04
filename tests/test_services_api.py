def test_list_services_requires_auth(client):
    response = client.get("/api/services/")
    assert response.status_code == 401


def test_register_and_delete_service(client, admin_auth_headers):
    create_response = client.post(
        "/api/services/",
        headers=admin_auth_headers,
        json={
            "name": "recip-export-worker",
            "description": "Read-only recip export",
            "permissions": ["can_recips_read"],
        },
    )
    assert create_response.status_code == 201
    created = create_response.get_json()
    assert created["api_key"]
    assert created["service"]["uuid"]
    assert created["permissions"] == ["can_recips_read"]

    service_uuid = created["service"]["uuid"]

    list_response = client.get("/api/services/", headers=admin_auth_headers)
    assert list_response.status_code == 200
    items = list_response.get_json()["items"]
    match = next((item for item in items if item["uuid"] == service_uuid), None)
    assert match is not None
    assert "can_recips_read" in match["permissions"]

    delete_response = client.delete(
        f"/api/services/{service_uuid}",
        headers=admin_auth_headers,
    )
    assert delete_response.status_code == 200

    list_after = client.get("/api/services/", headers=admin_auth_headers)
    uuids = [item["uuid"] for item in list_after.get_json()["items"]]
    assert service_uuid not in uuids


def test_register_service_requires_permission(client, user_auth_headers):
    response = client.post(
        "/api/services/",
        headers=user_auth_headers,
        json={
            "name": "blocked-service",
            "permissions": ["can_recips_read"],
        },
    )
    assert response.status_code == 403
