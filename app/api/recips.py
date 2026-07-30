import logging

from flask_jwt_extended import current_user, jwt_required
from flask_restx import Resource
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
from app.utils.validators import normalize_email, normalize_ge_phone

logger = logging.getLogger("app.recips")


def _permission_denied():
    return {"error": "forbidden", "message": "Missing required permission: can_recip"}, 403


def _require_can_recip():
    if not current_user.check_permission("can_recip"):
        return _permission_denied()
    return None


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
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.marshal_with(recip_list_response_model, code=200)
    @recips_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List all recipients (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        items = Recip.query.order_by(Recip.id.asc()).all()
        return {"items": [item.to_dict() for item in items], "total": len(items)}, 200

    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_create_parser)
    @recips_ns.marshal_with(recip_response_model, code=201)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    def post(self):
        """Create a recipient (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        payload = recip_create_parser.parse_args()
        username = (payload.get("username") or "").strip()
        if not username:
            return {"error": "validation_error", "message": "username cannot be empty."}, 400

        recip = Recip(
            username=username,
            is_staff=bool(payload.get("is_staff", False)),
            is_active=bool(payload.get("is_active", True)),
            created_by_user_id=current_user.id,
            updated_by_user_id=current_user.id,
        )
        recip.create()

        logger.info("Recipient created: actor_uuid=%s recip_id=%s", current_user.uuid, recip.id)
        return {"message": "Recipient created successfully.", "recip": recip.to_dict()}, 201


@recips_ns.route("/<int:recip_id>")
class RecipDetailApi(Resource):
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.marshal_with(recip_model, code=200)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def get(self, recip_id):
        """Get a recipient by id (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error
        return recip.to_dict(), 200

    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_update_parser)
    @recips_ns.marshal_with(recip_response_model, code=200)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def put(self, recip_id):
        """Update a recipient by id (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

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

        recip.updated_by_user_id = current_user.id
        recip.save()
        logger.info("Recipient updated: actor_uuid=%s recip_id=%s", current_user.uuid, recip.id)
        return {"message": "Recipient updated successfully.", "recip": recip.to_dict()}, 200

    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.marshal_with(message_response_model, code=200)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, recip_id):
        """Delete a recipient and its channels (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        recip_id_value = recip.id
        recip.delete()
        logger.info("Recipient deleted: actor_uuid=%s recip_id=%s", current_user.uuid, recip_id_value)
        return {"message": "Recipient deleted successfully."}, 200


@recips_ns.route("/<int:recip_id>/emails")
class RecipEmailsApi(Resource):
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_email_create_parser)
    @recips_ns.marshal_with(recip_email_response_model, code=201)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def post(self, recip_id):
        """Add an email to a recipient (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        payload = recip_email_create_parser.parse_args()
        try:
            email = _create_email_for_recip(
                recip=recip,
                email_value=payload.get("email"),
                is_active=payload.get("is_active", True),
                actor_id=current_user.id,
            )
            db.session.commit()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Email address is already registered."}, 409

        recip.updated_by_user_id = current_user.id
        recip.save()
        logger.info(
            "Recipient email added: actor_uuid=%s recip_id=%s email_id=%s",
            current_user.uuid,
            recip.id,
            email.id,
        )
        return {"message": "Email added successfully.", "email": email.to_dict()}, 201


@recips_ns.route("/emails/<int:email_id>")
class RecipEmailDetailApi(Resource):
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_email_update_parser)
    @recips_ns.marshal_with(recip_email_response_model, code=200)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def put(self, email_id):
        """Update a recipient email (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        email = RecipEmail.query.filter_by(id=email_id).first()
        if not email:
            return {"error": "not_found", "message": "Recipient email not found."}, 404

        payload = recip_email_update_parser.parse_args()
        try:
            if payload.get("email") is not None:
                email.email = normalize_email(payload.get("email"))
            if payload.get("is_active") is not None:
                email.is_active = bool(payload.get("is_active"))
            email.updated_by_user_id = current_user.id
            email.save()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Email address is already registered."}, 409

        if email.recip:
            email.recip.updated_by_user_id = current_user.id
            email.recip.save()

        logger.info(
            "Recipient email updated: actor_uuid=%s email_id=%s",
            current_user.uuid,
            email.id,
        )
        return {"message": "Email updated successfully.", "email": email.to_dict()}, 200

    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.marshal_with(message_response_model, code=200)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, email_id):
        """Delete a recipient email (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        email = RecipEmail.query.filter_by(id=email_id).first()
        if not email:
            return {"error": "not_found", "message": "Recipient email not found."}, 404

        recip = email.recip
        email_id_value = email.id
        email.delete()

        if recip:
            recip.updated_by_user_id = current_user.id
            recip.save()

        logger.info(
            "Recipient email deleted: actor_uuid=%s email_id=%s",
            current_user.uuid,
            email_id_value,
        )
        return {"message": "Email deleted successfully."}, 200


@recips_ns.route("/<int:recip_id>/numbers")
class RecipNumbersApi(Resource):
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_number_create_parser)
    @recips_ns.marshal_with(recip_number_response_model, code=201)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def post(self, recip_id):
        """Add a phone number to a recipient (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        recip, error = _get_recip_or_404(recip_id)
        if error:
            return error

        payload = recip_number_create_parser.parse_args()
        try:
            number = _create_number_for_recip(
                recip=recip,
                phone_value=payload.get("phone_number"),
                is_active=payload.get("is_active", True),
                actor_id=current_user.id,
            )
            db.session.commit()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Phone number is already registered."}, 409

        recip.updated_by_user_id = current_user.id
        recip.save()
        logger.info(
            "Recipient number added: actor_uuid=%s recip_id=%s number_id=%s",
            current_user.uuid,
            recip.id,
            number.id,
        )
        return {"message": "Phone number added successfully.", "number": number.to_dict()}, 201


@recips_ns.route("/numbers/<int:number_id>")
class RecipNumberDetailApi(Resource):
    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.expect(recip_number_update_parser)
    @recips_ns.marshal_with(recip_number_response_model, code=200)
    @recips_ns.response(400, "Validation Error", error_model)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    @recips_ns.response(409, "Conflict", error_model)
    def put(self, number_id):
        """Update a recipient phone number (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        number = RecipNumber.query.filter_by(id=number_id).first()
        if not number:
            return {"error": "not_found", "message": "Recipient phone number not found."}, 404

        payload = recip_number_update_parser.parse_args()
        try:
            if payload.get("phone_number") is not None:
                number.phone_number = normalize_ge_phone(payload.get("phone_number"))
            if payload.get("is_active") is not None:
                number.is_active = bool(payload.get("is_active"))
            number.updated_by_user_id = current_user.id
            number.save()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {"error": "conflict", "message": "Phone number is already registered."}, 409

        if number.recip:
            number.recip.updated_by_user_id = current_user.id
            number.recip.save()

        logger.info(
            "Recipient number updated: actor_uuid=%s number_id=%s",
            current_user.uuid,
            number.id,
        )
        return {"message": "Phone number updated successfully.", "number": number.to_dict()}, 200

    @jwt_required()
    @recips_ns.doc(security="JsonWebToken")
    @recips_ns.marshal_with(message_response_model, code=200)
    @recips_ns.response(403, "Forbidden", error_model)
    @recips_ns.response(404, "Not Found", error_model)
    def delete(self, number_id):
        """Delete a recipient phone number (requires can_recip)."""
        denied = _require_can_recip()
        if denied:
            return denied

        number = RecipNumber.query.filter_by(id=number_id).first()
        if not number:
            return {"error": "not_found", "message": "Recipient phone number not found."}, 404

        recip = number.recip
        number_id_value = number.id
        number.delete()

        if recip:
            recip.updated_by_user_id = current_user.id
            recip.save()

        logger.info(
            "Recipient number deleted: actor_uuid=%s number_id=%s",
            current_user.uuid,
            number_id_value,
        )
        return {"message": "Phone number deleted successfully."}, 200
