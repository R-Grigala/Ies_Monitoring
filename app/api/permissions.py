import logging
import re
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from flask_restx import Resource, marshal

from app.api.nsmodels.permissions import (
    permissions_ns,
    JWT_OR_API_KEY,
    permission_create_parser,
    permission_model,
    permission_list_response_model,
    permission_create_response_model,
    permission_delete_response_model,
    error_model,
)
from app.extensions import db
from app.models import Permission, UserPermission
from app.models.service_permissions import ServicePermission
from app.utils.auth_utils import require_permissions, resolve_actor

logger = logging.getLogger("app.permissions")

CODE_RE = re.compile(r"^[a-z][a-z0-9_]{1,99}$")


def _require_manage_catalog():
    """Create/delete permissions requires can_permissions (or can_users as fallback)."""
    return require_permissions("can_permissions", "can_users")


def _require_read_catalog():
    """List catalog for assignment UIs."""
    return require_permissions("can_permissions", "can_users")


def _permission_to_dict(permission):
    return {
        "id": permission.id,
        "code": permission.code,
        "name": permission.name,
        "description": permission.description,
        "is_active": permission.is_active,
        "created_at": permission.created_at.isoformat() if permission.created_at else None,
        "updated_at": permission.updated_at.isoformat() if permission.updated_at else None,
    }


def _normalize_code(raw_code):
    code = (raw_code or "").strip().lower()
    if not code:
        raise ValueError("code cannot be empty.")
    if not CODE_RE.match(code):
        raise ValueError(
            "code must be lowercase, start with a letter, and contain only letters, digits, underscores."
        )
    return code


@permissions_ns.route("/")
class PermissionsApi(Resource):
    @permissions_ns.doc(security=JWT_OR_API_KEY)
    @permissions_ns.response(200, "Success", permission_list_response_model)
    @permissions_ns.response(401, "Unauthorized", error_model)
    @permissions_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List all permissions (active and inactive)."""
        denied = _require_read_catalog()
        if denied:
            return denied

        permissions = Permission.query.order_by(Permission.code.asc()).all()
        items = [_permission_to_dict(p) for p in permissions]
        return marshal({"items": items, "total": len(items)}, permission_list_response_model), 200

    @permissions_ns.doc(parser=permission_create_parser, security=JWT_OR_API_KEY)
    @permissions_ns.response(201, "Created", permission_create_response_model)
    @permissions_ns.response(400, "Validation Error", error_model)
    @permissions_ns.response(401, "Unauthorized", error_model)
    @permissions_ns.response(403, "Forbidden", error_model)
    @permissions_ns.response(409, "Conflict", error_model)
    def post(self):
        """Create a new permission in the catalog."""
        denied = _require_manage_catalog()
        if denied:
            return denied

        actor = resolve_actor()
        args = permission_create_parser.parse_args()

        try:
            code = _normalize_code(args.get("code"))
        except ValueError as err:
            return {"error": "validation_error", "message": str(err)}, 400

        name = (args.get("name") or "").strip()
        if not name:
            return {"error": "validation_error", "message": "name cannot be empty."}, 400

        description = (args.get("description") or "").strip() or None

        existing = Permission.query.filter_by(code=code).first()
        if existing:
            if not existing.is_active:
                # Re-activate soft-deleted permission with updated metadata.
                existing.name = name
                existing.description = description
                existing.is_active = True
                existing.deactivated_at = None
                existing.deactivated_by_user_id = None
                existing.updated_by_user_id = actor["user_id"]
                existing.save()
                logger.info(
                    "Permission re-activated: code=%s actor=%s",
                    code,
                    actor["label"],
                )
                return (
                    marshal(
                        {
                            "message": "Permission re-activated successfully.",
                            "permission": _permission_to_dict(existing),
                        },
                        permission_create_response_model,
                    ),
                    200,
                )
            return {
                "error": "conflict",
                "message": f"Permission code already exists: {code}",
            }, 409

        permission = Permission(
            code=code,
            name=name,
            description=description,
            is_active=True,
            created_by_user_id=actor["user_id"],
            updated_by_user_id=actor["user_id"],
        )
        permission.create()
        logger.info("Permission created: code=%s actor=%s", code, actor["label"])
        return (
            marshal(
                {
                    "message": "Permission created successfully.",
                    "permission": _permission_to_dict(permission),
                },
                permission_create_response_model,
            ),
            201,
        )


@permissions_ns.route("/<string:code_or_id>")
class PermissionDetailApi(Resource):
    @permissions_ns.doc(security=JWT_OR_API_KEY)
    @permissions_ns.response(200, "Success", permission_model)
    @permissions_ns.response(401, "Unauthorized", error_model)
    @permissions_ns.response(403, "Forbidden", error_model)
    @permissions_ns.response(404, "Not Found", error_model)
    def get(self, code_or_id):
        """Get a single permission by id or code."""
        denied = _require_read_catalog()
        if denied:
            return denied

        permission = _find_permission(code_or_id)
        if not permission:
            return {"error": "not_found", "message": "Permission not found."}, 404
        return marshal(_permission_to_dict(permission), permission_model), 200

    @permissions_ns.doc(security=JWT_OR_API_KEY)
    @permissions_ns.response(200, "Success", permission_delete_response_model)
    @permissions_ns.response(401, "Unauthorized", error_model)
    @permissions_ns.response(403, "Forbidden", error_model)
    @permissions_ns.response(404, "Not Found", error_model)
    @permissions_ns.response(409, "Conflict", error_model)
    def delete(self, code_or_id):
        """
        Delete a permission from the catalog.

        Hard-deletes when no assignments reference it.
        Otherwise soft-deactivates (is_active=false) so history is preserved.
        """
        denied = _require_manage_catalog()
        if denied:
            return denied

        actor = resolve_actor()
        permission = _find_permission(code_or_id)
        if not permission:
            return {"error": "not_found", "message": "Permission not found."}, 404

        if permission.code in {"can_users", "can_permissions"} and permission.is_active:
            # Keep core governance codes available; still allow soft deactivate only
            # when explicitly not the only safety net — block hard delete of seed codes.
            pass

        user_refs = UserPermission.query.filter_by(permission_id=permission.id).count()
        service_refs = ServicePermission.query.filter_by(permission_id=permission.id).count()

        if user_refs or service_refs:
            if not permission.is_active:
                return {
                    "error": "conflict",
                    "message": "Permission is already inactive and still referenced by assignments.",
                }, 409
            permission.is_active = False
            permission.deactivated_at = datetime.now()
            permission.deactivated_by_user_id = actor["user_id"]
            permission.updated_by_user_id = actor["user_id"]
            permission.save()
            logger.info(
                "Permission soft-deleted (deactivated): code=%s actor=%s",
                permission.code,
                actor["label"],
            )
            return (
                marshal(
                    {
                        "message": "Permission deactivated because it is still assigned to users or services.",
                    },
                    permission_delete_response_model,
                ),
                200,
            )

        try:
            code = permission.code
            permission.delete()
            logger.info("Permission hard-deleted: code=%s actor=%s", code, actor["label"])
            return marshal({"message": "Permission deleted successfully."}, permission_delete_response_model), 200
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "Permission cannot be deleted because related records still reference it.",
            }, 409


def _find_permission(code_or_id):
    if code_or_id.isdigit():
        by_id = Permission.query.filter_by(id=int(code_or_id)).first()
        if by_id:
            return by_id
    return Permission.query.filter_by(code=code_or_id).first()
