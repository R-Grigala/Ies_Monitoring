from flask_restx import reqparse, inputs
from app.extensions import api


auth_ns = api.namespace(
    "Auth",
    description="API endpoints for authentication related operations",
    path="/auth",
)

registration_parser = reqparse.RequestParser()
registration_parser.add_argument(
    "first_name",
    type=str,
    required=True,
    help="First name example: Roma",
)
registration_parser.add_argument(
    "last_name",
    type=str,
    required=True,
    help="Last name example: Grigalashvili",
)
registration_parser.add_argument(
    "email",
    type=inputs.email(check=True),
    required=True,
    help="Email example: roma.grigalashvili@iliauni.edu.ge",
)
registration_parser.add_argument(
    "password",
    type=str,
    required=True,
    help="Password must be at least 12 characters with upper, lower, digit and special character",
)
registration_parser.add_argument(
    "passwordRepeat",
    type=str,
    required=True,
    help="Repeat the password",
)

auth_parser = reqparse.RequestParser()
auth_parser.add_argument(
    "email",
    required=True,
    type=str,
    help="Email example: roma.grigalashvili@iliauni.edu.ge",
)
auth_parser.add_argument(
    "password",
    required=True,
    type=str,
    help="Password",
)

request_reset_password_parser = reqparse.RequestParser()
request_reset_password_parser.add_argument(
    "email",
    required=True,
    type=str,
    help="Email address of the user",
)

reset_password_parser = reqparse.RequestParser()
reset_password_parser.add_argument(
    "token",
    required=True,
    type=str,
    help="Token for password reset",
)
reset_password_parser.add_argument(
    "password",
    required=True,
    type=str,
    help="New password",
)
reset_password_parser.add_argument(
    "retype_password",
    required=True,
    type=str,
    help="Repeat the password",
)

register_service_parser = reqparse.RequestParser()
register_service_parser.add_argument(
    "name",
    type=str,
    required=True,
    help="Service name example: recip-export-worker",
)
register_service_parser.add_argument(
    "description",
    type=str,
    required=False,
    help="Optional service description",
)
register_service_parser.add_argument(
    "permissions",
    type=str,
    required=True,
    action="append",
    help="Permission code to grant. Repeat field or comma-separate, e.g. can_recips_read",
)
