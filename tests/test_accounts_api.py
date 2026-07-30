from tests.helpers import USER_EMAIL, VALID_PASSWORD, auth_headers, create_user, login


def test_get_current_user(client, admin_auth_headers, admin_user):
    response = client.get("/api/accounts/user", headers=admin_auth_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["email"] == admin_user.email
    assert data["can_users"] is True
    assert data["can_recips"] is True


def test_update_current_user(client, admin_auth_headers):
    response = client.put(
        "/api/accounts/user",
        headers=admin_auth_headers,
        json={"first_name": "Updated", "last_name": "Admin"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["user"]["first_name"] == "Updated"
    assert data["user"]["last_name"] == "Admin"


def test_list_accounts_requires_can_users(client, user_auth_headers):
    response = client.get("/api/accounts/accounts", headers=user_auth_headers)
    assert response.status_code == 403


def test_list_accounts_success(client, admin_auth_headers, admin_user, plain_user):
    response = client.get("/api/accounts/accounts", headers=admin_auth_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] >= 2
    emails = {item["email"] for item in data["items"]}
    assert admin_user.email in emails
    assert plain_user.email in emails


def test_update_account_and_cannot_deactivate_self(client, admin_auth_headers, admin_user):
    response = client.put(
        f"/api/accounts/accounts/{admin_user.uuid}",
        headers=admin_auth_headers,
        json={"is_active": False},
    )
    assert response.status_code == 409
    assert "cannot deactivate your own account" in response.get_json()["message"].lower()


def test_delete_account_success(client, admin_auth_headers, permissions):
    target = create_user(
        email="delete.me@example.com",
        first_name="Delete",
        last_name="Me",
        password=VALID_PASSWORD,
    )
    response = client.delete(
        f"/api/accounts/accounts/{target.uuid}",
        headers=admin_auth_headers,
    )
    assert response.status_code == 200
    assert "deleted" in response.get_json()["message"].lower()


def test_delete_own_account_forbidden(client, admin_auth_headers, admin_user):
    response = client.delete(
        f"/api/accounts/accounts/{admin_user.uuid}",
        headers=admin_auth_headers,
    )
    assert response.status_code == 409
