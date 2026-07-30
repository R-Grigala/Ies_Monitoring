def test_list_recips_requires_permission(client, user_auth_headers):
    response = client.get("/api/recips/", headers=user_auth_headers)
    assert response.status_code == 403


def test_create_list_update_delete_recip(client, admin_auth_headers):
    create_response = client.post(
        "/api/recips/",
        headers=admin_auth_headers,
        json={
            "username": "Duty Officer",
            "is_staff": True,
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    recip = create_response.get_json()["recip"]
    recip_id = recip["id"]
    assert recip["username"] == "Duty Officer"
    assert recip["is_staff"] is True

    list_response = client.get("/api/recips/", headers=admin_auth_headers)
    assert list_response.status_code == 200
    assert list_response.get_json()["total"] >= 1

    update_response = client.put(
        f"/api/recips/{recip_id}",
        headers=admin_auth_headers,
        json={"username": "Updated Officer", "is_active": False},
    )
    assert update_response.status_code == 200
    updated = update_response.get_json()["recip"]
    assert updated["username"] == "Updated Officer"
    assert updated["is_active"] is False

    delete_response = client.delete(f"/api/recips/{recip_id}", headers=admin_auth_headers)
    assert delete_response.status_code == 200


def test_recip_email_and_number_channels(client, admin_auth_headers):
    create_response = client.post(
        "/api/recips/",
        headers=admin_auth_headers,
        json={"username": "Channel User", "is_staff": False, "is_active": True},
    )
    recip_id = create_response.get_json()["recip"]["id"]

    email_response = client.post(
        f"/api/recips/{recip_id}/emails",
        headers=admin_auth_headers,
        json={"email": "duty@example.ge", "is_active": True},
    )
    assert email_response.status_code == 201
    email_id = email_response.get_json()["email"]["id"]

    number_response = client.post(
        f"/api/recips/{recip_id}/numbers",
        headers=admin_auth_headers,
        json={"phone_number": "+995599123456", "is_active": True},
    )
    assert number_response.status_code == 201
    number_id = number_response.get_json()["number"]["id"]

    get_response = client.get(f"/api/recips/{recip_id}", headers=admin_auth_headers)
    assert get_response.status_code == 200
    data = get_response.get_json()
    assert len(data["emails"]) == 1
    assert len(data["numbers"]) == 1

    deactivate_email = client.put(
        f"/api/recips/emails/{email_id}",
        headers=admin_auth_headers,
        json={"is_active": False},
    )
    assert deactivate_email.status_code == 200
    assert deactivate_email.get_json()["email"]["is_active"] is False

    delete_number = client.delete(
        f"/api/recips/numbers/{number_id}",
        headers=admin_auth_headers,
    )
    assert delete_number.status_code == 200

    delete_email = client.delete(
        f"/api/recips/emails/{email_id}",
        headers=admin_auth_headers,
    )
    assert delete_email.status_code == 200
