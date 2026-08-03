import logging

from flask_restx import Resource, marshal
from sqlalchemy.exc import IntegrityError

from app.api.nsmodels import (
    recips_ns,
    recip_model,
    recip_create_parser,
    recip_update_parser,
    recip_email_create_parser,
    recip_email_update_parser,
    recip_number_create_parser,
    recip_number_update_parser,
    recip_response_model,
    recip_list_response_model,
    recip_email_response_model,
    recip_number_response_model,
    message_response_model,
    error_model,
)
from app.extensions import db
from app.models import Recip, RecipEmail, RecipNumber
from app.utils.auth_utils import require_permissions, resolve_actor
from app.utils.validators import normalize_email, normalize_ge_phone

logger = logging.getLogger("app.recips")

JWT_OR_API_KEY = ["JsonWebToken", "ApiKeyAuth"]


def _require_recips_read():
    return require_permissions("can_recips", "can_recips_read")


def _require_can_recips():
    return require_permissions("can_recips")


def _get_recip_or_404(recip_id):
    recip = Recip.query.filter_by(id=recip_id).first()
    if not recip:
        return None, ({"error": "not_found", "message": "Recipient not found."}, 404)
    return recip, None


def _create_email_for_recip(recip, email_value, is_active, actor_id):
    email = RecipEmail(
        email=normalize_email(email_value),
        recip_id=recip.id,
        is_active=bool(is_active),
        created_by_user_id=actor_id,
        updated_by_user_id=actor_id,
    )
    email.create(commit=False)
    return email


def _create_number_for_recip(recip, phone_value, is_active, actor_id):
    number = RecipNumber(
        phone_number=normalize_ge_phone(phone_value),
        recip_id=recip.id,
        is_active=bool(is_active),
        created_by_user_id=actor_id,
        updated_by_user_id=actor_id,
    )
    number.create(commit=False)
    return number


@recips_ns.route("/")
class RecipsApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.response(200, "Success", recip_list_response_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List recipients (JWT or API key with can_recips / can_recips_read)."""
        denied = _require_recips_read()
        if denied:
            return denied

        items = Recip.query.order_by(Recip.id.asc()).all()
        payload = {"items": [item.to_dict() for item in items], "total": len(items)}
        return marshal(payload, recip_list_response_model), 200

    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_create_parser)
    @recips_ns.response(201, "Created", recip_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    def post(self):
        """Create a recipient (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        payload = recip_create_parser.parse_args()
        username = (payload.get("username") or "").strip()
        if not username:
            return {"error": "validation_error", "message": "username cannot be empty."}, 400

        recip = Recip(
            username=username,
            is_staff=bool(payload.get("is_staff", False)),
            is_active=bool(payload.get("is_active", True)),
            created_by_user_id=actor["user_id"],
            updated_by_user_id=actor["user_id"],
        )
        recip.create()

        logger.info("Recipient created: actor=%s recip_id=%s", actor["label"], recip.id)
        return marshal(
            {"message": "Recipient created successfully.", "recip": recip.to_dict()},
            recip_response_model,
        ), 201


@recips_ns.route("/<int:recip_id>")
class RecipDetailApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.response(200, "Success", recip_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def get(self, recip_id):
        """Get a recipient by id (JWT or API key with can_recips / can_recips_read)."""
        denied = _require_recips_read()
        if denied:
            return denied

        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error
        return marshal(recip.to_dict(), recip_model), 200

    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_update_parser)
    @recips_ns.response(200, "Success", recip_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def put(self, recip_id):
        """Update a recipient by id (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        payload = recip_update_parser.parse_args()

        if payload.get("username") is not None:
            username = (payload.get("username") or "").strip()
            if not username:
                return {"error": "validation_error", "message": "username cannot be empty."}, 400
            recip.username = username

        if payload.get("is_staff") is not None:
            recip.is_staff = bool(payload.get("is_staff"))

        if payload.get("is_active") is not None:
            recip.is_active = bool(payload.get("is_active"))

        recip.updated_by_user_id = actor["user_id"]
        recip.save()
        logger.info("Recipient updated: actor=%s recip_id=%s", actor["label"], recip.id)
        return marshal(
            {"message": "Recipient updated successfully.", "recip": recip.to_dict()},
            recip_response_model,
        ), 200

    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.response(200, "Success", message_response_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, recip_id):
        """Delete a recipient and its channels (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        recip_id_value = recip.id
        recip.delete()
        logger.info("Recipient deleted: actor=%s recip_id=%s", actor["label"], recip_id_value)
        return marshal({"message": "Recipient deleted successfully."}, message_response_model), 200


@recips_ns.route("/<int:recip_id>/emails")
class RecipEmailsApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_email_create_parser)
    @recips_ns.response(201, "Created", recip_email_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def post(self, recip_id):
        """Add an email to a recipient (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        payload = recip_email_create_parser.parse_args()
        try:
            email = _create_email_for_recip(
                recip=recip,
                email_value=payload.get("email"),
                is_active=payload.get("is_active", True),
                actor_id=actor["user_id"],
            )
            db.session.commit()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Email address is already registered."}, 409

        recip.updated_by_user_id = actor["user_id"]
        recip.save()
        logger.info(
            "Recipient email added: actor=%s recip_id=%s email_id=%s",
            actor["label"],
            recip.id,
            email.id,
        )
        return marshal(
            {"message": "Email added successfully.", "email": email.to_dict()},
            recip_email_response_model,
        ), 201


@recips_ns.route("/emails/<int:email_id>")
class RecipEmailDetailApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_email_update_parser)
    @recips_ns.response(200, "Success", recip_email_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def put(self, email_id):
        """Update a recipient email (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        email = RecipEmail.query.filter_by(id=email_id).first()
        if not email:
            return {"error": "not_found", "message": "Recipient email not found."}, 404

        payload = recip_email_update_parser.parse_args()
        try:
            if payload.get("email") is not None:
                email.email = normalize_email(payload.get("email"))
            if payload.get("is_active") is not None:
                email.is_active = bool(payload.get("is_active"))
            email.updated_by_user_id = actor["user_id"]
            email.save()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Email address is already registered."}, 409

        if email.recip:
            email.recip.updated_by_user_id = actor["user_id"]
            email.recip.save()

        logger.info("Recipient email updated: actor=%s email_id=%s", actor["label"], email.id)
        return marshal(
            {"message": "Email updated successfully.", "email": email.to_dict()},
            recip_email_response_model,
        ), 200

    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.response(200, "Success", message_response_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, email_id):
        """Delete a recipient email (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        email = RecipEmail.query.filter_by(id=email_id).first()
        if not email:
            return {"error": "not_found", "message": "Recipient email not found."}, 404

        recip = email.recip
        email_id_value = email.id
        email.delete()

        if recip:
            recip.updated_by_user_id = actor["user_id"]
            recip.save()

        logger.info("Recipient email deleted: actor=%s email_id=%s", actor["label"], email_id_value)
        return marshal({"message": "Email deleted successfully."}, message_response_model), 200


@recips_ns.route("/<int:recip_id>/numbers")
class RecipNumbersApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_number_create_parser)
    @recips_ns.response(201, "Created", recip_number_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def post(self, recip_id):
        """Add a phone number to a recipient (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        payload = recip_number_create_parser.parse_args()
        try:
            number = _create_number_for_recip(
                recip=recip,
                phone_value=payload.get("phone_number"),
                is_active=payload.get("is_active", True),
                actor_id=actor["user_id"],
            )
            db.session.commit()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Phone number is already registered."}, 409

        recip.updated_by_user_id = actor["user_id"]
        recip.save()
        logger.info(
            "Recipient number added: actor=%s recip_id=%s number_id=%s",
            actor["label"],
            recip.id,
            number.id,
        )
        return marshal(
            {"message": "Phone number added successfully.", "number": number.to_dict()},
            recip_number_response_model,
        ), 201


@recips_ns.route("/numbers/<int:number_id>")
class RecipNumberDetailApi(Resource):
    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.expect(recip_number_update_parser)
    @recips_ns.response(200, "Success", recip_number_response_model)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def put(self, number_id):
        """Update a recipient phone number (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        number = RecipNumber.query.filter_by(id=number_id).first()
        if not number:
            return {"error": "not_found", "message": "Recipient phone number not found."}, 404

        payload = recip_number_update_parser.parse_args()
        try:
            if payload.get("phone_number") is not None:
                number.phone_number = normalize_ge_phone(payload.get("phone_number"))
            if payload.get("is_active") is not None:
                number.is_active = bool(payload.get("is_active"))
            number.updated_by_user_id = actor["user_id"]
            number.save()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Phone number is already registered."}, 409

        if number.recip:
            number.recip.updated_by_user_id = actor["user_id"]
            number.recip.save()

        logger.info("Recipient number updated: actor=%s number_id=%s", actor["label"], number.id)
        return marshal(
            {"message": "Phone number updated successfully.", "number": number.to_dict()},
            recip_number_response_model,
        ), 200

    @recips_ns.doc(security=JWT_OR_API_KEY)
    @recips_ns.response(200, "Success", message_response_model)
    @recips_ns.response(401, "Unauthorized", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, number_id):
        """Delete a recipient phone number (JWT or API key with can_recips)."""
        denied = _require_can_recips()
        if denied:
            return denied

        actor = resolve_actor()
        number = RecipNumber.query.filter_by(id=number_id).first()
        if not number:
            return {"error": "not_found", "message": "Recipient phone number not found."}, 404

        recip = number.recip
        number_id_value = number.id
        number.delete()

        if recip:
            recip.updated_by_user_id = actor["user_id"]
            recip.save()

        logger.info(
            "Recipient number deleted: actor=%s number_id=%s",
            actor["label"],
            number_id_value,
        )
        return marshal({"message": "Phone number deleted successfully."}, message_response_model), 200
