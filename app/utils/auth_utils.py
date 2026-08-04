from flask import request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.config import Config
from app.extensions import db
from app.models import User
from app.utils.api_keys import find_service_by_api_key, touch_service_last_used


def get_request_api_key():
    return request.headers.get("X-API-Key")


def get_authenticated_service(touch_last_used=True):
    """Return active Service resolved from X-API-Key, or None."""
    raw_key = get_request_api_key()
    if not raw_key:
        return None

    service = find_service_by_api_key(raw_key)
    if not service:
        return None

    if touch_last_used:
        touch_service_last_used(service, commit=True)
    return service


def get_authenticated_user():
    """Return active User from JWT, or None."""
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if not identity:
            return None
        return User.query.filter_by(uuid=identity, is_active=True).first()
    except Exception:
        return None


def resolve_actor():
    """
    Resolve current request actor.

    Returns dict:
      kind: "service" | "user" | None
      user / service objects
      user_id: int | None  (for audit FK fields; None for services)
      label: str for logs
    """
    service = get_authenticated_service(touch_last_used=False)
    if service:
        return {
            "kind": "service",
            "service": service,
            "user": None,
            "user_id": None,
            "label": f"service:{service.uuid}",
        }

    user = get_authenticated_user()
    if user:
        return {
            "kind": "user",
            "service": None,
            "user": user,
            "user_id": user.id,
            "label": f"user:{user.uuid}",
        }

    return {
        "kind": None,
        "service": None,
        "user": None,
        "user_id": None,
        "label": "anonymous",
    }


def is_authorized_request():
    """ამოწმებს მოთხოვნას: service X-API-Key, legacy Config.API_KEY, ან JWT Bearer ტოკენი."""
    service = get_authenticated_service(touch_last_used=False)
    if service:
        return True

    api_key = get_request_api_key()
    if api_key and api_key == Config.API_KEY:
        return True

    return get_authenticated_user() is not None


def has_user_permission(user, permission_code):
    """ამოწმებს აქვს თუ არა კონკრეტულ მომხმარებელს აქტიური უფლება."""
    if not user or not getattr(user, "is_active", False):
        return False

    from app.models.permissions import Permission
    from app.models.user_permissions import UserPermission

    assignment = (
        db.session.query(UserPermission.id)
        .join(Permission, Permission.id == UserPermission.permission_id)
        .filter(
            UserPermission.user_id == user.id,
            UserPermission.degranted_at.is_(None),
            Permission.is_active.is_(True),
            Permission.code == permission_code,
        )
        .first()
    )
    return assignment is not None


def has_service_permission(service, permission_code):
    """ამოწმებს აქვს თუ არა სერვისს აქტიური უფლება."""
    if not service or not getattr(service, "is_active", False):
        return False

    from app.models.permissions import Permission
    from app.models.service_permissions import ServicePermission

    assignment = (
        db.session.query(ServicePermission.id)
        .join(Permission, Permission.id == ServicePermission.permission_id)
        .filter(
            ServicePermission.service_id == service.id,
            ServicePermission.degranted_at.is_(None),
            Permission.is_active.is_(True),
            Permission.code == permission_code,
        )
        .first()
    )
    return assignment is not None


def have_permission(permission):
    """ამოწმებს მომხმარებლის ან სერვისის უფლებას."""
    return require_permissions(permission) is None


def actor_has_any_permission(*permission_codes):
    """Return True if current request actor has any of the given permissions."""
    return require_permissions(*permission_codes) is None


def require_permissions(*permission_codes):
    """
    Allow request if JWT user OR service API key has any of the given permissions.

    Returns:
        None if allowed
        (error_body, status_code) if denied
    """
    if not permission_codes:
        raise ValueError("At least one permission code is required.")

    raw_key = get_request_api_key()
    if raw_key:
        service = find_service_by_api_key(raw_key)
        if service:
            touch_service_last_used(service, commit=True)
            for code in permission_codes:
                if has_service_permission(service, code):
                    return None
            return {
                "error": "forbidden",
                "message": f"Missing required permission: {permission_codes[0]}",
            }, 403

        # Legacy global key retains full access for ingestion compatibility.
        if raw_key == Config.API_KEY:
            return None

        return {"error": "unauthorized", "message": "Invalid API key."}, 401

    try:
        verify_jwt_in_request()
    except Exception:
        return {"error": "unauthorized", "message": "Authentication required."}, 401

    identity = get_jwt_identity()
    user = User.query.filter_by(uuid=identity, is_active=True).first()
    if not user:
        return {"error": "unauthorized", "message": "Authentication required."}, 401

    for code in permission_codes:
        if has_user_permission(user, code):
            return None

    return {
        "error": "forbidden",
        "message": f"Missing required permission: {permission_codes[0]}",
    }, 403
