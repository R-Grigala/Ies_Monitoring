import logging

from flask_restx import Resource
from flask_jwt_extended import current_user, jwt_required

from src.api.nsmodels import (
    notification_ns,
    phone_recipient_model,
    email_recipient_model,
    phone_recipient_parser,
    email_recipient_parser,
)
from src.models import PhoneRecipient, EmailRecipient

logger = logging.getLogger("app.notifications")


def _require_manage_users_permission():
    if not current_user.check_permission("can_users"):
        return {"error": "არ გაქვს მიმღებების მართვის ნებართვა."}, 403
    return None, None


@notification_ns.route("/phone_recipients")
class PhoneRecipientListAPI(Resource):
    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.marshal_list_with(phone_recipient_model)
    def get(self):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipients = PhoneRecipient.query.order_by(PhoneRecipient.id.desc()).all()
        return recipients, 200

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.expect(phone_recipient_parser)
    def post(self):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        args = phone_recipient_parser.parse_args()
        try:
            recipient = PhoneRecipient(
                username=args["username"],
                phone=args["phone"],
                staff_member=bool(args.get("staff_member")),
                is_active=bool(args.get("is_active")),
            )
            recipient.create()
            return {"message": "ტელეფონის მიმღები წარმატებით დაემატა.", "id": recipient.id}, 201
        except Exception as exc:
            logger.exception("Create phone recipient failed")
            return {"error": str(exc)}, 400


@notification_ns.route("/phone_recipients/<int:recipient_id>")
class PhoneRecipientDetailAPI(Resource):
    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.marshal_with(phone_recipient_model)
    def get(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = PhoneRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ტელეფონის მიმღები ვერ მოიძებნა."}, 404
        return recipient, 200

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.expect(phone_recipient_parser)
    def put(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = PhoneRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ტელეფონის მიმღები ვერ მოიძებნა."}, 404

        args = phone_recipient_parser.parse_args()
        try:
            recipient.username = args["username"]
            recipient.phone = args["phone"]
            recipient.staff_member = bool(args.get("staff_member"))
            recipient.is_active = bool(args.get("is_active"))
            recipient.save()
            return {"message": "ტელეფონის მიმღები წარმატებით განახლდა."}, 200
        except Exception as exc:
            logger.exception("Update phone recipient failed: id=%s", recipient_id)
            return {"error": str(exc)}, 400

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    def delete(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = PhoneRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ტელეფონის მიმღები ვერ მოიძებნა."}, 404

        recipient.delete()
        return {"message": "ტელეფონის მიმღები წარმატებით წაიშალა."}, 200


@notification_ns.route("/email_recipients")
class EmailRecipientListAPI(Resource):
    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.marshal_list_with(email_recipient_model)
    def get(self):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipients = EmailRecipient.query.order_by(EmailRecipient.id.desc()).all()
        return recipients, 200

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.expect(email_recipient_parser)
    def post(self):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        args = email_recipient_parser.parse_args()
        try:
            recipient = EmailRecipient(
                username=args["username"],
                email=args["email"],
                staff_member=bool(args.get("staff_member")),
                is_active=bool(args.get("is_active")),
            )
            recipient.create()
            return {"message": "ელ.ფოსტის მიმღები წარმატებით დაემატა.", "id": recipient.id}, 201
        except Exception as exc:
            logger.exception("Create email recipient failed")
            return {"error": str(exc)}, 400


@notification_ns.route("/email_recipients/<int:recipient_id>")
class EmailRecipientDetailAPI(Resource):
    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.marshal_with(email_recipient_model)
    def get(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = EmailRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ელ.ფოსტის მიმღები ვერ მოიძებნა."}, 404
        return recipient, 200

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    @notification_ns.expect(email_recipient_parser)
    def put(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = EmailRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ელ.ფოსტის მიმღები ვერ მოიძებნა."}, 404

        args = email_recipient_parser.parse_args()
        try:
            recipient.username = args["username"]
            recipient.email = args["email"]
            recipient.staff_member = bool(args.get("staff_member"))
            recipient.is_active = bool(args.get("is_active"))
            recipient.save()
            return {"message": "ელ.ფოსტის მიმღები წარმატებით განახლდა."}, 200
        except Exception as exc:
            logger.exception("Update email recipient failed: id=%s", recipient_id)
            return {"error": str(exc)}, 400

    @jwt_required()
    @notification_ns.doc(security="JsonWebToken")
    def delete(self, recipient_id):
        permission_error, status_code = _require_manage_users_permission()
        if permission_error:
            return permission_error, status_code

        recipient = EmailRecipient.query.get(recipient_id)
        if not recipient:
            return {"error": "ელ.ფოსტის მიმღები ვერ მოიძებნა."}, 404

        recipient.delete()
        return {"message": "ელ.ფოსტის მიმღები წარმატებით წაიშალა."}, 200
