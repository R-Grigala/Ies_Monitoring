from app.models import Permission
from tests.helpers import VALID_PASSWORD, auth_headers, create_user, login


def test_list_permissions_requires_auth(client, permissions):
    response = client.get("/api/permissions/")
    assert response.status_code == 401


def test_list_permissions_forbidden_without_manage(client, user_auth_headers, permissions):
    response = client.get("/api/permissions/", headers=user_auth_headers)
    assert response.status_code == 403


def test_list_permissions_allowed_but_manage_forbidden_with_only_can_users(client, permissions):
    create_user(
        email="users.only@example.com",
        first_name="Users",
        last_name="Only",
        password=VALID_PASSWORD,
        permission_codes=["can_users"],
    )
    login_response = login(client, "users.only@example.com", VALID_PASSWORD)
    assert login_response.status_code == 200
    headers = auth_headers(login_response.get_json()["access_token"])

    listed = client.get("/api/permissions/", headers=headers)
    assert listed.status_code == 200
    codes = {item["code"] for item in listed.get_json()["items"]}
    assert "can_recips" in codes

    create = client.post(
        "/api/permissions/",
        headers=headers,
        json={"code": "can_events", "name": "Events"},
    )
    assert create.status_code == 403

    delete = client.delete("/api/permissions/can_recips", headers=headers)
    assert delete.status_code == 403


def test_list_permissions_success(client, admin_auth_headers, permissions):
    response = client.get("/api/permissions/", headers=admin_auth_headers)
    assert response.status_code == 200
    data = response.get_json()
    codes = {item["code"] for item in data["items"]}
    assert "can_users" in codes
    assert "can_recips" in codes
    assert data["total"] >= 4


def test_create_permission_success(client, admin_auth_headers, permissions):
    response = client.post(
        "/api/permissions/",
        headers=admin_auth_headers,
        json={
            "code": "can_events",
            "name": "Events Management",
            "description": "Manage event catalog.",
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["permission"]["code"] == "can_events"
    assert data["permission"]["is_active"] is True


def test_create_permission_conflict(client, admin_auth_headers, permissions):
    response = client.post(
        "/api/permissions/",
        headers=admin_auth_headers,
        json={"code": "can_users", "name": "Duplicate"},
    )
    assert response.status_code == 409


def test_get_permission_by_code(client, admin_auth_headers, permissions):
    response = client.get("/api/permissions/can_recips", headers=admin_auth_headers)
    assert response.status_code == 200
    assert response.get_json()["code"] == "can_recips"


def test_delete_permission_hard_when_unassigned(client, admin_auth_headers, permissions):
    create = client.post(
        "/api/permissions/",
        headers=admin_auth_headers,
        json={"code": "can_temp_delete", "name": "Temp"},
    )
    assert create.status_code == 201

    delete = client.delete("/api/permissions/can_temp_delete", headers=admin_auth_headers)
    assert delete.status_code == 200
    assert "deleted" in delete.get_json()["message"].lower()

    listed = client.get("/api/permissions/", headers=admin_auth_headers)
    codes = {item["code"] for item in listed.get_json()["items"]}
    assert "can_temp_delete" not in codes


def test_delete_permission_soft_when_assigned(client, admin_auth_headers, permissions, plain_user):
    grant = client.post(
        f"/api/accounts/{plain_user.uuid}/permissions",
        headers=admin_auth_headers,
        json={"permission_codes": ["can_recips_read"]},
    )
    assert grant.status_code == 200

    delete = client.delete("/api/permissions/can_recips_read", headers=admin_auth_headers)
    assert delete.status_code == 200
    message = delete.get_json()["message"].lower()
    assert "deactivated" in message or "inactive" in message

    permission = Permission.query.filter_by(code="can_recips_read").first()
    assert permission is not None
    assert permission.is_active is False


def test_reactivate_soft_deleted_permission(client, admin_auth_headers, permissions, plain_user):
    client.post(
        f"/api/accounts/{plain_user.uuid}/permissions",
        headers=admin_auth_headers,
        json={"permission_codes": ["can_recips_read"]},
    )
    client.delete("/api/permissions/can_recips_read", headers=admin_auth_headers)

    response = client.post(
        "/api/permissions/",
        headers=admin_auth_headers,
        json={
            "code": "can_recips_read",
            "name": "Recips Read-Only Updated",
            "description": "Reactivated",
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["permission"]["is_active"] is True
    assert "re-activated" in data["message"].lower()
