from flask_restx import fields, inputs, reqparse

from app.extensions import api

recips_ns = api.namespace(
    "Recips",
    description="Notification recipients management endpoints",
    path="/recips",
)

recip_email_model = recips_ns.model(
    "RecipEmail",
    {
        "id": fields.Integer(required=True, example=1),
        "email": fields.String(required=True, example="duty@example.ge"),
        "recip_id": fields.Integer(required=True, example=1),
        "is_active": fields.Boolean(required=True, example=True),
        "created_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "updated_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "created_by_user_id": fields.Integer(required=False, example=1),
        "updated_by_user_id": fields.Integer(required=False, example=1),
    },
)

recip_number_model = recips_ns.model(
    "RecipNumber",
    {
        "id": fields.Integer(required=True, example=1),
        "phone_number": fields.String(required=True, example="+995599123456"),
        "recip_id": fields.Integer(required=True, example=1),
        "is_active": fields.Boolean(required=True, example=True),
        "created_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "updated_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "created_by_user_id": fields.Integer(required=False, example=1),
        "updated_by_user_id": fields.Integer(required=False, example=1),
    },
)

recip_model = recips_ns.model(
    "Recip",
    {
        "id": fields.Integer(required=True, example=1),
        "username": fields.String(required=True, example="NSMC Duty Officer"),
        "is_staff": fields.Boolean(required=True, example=True),
        "is_active": fields.Boolean(required=True, example=True),
        "created_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "updated_at": fields.String(required=False, example="2026-07-30T12:00:00"),
        "created_by_user_id": fields.Integer(required=False, example=1),
        "updated_by_user_id": fields.Integer(required=False, example=1),
        "emails": fields.List(fields.Nested(recip_email_model), required=True),
        "numbers": fields.List(fields.Nested(recip_number_model), required=True),
    },
)

recip_create_parser = reqparse.RequestParser()
recip_create_parser.add_argument(
    "username",
    type=str,
    required=True,
    help="Recipient username example: NSMC Duty Officer",
)
recip_create_parser.add_argument(
    "is_staff",
    type=inputs.boolean,
    required=False,
    default=False,
    help="Whether recipient is staff (default: false)",
)
recip_create_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    default=True,
    help="Whether recipient is active (default: true)",
)

recip_update_parser = reqparse.RequestParser()
recip_update_parser.add_argument(
    "username",
    type=str,
    required=False,
    help="Recipient username example: NSMC Duty Officer",
)
recip_update_parser.add_argument(
    "is_staff",
    type=inputs.boolean,
    required=False,
    help="Whether recipient is staff",
)
recip_update_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    help="Whether recipient is active",
)

recip_email_create_parser = reqparse.RequestParser()
recip_email_create_parser.add_argument(
    "email",
    type=str,
    required=True,
    help="Email example: duty@example.ge",
)
recip_email_create_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    default=True,
    help="Whether email is active (default: true)",
)

recip_email_update_parser = reqparse.RequestParser()
recip_email_update_parser.add_argument(
    "email",
    type=str,
    required=False,
    help="Email example: duty@example.ge",
)
recip_email_update_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    help="Whether email is active",
)

recip_number_create_parser = reqparse.RequestParser()
recip_number_create_parser.add_argument(
    "phone_number",
    type=str,
    required=True,
    help="Phone number example: +995599123456",
)
recip_number_create_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    default=True,
    help="Whether phone number is active (default: true)",
)

recip_number_update_parser = reqparse.RequestParser()
recip_number_update_parser.add_argument(
    "phone_number",
    type=str,
    required=False,
    help="Phone number example: +995599123456",
)
recip_number_update_parser.add_argument(
    "is_active",
    type=inputs.boolean,
    required=False,
    help="Whether phone number is active",
)

recip_response_model = recips_ns.model(
    "RecipResponse",
    {
        "message": fields.String(required=True, example="Recipient created successfully."),
        "recip": fields.Nested(recip_model, required=True),
    },
)

recip_list_response_model = recips_ns.model(
    "RecipListResponse",
    {
        "items": fields.List(fields.Nested(recip_model), required=True),
        "total": fields.Integer(required=True, example=1),
    },
)

recip_email_response_model = recips_ns.model(
    "RecipEmailResponse",
    {
        "message": fields.String(required=True, example="Email added successfully."),
        "email": fields.Nested(recip_email_model, required=True),
    },
)

recip_number_response_model = recips_ns.model(
    "RecipNumberResponse",
    {
        "message": fields.String(required=True, example="Phone number added successfully."),
        "number": fields.Nested(recip_number_model, required=True),
    },
)

message_response_model = recips_ns.model(
    "MessageResponse",
    {
        "message": fields.String(required=True, example="Recipient deleted successfully."),
    },
)

error_model = recips_ns.model(
    "RecipErrorResponse",
    {
        "error": fields.String(required=True, example="forbidden"),
        "message": fields.String(required=True, example="Missing required permission: can_recip"),
    },
)
