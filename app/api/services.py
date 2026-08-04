import logging

from flask import request
from flask_restx import Resource
from sqlalchemy.exc import IntegrityError

from app.api.nsmodels import (
    services_ns,
    register_service_parser,
    JWT_OR_API_KEY,
)
from app.extensions import db
from app.models import Permission, Service, ServicePermission
from app.utils.api_keys import generate_api_key
from app.utils.auth_utils import require_permissions, resolve_actor

logger = logging.getLogger("app.services")


def _normalize_permission_codes(raw_permissions):
    """Accept list/tuple/str (including comma-separated) and return unique codes."""
    if raw_permissions is None:
        return []

    if isinstance(raw_permissions, str):
        values = [raw_permissions]
    elif isinstance(raw_permissions, (list, tuple)):
        values = list(raw_permissions)
    else:
        values = [str(raw_permissions)]

    permission_codes = []
    for item in values:
        if item is None:
            continue
        nested = item if isinstance(item, (list, tuple)) else str(item).split(",")
        for code in nested:
            normalized = str(code).strip()
            if normalized and normalized not in permission_codes:
                permission_codes.append(normalized)
    return permission_codes


def _service_active_permission_codes(service):
    """Return active permission codes granted to a service."""
    rows = (
        db.session.query(Permission.code)
        .join(ServicePermission, ServicePermission.permission_id == Permission.id)
        .filter(
            ServicePermission.service_id == service.id,
            ServicePermission.degranted_at.is_(None),
            Permission.is_active.is_(True),
        )
        .order_by(Permission.code.asc())
        .all()
    )
    return [code for (code,) in rows]


def _service_payload(service):
    data = service.to_dict()
    data["permissions"] = _service_active_permission_codes(service)
    return data


@services_ns.route("/")
class ServicesApi(Resource):
    @services_ns.doc(security=JWT_OR_API_KEY)
    @services_ns.response(200, "OK")
    @services_ns.response(401, "Unauthorized")
    @services_ns.response(403, "Forbidden")
    def get(self):
        """List registered services (JWT or API key with can_users)."""
        denied = require_permissions("can_users")
        if denied:
            return denied

        services = Service.query.order_by(Service.created_at.desc()).all()
        items = [_service_payload(service) for service in services]
        return {"items": items, "total": len(items)}, 200

    @services_ns.doc(parser=register_service_parser, security=JWT_OR_API_KEY)
    @services_ns.response(201, "Created")
    @services_ns.response(400, "Invalid Argument")
    @services_ns.response(401, "Unauthorized")
    @services_ns.response(403, "Forbidden")
    def post(self):
        """Register a service account and return a one-time raw API key."""
        denied = require_permissions("can_users")
        if denied:
            return denied

        actor = resolve_actor()
        args = register_service_parser.parse_args()
        name = (args.get("name") or "").strip()
        description = (args.get("description") or "").strip() or None

        # Prefer parser values; if frontend sent JSON array, also accept request.json.
        raw_permissions = args.get("permissions")
        if not raw_permissions:
            json_body = request.get_json(silent=True) or {}
            raw_permissions = json_body.get("permissions")

        if not name:
            return {"error": "validation_error", "message": "name cannot be empty."}, 400

        permission_codes = _normalize_permission_codes(raw_permissions)

        if not permission_codes:
            return {
                "error": "validation_error",
                "message": "At least one permission is required.",
            }, 400

        permissions = []
        missing = []
        inactive = []
        for code in permission_codes:
            permission = Permission.query.filter_by(code=code).first()
            if not permission:
                missing.append(code)
                continue
            if not permission.is_active:
                inactive.append(code)
                continue
            permissions.append(permission)

        if missing:
            return {
                "error": "validation_error",
                "message": f"Unknown permission code(s): {', '.join(missing)}",
            }, 400
        if inactive:
            return {
                "error": "validation_error",
                "message": f"Inactive permission code(s): {', '.join(inactive)}",
            }, 400

        raw_key, prefix, key_hash = generate_api_key()
        service = Service(
            name=name,
            description=description,
            api_key_prefix=prefix,
            api_key_hash=key_hash,
            is_active=True,
            created_by_user_id=actor["user_id"],
            updated_by_user_id=actor["user_id"],
        )
        service.create(commit=False)

        assigned_codes = []
        for permission in permissions:
            assignment = ServicePermission(
                service_id=service.id,
                permission_id=permission.id,
                granted_by_user_id=actor["user_id"],
            )
            assignment.create(commit=False)
            assigned_codes.append(permission.code)

        Service.save()

        logger.info(
            "Service registration success: service_uuid=%s name=%s permissions=%s actor=%s",
            service.uuid,
            service.name,
            assigned_codes,
            actor["label"],
        )
        payload = _service_payload(service)
        payload["permissions"] = assigned_codes
        return {
            "message": "Service registered successfully. Store the api_key now; it will not be shown again.",
            "service": payload,
            "api_key": raw_key,
            "permissions": assigned_codes,
        }, 201


@services_ns.route("/<string:service_uuid>")
class ServiceDetailApi(Resource):
    @services_ns.doc(security=JWT_OR_API_KEY)
    @services_ns.response(200, "OK")
    @services_ns.response(401, "Unauthorized")
    @services_ns.response(403, "Forbidden")
    @services_ns.response(404, "Not Found")
    @services_ns.response(409, "Conflict")
    def delete(self, service_uuid):
        """Delete a service and its permission assignments (JWT or API key with can_users)."""
        denied = require_permissions("can_users")
        if denied:
            return denied

        actor = resolve_actor()
        service = Service.query.filter_by(uuid=service_uuid).first()
        if not service:
            return {"error": "not_found", "message": "Service not found."}, 404

        try:
            ServicePermission.query.filter_by(service_id=service.id).delete(synchronize_session=False)
            service.delete()
        except IntegrityError:
            logger.warning(
                "Service delete blocked by integrity constraint: actor=%s service_uuid=%s",
                actor["label"],
                service_uuid,
            )
            return {
                "error": "conflict",
                "message": "Service cannot be deleted because related database records still reference it.",
            }, 409

        logger.info(
            "Service deleted: actor=%s service_uuid=%s",
            actor["label"],
            service_uuid,
        )
        return {"message": "Service deleted successfully."}, 200

