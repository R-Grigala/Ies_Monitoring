import logging
from datetime import datetime, timedelta

from flask import current_app, jsonify, request
from flask_jwt_extended import (
    current_user,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    set_refresh_cookies,
    unset_jwt_cookies,
    verify_jwt_in_request,
)
from flask_restx import Resource
from sqlalchemy.exc import IntegrityError

from app.api.nsmodels import (
    auth_ns,
    auth_parser,
    registration_parser,
    register_service_parser,
    request_reset_password_parser,
    reset_password_parser,
)
from app.models import User, Permission, Service, ServicePermission
from app.utils import normalize_email, validate_password, mailer, url_serializer
from app.utils.api_keys import generate_api_key
from app.utils.auth_utils import require_permissions, resolve_actor
from app.utils.refresh_tokens import (
    RefreshTokenError,
    find_by_jti,
    get_raw_refresh_token_from_request,
    issue_token_pair,
    revoke_all_user_tokens,
    revoke_token,
    rotate_refresh_token,
)

logger = logging.getLogger("app.auth")

JWT_OR_API_KEY = ["JsonWebToken", "ApiKeyAuth"]


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
        # Checkbox/form clients may send nested lists or comma-separated values.
        nested = item if isinstance(item, (list, tuple)) else str(item).split(",")
        for code in nested:
            normalized = str(code).strip()
            if normalized and normalized not in permission_codes:
                permission_codes.append(normalized)
    return permission_codes


def _access_token_expires_in():
    expires = current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES")
    if expires is None:
        return None
    return int(expires.total_seconds())


def _auth_response(access_token, refresh_token):
    response = jsonify(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": _access_token_expires_in(),
        }
    )
    set_refresh_cookies(response, refresh_token)
    return response


@auth_ns.route("/register")
@auth_ns.doc(
    responses={
        200: "OK",
        400: "Invalid Argument",
        401: "Unauthorized",
        403: "Forbidden",
    }
)
class RegistrationApi(Resource):
    @auth_ns.doc(parser=registration_parser)
    @auth_ns.doc(security=JWT_OR_API_KEY)
    def post(self):
        denied = require_permissions("can_users")
        if denied:
            return denied

        actor = resolve_actor()
        args = registration_parser.parse_args()

        try:
            normalized_email = normalize_email(args["email"])
        except ValueError as err:
            logger.info("Registration failed: invalid email format")
            return {"error": "validation_error", "message": str(err)}, 400

        first_name = (args.get("first_name") or "").strip()
        last_name = (args.get("last_name") or "").strip()
        if not first_name or not last_name:
            return {
                "error": "validation_error",
                "message": "first_name and last_name are required.",
            }, 400

        if args["password"] != args["passwordRepeat"]:
            logger.info("Registration failed: email=%s password mismatch", normalized_email)
            return {"error": "validation_error", "message": "Passwords do not match."}, 400

        try:
            validate_password(args["password"])
        except ValueError as err:
            logger.info("Registration failed: email=%s password policy error", normalized_email)
            return {"error": "validation_error", "message": str(err)}, 400

        if User.query.filter_by(email=normalized_email).first():
            logger.info("Registration failed: email=%s already exists", normalized_email)
            return {
                "error": "conflict",
                "message": "Email address is already registered.",
            }, 400

        new_user = User(
            first_name=first_name,
            last_name=last_name,
            email=normalized_email,
            password=args["password"],
            created_by_user_id=actor["user_id"],
            updated_by_user_id=actor["user_id"],
        )
        new_user.create()
        logger.info("Registration success: email=%s actor=%s", normalized_email, actor["label"])

        return {"message": "User registered successfully.", "user": new_user.to_dict()}, 200


@auth_ns.route("/register_service")
@auth_ns.doc(
    responses={
        201: "Created",
        400: "Invalid Argument",
        401: "Unauthorized",
        403: "Forbidden",
    }
)
class RegisterServiceApi(Resource):
    @auth_ns.doc(parser=register_service_parser)
    @auth_ns.doc(security=JWT_OR_API_KEY)
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
        return {
            "message": "Service registered successfully. Store the api_key now; it will not be shown again.",
            "service": service.to_dict(),
            "api_key": raw_key,
            "permissions": assigned_codes,
        }, 201


@auth_ns.route("/services/<string:service_uuid>")
class ServiceDetailApi(Resource):
    @auth_ns.doc(security=JWT_OR_API_KEY)
    @auth_ns.response(200, "OK")
    @auth_ns.response(401, "Unauthorized")
    @auth_ns.response(403, "Forbidden")
    @auth_ns.response(404, "Not Found")
    @auth_ns.response(409, "Conflict")
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


@auth_ns.route("/login")
class AuthorizationApi(Resource):
    @auth_ns.doc(parser=auth_parser)
    def post(self):
        try:
            args = auth_parser.parse_args()

            try:
                normalized_email = normalize_email(args["email"])
            except ValueError:
                return {"error": "invalid_credentials", "message": "Invalid email or password."}, 400

            user = User.query.filter_by(email=normalized_email).first()
            if not user or not user.check_password(args["password"]):
                return {"error": "invalid_credentials", "message": "Invalid email or password."}, 400

            if not user.is_active:
                logger.warning("Login denied: user_uuid=%s is inactive", user.uuid)
                return {"error": "forbidden", "message": "User account is inactive."}, 403

            user.last_login_at = datetime.now()
            user.save()

            access_token, refresh_token, _ = issue_token_pair(user)
            return _auth_response(access_token, refresh_token)
        except Exception:
            logger.exception("Login failed with unexpected error")
            return {"error": "internal_error", "message": "Internal error occurred during authorization."}, 500


@auth_ns.route("/refresh")
class AccessTokenRefreshApi(Resource):
    @jwt_required(refresh=True)
    def post(self):
        identity = get_jwt_identity()
        user = User.query.filter_by(uuid=identity).first()
        if not user:
            return {"error": "not_found", "message": "User not found."}, 404
        if not user.is_active:
            return {"error": "forbidden", "message": "User account is inactive."}, 403

        claims = get_jwt()
        jti = claims.get("jti")
        raw_refresh = get_raw_refresh_token_from_request()
        if not jti or not raw_refresh:
            return {"error": "token_revoked", "message": "Refresh token is missing."}, 401

        try:
            access_token, refresh_token, _ = rotate_refresh_token(
                user,
                jti=jti,
                raw_refresh_token=raw_refresh,
            )
        except RefreshTokenError as err:
            response = jsonify({"error": err.code, "message": err.message})
            unset_jwt_cookies(response)
            return response, err.status_code

        return _auth_response(access_token, refresh_token)


@auth_ns.route("/logout")
class LogoutApi(Resource):
    def post(self):
        """Revoke the current refresh session (docs/05) and clear cookies."""
        try:
            verify_jwt_in_request(refresh=True)
            jti = get_jwt().get("jti")
            record = find_by_jti(jti) if jti else None
            if record and record.revoked_at is None:
                revoke_token(record)
                logger.info("Logout revoked refresh token: jti=%s user_id=%s", record.jti, record.user_id)
        except Exception:
            # Idempotent logout: missing/invalid refresh cookie still clears cookies.
            logger.info("Logout without valid refresh cookie")

        response = jsonify({"message": "logout success"})
        unset_jwt_cookies(response)
        return response


@auth_ns.route("/logout_all")
class LogoutAllApi(Resource):
    @jwt_required()
    @auth_ns.doc(security="JsonWebToken")
    def post(self):
        """Revoke every active refresh session for the current user."""
        count = revoke_all_user_tokens(current_user.id)
        logger.info("Logout-all revoked %s refresh tokens for user_uuid=%s", count, current_user.uuid)

        response = jsonify(
            {
                "message": "logout_all success",
                "revoked_sessions": count,
            }
        )
        unset_jwt_cookies(response)
        return response

@auth_ns.route('/request_reset_password')
@auth_ns.doc(responses={200: 'OK', 400: 'Invalid Argument', 401: 'JWT Token Expires', 403: 'Forbidden', 404: 'Not Found'})
class RequestResetPasswordApi(Resource):
    @auth_ns.doc(parser=request_reset_password_parser)
    def post(self):
        ''' Request for reset password '''
        args = request_reset_password_parser.parse_args()
        email = args.get('email')

        user = User.query.filter_by(email=email).first()

        if not user:
            logger.info("Reset password request failed: email=%s user not found", email)
            return {'error' : 'No user exists with the provided email.'}, 400
        
        token = url_serializer.generate_token(data=user.uuid, salt='reset_password')
        reset_url = f'{request.url_root}reset_password/{token}'

        subject = 'Password reset'
        message = f'Hello,\nTo reset your password, please visit the following link: {reset_url}'
        
        last_sent = user.last_sent_email
        current_time = datetime.now()
        if last_sent is not None:
            difference = current_time - last_sent
            if difference < timedelta(seconds=60):
                logger.info("Reset password request throttled: user_uuid=%s", user.uuid)
                return {'error': f'Please try again in {int(60 - difference.total_seconds())} seconds.'}, 400

        try:
            status = mailer.send_mail(emails=[email], subject=subject, message=message)

            if not status:
                logger.error("Reset password request email send failed: user_uuid=%s", user.uuid)
                return{'error': 'An error occurred while sending email.'}, 400
            
            current_time = datetime.now()

            user.last_sent_email = current_time
            user.save()
            logger.info("Reset password request success: user_uuid=%s", user.uuid)

            return {'message': 'Please check your email, a verification link has been sent.'}, 200
        except Exception as err:
            logger.exception("Reset password request exception: email=%s", email)
            return {'error': f'An error occurred while sending email: {err}'}, 400


@auth_ns.route('/reset_password')
@auth_ns.doc(responses={200: 'OK', 400: 'Invalid Argument', 401: 'JWT Token Expires', 403: 'Forbidden', 404: 'Not Found'})
class ResetPasswordApi(Resource):
    @auth_ns.doc(parser=reset_password_parser)
    def put(self):
        ''' Reset password '''
        args = reset_password_parser.parse_args()

        token = args.get('token')
        uuid = url_serializer.unload_token(token=token,salt='reset_password', max_age_seconds=300)

        if uuid == 'invalid':
            logger.info("Forgot password failed: invalid token")
            return {'error': 'Invalid token.'}, 400
        elif uuid == 'expired':
            logger.info("Forgot password failed: expired token")
            return {'error': 'Token has expired.'}, 400
        
        user = User.query.filter_by(uuid=uuid).first()
        if not user:
            logger.info("Reset password failed: token user missing uuid=%s", uuid)
            return {'error': 'User not found.'}, 404
        
        if args.get('password') != args.get("retype_password"):
            logger.info("Reset password failed: user_uuid=%s password mismatch", user.uuid)
            return {"error": "Passwords do not match."}, 400

        try:
            validate_password(args.get("password"))
        except ValueError as err:
            logger.info("Reset password failed: user_uuid=%s password policy error", user.uuid)
            return {"error": str(err)}, 400

        password = args.get('password')
        try:
            user.password = password
            user.save()
            logger.info("Reset password success: user_uuid=%s", user.uuid)
            return {'message': 'Password reset successfully.'}, 200
        except Exception:
            logger.exception("Reset password exception: user_uuid=%s", user.uuid)
            return {'error': 'An error occurred while changing password.'}, 400
