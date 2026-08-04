from flask_restx import fields, reqparse

from app.extensions import api

services_ns = api.namespace(
    "Services",
    description="Service account (API key) management endpoints",
    path="/services",
)

JWT_OR_API_KEY = ["JsonWebToken", "ApiKeyAuth"]

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

service_model = services_ns.model(
    "Service",
    {
        "uuid": fields.String(required=True, example="0f6fd0fa-cceb-4f25-a79b-c9f8f3444bc2"),
        "name": fields.String(required=True, example="recip-export-worker"),
        "description": fields.String(required=False, example="Read-only recip export"),
        "api_key_prefix": fields.String(required=True, example="ies_abc1"),
        "is_active": fields.Boolean(required=True, example=True),
        "last_used_at": fields.String(required=False, example="2026-08-04T12:00:00"),
        "created_at": fields.String(required=False, example="2026-08-04T12:00:00"),
        "updated_at": fields.String(required=False, example="2026-08-04T12:00:00"),
        "created_by_user_id": fields.Integer(required=False, example=1),
        "updated_by_user_id": fields.Integer(required=False, example=1),
        "permissions": fields.List(
            fields.String,
            required=False,
            example=["can_recips_read"],
        ),
    },
)

service_list_response_model = services_ns.model(
    "ServiceListResponse",
    {
        "items": fields.List(fields.Nested(service_model)),
        "total": fields.Integer(example=1),
    },
)

service_register_response_model = services_ns.model(
    "ServiceRegisterResponse",
    {
        "message": fields.String(
            required=True,
            example="Service registered successfully. Store the api_key now; it will not be shown again.",
        ),
        "service": fields.Nested(service_model),
        "api_key": fields.String(required=True, example="ies_..."),
        "permissions": fields.List(fields.String, example=["can_recips_read"]),
    },
)

message_response_model = services_ns.model(
    "ServiceMessageResponse",
    {
        "message": fields.String(required=True, example="Service deleted successfully."),
    },
)

error_model = services_ns.model(
    "ServiceError",
    {
        "error": fields.String(required=True, example="forbidden"),
        "message": fields.String(required=True, example="Missing required permission: can_users"),
    },
)
