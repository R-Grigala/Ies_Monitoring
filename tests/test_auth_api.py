from tests.helpers import ADMIN_EMAIL, USER_EMAIL, VALID_PASSWORD, auth_headers, login


def test_login_success(client, admin_user):
    response = login(client, ADMIN_EMAIL, VALID_PASSWORD)
    assert response.status_code == 200
    data = response.get_json()
    assert data["access_token"]
    assert data["token_type"] == "Bearer"


def test_login_invalid_credentials(client, admin_user):
    response = login(client, ADMIN_EMAIL, "WrongPass123!@#")
    assert response.status_code in (400, 401)
    data = response.get_json()
    assert data.get("error") or data.get("message")


def test_register_requires_auth(client):
    response = client.post(
        "/api/auth/register",
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": "new.person@example.com",
            "password": VALID_PASSWORD,
            "passwordRepeat": VALID_PASSWORD,
        },
    )
    assert response.status_code == 401


def test_register_forbidden_without_permission(client, user_auth_headers):
    response = client.post(
        "/api/auth/register",
        headers=user_auth_headers,
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": "new.person@example.com",
            "password": VALID_PASSWORD,
            "passwordRepeat": VALID_PASSWORD,
        },
    )
    assert response.status_code == 403
    assert response.get_json()["error"] == "forbidden"


def test_register_success_with_can_users(client, admin_auth_headers):
    response = client.post(
        "/api/auth/register",
        headers=admin_auth_headers,
        json={
            "first_name": "New",
            "last_name": "Person",
            "email": "new.person@example.com",
            "password": VALID_PASSWORD,
            "passwordRepeat": VALID_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["message"]
    assert data["user"]["email"] == "new.person@example.com"


def test_logout_success(client, admin_auth_headers):
    response = client.post("/api/auth/logout", headers=admin_auth_headers)
    assert response.status_code == 200
