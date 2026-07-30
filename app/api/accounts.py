import logging

from flask_jwt_extended import current_user, get_jwt_identity, jwt_required
from flask_restx import Resource
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.api.nsmodels import (
    accounts_ns,
    account_model,
    current_user_model,
    account_update_parser,
    account_update_response_model,
    account_list_response_model,
    account_delete_response_model,
    error_model,
)
from app.models import User, Permission, UserPermission, RefreshToken
from app.utils.validators import normalize_email

logger = logging.getLogger("app.accounts")


def _user_delete_blockers(user):
    """Return human-readable reasons why a hard delete is not allowed."""
    blockers = []

    created_users = User.query.filter(
        User.created_by_user_id == user.id,
        User.id != user.id,
    ).count()
    if created_users:
        blockers.append(f"{created_users} user(s) created by this account")

    updated_users = User.query.filter(
        User.updated_by_user_id == user.id,
        User.id != user.id,
    ).count()
    if updated_users:
        blockers.append(f"{updated_users} user(s) last updated by this account")

    permission_refs = Permission.query.filter(
        or_(
            Permission.created_by_user_id == user.id,
            Permission.updated_by_user_id == user.id,
            Permission.deactivated_by_user_id == user.id,
        )
    ).count()
    if permission_refs:
        blockers.append(f"{permission_refs} permission record(s) reference this account")

    permission_grant_refs = UserPermission.query.filter(
        or_(
            UserPermission.granted_by_user_id == user.id,
            UserPermission.degranted_by_user_id == user.id,
        ),
        UserPermission.user_id != user.id,
    ).count()
    if permission_grant_refs:
        blockers.append(
            f"{permission_grant_refs} permission assignment(s) reference this account as grantor"
        )

    return blockers


@accounts_ns.route("/user")
class CurrentUserApi(Resource):
    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.marshal_with(current_user_model, code=200)
    @accounts_ns.response(404, "Not Found", error_model)
    def get(self):
        """Get current authenticated user."""
        identity = get_jwt_identity()
        user = User.query.filter_by(uuid=identity, is_active=True).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404
        user_data = user.to_dict()
        user_data["can_users"] = user.check_permission("can_users")
        return user_data

    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.expect(account_update_parser)
    @accounts_ns.marshal_with(account_update_response_model, code=200)
    @accounts_ns.response(400, "Validation Error", error_model)
    @accounts_ns.response(404, "Not Found", error_model)
    def put(self):
        """Update current authenticated user profile."""
        identity = get_jwt_identity()
        user = User.query.filter_by(uuid=identity, is_active=True).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404

        payload = account_update_parser.parse_args()
        first_name = payload.get("first_name")
        last_name = payload.get("last_name")

        if first_name is not None:
            value = first_name.strip()
            if not value:
                return {"error": "validation_error", "message": "first_name cannot be empty."}, 400
            user.first_name = value
        if last_name is not None:
            value = last_name.strip()
            if not value:
                return {"error": "validation_error", "message": "last_name cannot be empty."}, 400
            user.last_name = value

        user.updated_by_user_id = user.id
        user.save()
        return {"message": "Profile updated successfully.", "user": user.to_dict()}, 200


@accounts_ns.route("/accounts")
class AccountsApi(Resource):
    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.marshal_with(account_list_response_model, code=200)
    @accounts_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List all users (requires can_users)."""
        if not current_user.check_permission("can_users"):
            return {"error": "forbidden", "message": "Missing required permission: can_users"}, 403

        users = User.query.order_by(User.id.asc()).all()
        return {"items": [u.to_dict() for u in users], "total": len(users)}, 200


@accounts_ns.route("/accounts/<string:user_uuid>")
class AccountDetailApi(Resource):
    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.marshal_with(account_model, code=200)
    @accounts_ns.response(403, "Forbidden", error_model)
    @accounts_ns.response(404, "Not Found", error_model)
    def get(self, user_uuid):
        """Get a single user by UUID (requires can_users)."""
        if not current_user.check_permission("can_users"):
            return {"error": "forbidden", "message": "Missing required permission: can_users"}, 403

        user = User.query.filter_by(uuid=user_uuid).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404
        return user.to_dict()

    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.expect(account_update_parser)
    @accounts_ns.marshal_with(account_update_response_model, code=200)
    @accounts_ns.response(400, "Validation Error", error_model)
    @accounts_ns.response(403, "Forbidden", error_model)
    @accounts_ns.response(404, "Not Found", error_model)
    @accounts_ns.response(409, "Conflict", error_model)
    def put(self, user_uuid):
        """Update a user by UUID (requires can_users)."""
        if not current_user.check_permission("can_users"):
            return {"error": "forbidden", "message": "Missing required permission: can_users"}, 403

        user = User.query.filter_by(uuid=user_uuid).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404

        payload = account_update_parser.parse_args()

        if "first_name" in payload:
            value = (payload.get("first_name") or "").strip()
            if not value:
                return {"error": "validation_error", "message": "first_name cannot be empty."}, 400
            user.first_name = value

        if "last_name" in payload:
            value = (payload.get("last_name") or "").strip()
            if not value:
                return {"error": "validation_error", "message": "last_name cannot be empty."}, 400
            user.last_name = value

        if "email" in payload:
            try:
                normalized_email = normalize_email(payload.get("email"))
            except ValueError as err:
                return {"error": "validation_error", "message": str(err)}, 400

            existing = User.query.filter_by(email=normalized_email).first()
            if existing and existing.id != user.id:
                return {"error": "conflict", "message": "Email address is already registered."}, 409
            user.email = normalized_email

        if payload.get("is_active") is not None:
            new_is_active = bool(payload.get("is_active"))
            if user.id == current_user.id and not new_is_active:
                return {
                    "error": "conflict",
                    "message": "You cannot deactivate your own account.",
                }, 409
            user.is_active = new_is_active

        user.updated_by_user_id = current_user.id
        db.session.commit()
        logger.info("Account updated: actor_uuid=%s target_uuid=%s", current_user.uuid, user.uuid)
        return {"message": "User updated successfully.", "user": user.to_dict()}, 200

    @jwt_required()
    @accounts_ns.doc(security="JsonWebToken")
    @accounts_ns.marshal_with(account_delete_response_model, code=200)
    @accounts_ns.response(403, "Forbidden", error_model)
    @accounts_ns.response(404, "Not Found", error_model)
    @accounts_ns.response(409, "Conflict", error_model)
    def delete(self, user_uuid):
        """Delete a user by UUID when related records allow it (requires can_users)."""
        if not current_user.check_permission("can_users"):
            return {"error": "forbidden", "message": "Missing required permission: can_users"}, 403

        user = User.query.filter_by(uuid=user_uuid).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404

        if user.id == current_user.id:
            return {"error": "conflict", "message": "You cannot delete your own account."}, 409

        blockers = _user_delete_blockers(user)
        if blockers:
            return {
                "error": "conflict",
                "message": "User cannot be deleted because related records still reference this account: "
                + "; ".join(blockers),
            }, 409

        try:
            # Owned rows can safely go with the user.
            RefreshToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
            UserPermission.query.filter_by(user_id=user.id).delete(synchronize_session=False)

            # Clear self-references so the row itself is not blocked by its own audit FKs.
            if user.created_by_user_id == user.id:
                user.created_by_user_id = None
            if user.updated_by_user_id == user.id:
                user.updated_by_user_id = None

            user.delete()
        except IntegrityError:
            logger.warning(
                "Account delete blocked by integrity constraint: actor_uuid=%s target_uuid=%s",
                current_user.uuid,
                user_uuid,
            )
            return {
                "error": "conflict",
                "message": "User cannot be deleted because related database records still reference this account.",
            }, 409

        logger.info("Account deleted: actor_uuid=%s target_uuid=%s", current_user.uuid, user_uuid)
        return {"message": "User deleted successfully."}, 200
