from flask_restx import fields, reqparse, inputs

from src.extensions import api


notification_ns = api.namespace(
    "NotificationRecipients",
    description="API endpoints for notification recipients",
    path="/api",
)


phone_recipient_model = notification_ns.model(
    "PhoneRecipient",
    {
        "id": fields.Integer(readOnly=True, description="Unique recipient ID"),
        "username": fields.String(required=True, description="Recipient name"),
        "phone": fields.String(required=True, description="Phone in E.164 format (+9955XXXXXXXX)"),
        "staff_member": fields.Boolean(description="Whether recipient is a staff member"),
        "is_active": fields.Boolean(description="Whether notifications are enabled"),
    },
)

email_recipient_model = notification_ns.model(
    "EmailRecipient",
    {
        "id": fields.Integer(readOnly=True, description="Unique recipient ID"),
        "username": fields.String(required=True, description="Recipient name"),
        "email": fields.String(required=True, description="Recipient email"),
        "staff_member": fields.Boolean(description="Whether recipient is a staff member"),
        "is_active": fields.Boolean(description="Whether notifications are enabled"),
    },
)

phone_recipient_parser = reqparse.RequestParser()
phone_recipient_parser.add_argument("username", type=str, required=True, help="Username is required")
phone_recipient_parser.add_argument("phone", type=str, required=True, help="Phone number is required")
phone_recipient_parser.add_argument("staff_member", type=inputs.boolean, required=False, default=False)
phone_recipient_parser.add_argument("is_active", type=inputs.boolean, required=False, default=True)

email_recipient_parser = reqparse.RequestParser()
email_recipient_parser.add_argument("username", type=str, required=True, help="Username is required")
email_recipient_parser.add_argument("email", type=str, required=True, help="Email is required")
email_recipient_parser.add_argument("staff_member", type=inputs.boolean, required=False, default=False)
email_recipient_parser.add_argument("is_active", type=inputs.boolean, required=False, default=True)
