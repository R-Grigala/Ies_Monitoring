import logging
from flask import jsonify
from flask_restx import Resource
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    current_user,
    set_refresh_cookies,
    unset_refresh_cookies,
)

from src.models import User, Role
from src.api.nsmodels import auth_ns, registration_parser, auth_parser
from src.utils import validate_password, normalize_email

logger = logging.getLogger("app.auth")


@auth_ns.route('/registration')
@auth_ns.doc(responses={200: 'OK', 400: 'Invalid Argument', 401: 'JWT Token Expires', 403: 'Forbidden', 404: 'Not Found'})
class RegistrationApi(Resource):
    @jwt_required()
    @auth_ns.doc(parser=registration_parser)
    @auth_ns.doc(security='JsonWebToken')
    def post(self):
        
        # ვამოწმებთ, აქვს თუ არა მიმდინარე მომხმარებელს ახალი ანგარიშის რეგისტრაციის უფლება.
        if not (current_user.check_permission('is_admin') or current_user.check_permission('can_users')):
            logger.warning("Registration denied: actor_uuid=%s missing permissions", current_user.uuid)
            return {"error": "არ გაქვს მომხმარებლის რეგისტრაციის ნებართვა."}, 403


        args = registration_parser.parse_args()
        try:
            normalized_email = normalize_email(args["email"])
        except ValueError as err:
            logger.info("Registration failed: invalid email format")
            return {"error": str(err)}, 400

        # ვამოწმებთ, ემთხვევა თუ არა პაროლის წესებს და განმეორებით შეყვანას.
        if args["password"] != args["passwordRepeat"]:
            logger.info("Registration failed: email=%s password mismatch", normalized_email)
            return {"error": "პაროლები არ ემთხვევა."}, 400

        try:
            validate_password(args["password"])
        except ValueError as err:
            logger.info("Registration failed: email=%s password policy error", normalized_email)
            return {"error": str(err)}, 400

        if User.query.filter_by(email=normalized_email).first():
            logger.info("Registration failed: email=%s already exists", normalized_email)
            return {"error": "ელ.ფოსტის მისამართი უკვე რეგისტრირებულია."}, 400

        role = Role.query.filter_by(name=args["role_name"]).first()
        if not role:
            logger.info("Registration failed: email=%s role not found=%s", normalized_email, args["role_name"])
            return {"error": "როლი ვერ მოიძებნა."}, 400

        new_user = User(
            name=args["name"],
            lastname=args["lastname"],
            email=normalized_email,
            password=args["password"],
            role_id=role.id
        )

        new_user.create()
        logger.info("Registration success: email=%s role=%s", normalized_email, role.name)

        return {"message": "მომხმარებელი წარმატებით დარეგისტრირდა."}, 200
    
@auth_ns.route('/login')
class AuthorizationApi(Resource):

    @auth_ns.doc(parser=auth_parser)
    def post(self):
        try:
            args = auth_parser.parse_args()

            try:
                normalized_email = normalize_email(args["email"])
            except ValueError:
                return {
                    "error": "შეყვანილი პაროლი ან ელ.ფოსტა არასწორია."
                }, 400

            user = User.query.filter_by(email=normalized_email).first()
            if not user or not user.check_password(args["password"]):
                return {
                    "error": "შეყვანილი პაროლი ან ელ.ფოსტა არასწორია."
                }, 400

            if not user.role:
                logger.warning("Login denied: user_uuid=%s has no role", user.uuid)
                return {"error": "მომხმარებლის როლი ვერ მოიძებნა."}, 403

            permissions = user.role.get_permissions()
            access_token = create_access_token(
                identity=user.uuid,
                additional_claims={
                    "role": user.role.name,
                    "permissions": permissions
                }
            )
            refresh_token = create_refresh_token(identity=user.uuid)

            response = jsonify({
                "message": "წარმატებით გაიარეთ ავტორიზაცია.",
                "access_token": access_token
            })
            set_refresh_cookies(response, refresh_token)
            return response
        except Exception:
            logger.exception("Login failed with unexpected error")
            return {"error": "ავტორიზაციისას დაფიქსირდა შიდა შეცდომა."}, 500

@auth_ns.route('/refresh')
class AccessTokenRefreshApi(Resource):

    @jwt_required(refresh=True)
    def post(self):
        identity = get_jwt_identity()
        user = User.query.filter_by(uuid=identity).first()
        if not user:
            return {"error": "მომხმარებელი ვერ მოიძებნა."}, 404
        if not user.role:
            return {"error": "მომხმარებლის როლი ვერ მოიძებნა."}, 403

        permissions = user.role.get_permissions()
        access_token = create_access_token(
            identity=user.uuid,
            additional_claims={
                "role": user.role.name,
                "permissions": permissions
            }
        )

        return {"access_token": access_token}, 200

@auth_ns.route('/logout')
class LogoutApi(Resource):

    def post(self):

        response = jsonify({
            "message": "logout success"
        })

        unset_refresh_cookies(response)

        return response