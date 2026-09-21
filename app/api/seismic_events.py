import logging
from datetime import datetime, timezone

from flask import current_app
from flask_restx import Resource, marshal
from sqlalchemy import String, and_, cast, exists, or_
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.api.nsmodels.seismic_events import (
    seismic_events_ns,
    JWT_OR_API_KEY,
    seismic_event_model,
    seismic_event_list_response_model,
    seismic_event_response_model,
    event_magnitude_model,
    event_magnitude_response_model,
    event_beachball_model,
    event_beachball_response_model,
    magnitude_catalog_list_response_model,
    message_response_model,
    error_model,
    seismic_event_create_parser,
    seismic_event_update_parser,
    seismic_event_filter_parser,
    event_magnitude_create_parser,
    event_magnitude_update_parser,
    event_beachball_parser,
    publish_event_response_model,
)
from app.models import SeismicEvent, Magnitude, EventMagnitude, EventBeachball, PublishedEvent
from app.utils.auth_utils import require_permissions
from app.utils.gen_beachball_img import delete_beachball_image, sync_beachball_image
from app.utils.wp_publish_client import publish_eq, unpublish_eq

logger = logging.getLogger("app.seismic_events")


def _require_can_event_view():
    return require_permissions("can_event_edit", "can_event_view")


def _require_can_event_edit():
    return require_permissions("can_event_edit")


def _require_can_event_publish():
    return require_permissions("can_event_publish")


def _pick_publish_magnitude(event):
    """Prefer ML; otherwise first attached magnitude. Returns (value, code) or None."""
    first = None
    for item in event.event_magnitudes:
        code = (item.magnitude.code if item.magnitude else None) or ""
        if first is None:
            first = item
        if code.upper() == "ML":
            return item.value, code
    if first is None:
        return None
    code = (first.magnitude.code if first.magnitude else None) or "M"
    return first.value, code


def _beachball_mechanism(event):
    beachball = event.beachball
    if not beachball:
        return None, None, None
    if (
        beachball.strike is None
        or beachball.dip is None
        or beachball.rake is None
    ):
        return None, None, None
    return beachball.strike, beachball.dip, beachball.rake


def _wp_publish_code_or_error():
    publish_code = (current_app.config.get("WP_PUBLISH_CODE") or "").strip()
    if not publish_code:
        return None, (
            {
                "error": "configuration_error",
                "message": "WP_PUBLISH_CODE is not configured.",
            },
            500,
        )
    return publish_code, None


def _apply_generated_beachball_path(beachball):
    """Generate PNG when strike/dip/rake are complete; store web path on the model."""
    web_path = sync_beachball_image(
        beachball.event_id,
        beachball.strike,
        beachball.dip,
        beachball.rake,
    )
    if web_path is not None:
        beachball.beachball_path = web_path
    return web_path


def _validate_beachball_mechanism_payload(payload):
    """
    Require all of strike, dip, rake together, or none of them.

    Returns None if valid, or (error_body, status_code).
    """
    provided = [
        name
        for name in ("strike", "dip", "rake")
        if payload.get(name) is not None
    ]
    if len(provided) in (0, 3):
        return None
    return {
        "error": "validation_error",
        "message": (
            "strike, dip, and rake must all be provided together "
            "(or omit all three)."
        ),
        "provided": provided,
    }, 400


def _get_event_or_404(event_id):
    event = SeismicEvent.query.filter_by(id=event_id).first()
    if not event:
        return None, ({"error": "not_found", "message": "Seismic event not found."}, 404)
    return event, None


def _optional_str(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolve_magnitude(magnitude_id=None, magnitude_code=None):
    if magnitude_id is not None:
        magnitude = Magnitude.query.filter_by(id=magnitude_id).first()
        if not magnitude:
            return None, ({"error": "not_found", "message": "Magnitude catalog entry not found."}, 404)
        return magnitude, None

    if magnitude_code is not None:
        code = str(magnitude_code).strip().upper()
        if not code:
            return None, (
                {"error": "validation_error", "message": "magnitude_code cannot be empty."},
                400,
            )
        magnitude = Magnitude.query.filter_by(code=code).first()
        if not magnitude:
            return None, (
                {
                    "error": "not_found",
                    "message": f"Magnitude catalog entry not found for code: {code}",
                },
                404,
            )
        return magnitude, None

    return None, (
        {
            "error": "validation_error",
            "message": "Provide magnitude_id or magnitude_code.",
        },
        400,
    )


def _apply_event_fields(event, payload, *, creating=False):
    if creating or payload.get("origin_time") is not None:
        if payload.get("origin_time") is None:
            return {"error": "validation_error", "message": "origin_time is required."}, 400
        event.origin_time = payload.get("origin_time")

    if creating or payload.get("latitude") is not None:
        if payload.get("latitude") is None:
            return {"error": "validation_error", "message": "latitude is required."}, 400
        event.latitude = float(payload.get("latitude"))

    if creating or payload.get("longitude") is not None:
        if payload.get("longitude") is None:
            return {"error": "validation_error", "message": "longitude is required."}, 400
        event.longitude = float(payload.get("longitude"))

    if "depth" in payload and payload.get("depth") is not None:
        event.depth = float(payload.get("depth"))
    elif creating:
        event.depth = None

    for field in ("iesdata_id", "seiscomp_oid", "location_ge", "location_en", "area"):
        if creating or field in payload:
            if payload.get(field) is not None:
                event.__setattr__(field, _optional_str(payload.get(field)))
            elif creating:
                event.__setattr__(field, None)

    if creating:
        event.is_automatic = bool(payload.get("is_automatic", False))
    elif "is_automatic" in payload and payload.get("is_automatic") is not None:
        event.is_automatic = bool(payload.get("is_automatic"))

    return None


def _normalize_magnitude_criteria(payload):
    """Build magnitude filter criteria from `magnitudes` list or legacy single fields."""
    raw_list = payload.get("magnitudes")
    if isinstance(raw_list, list) and raw_list:
        criteria = []
        for item in raw_list:
            if not isinstance(item, dict):
                return None, (
                    {
                        "error": "validation_error",
                        "message": "Each magnitudes entry must be an object.",
                    },
                    400,
                )
            criteria.append(
                {
                    "code": _optional_str(
                        item.get("magnitude") or item.get("magnitude_code") or item.get("code")
                    ),
                    "min": item.get("magnitude_min", item.get("min")),
                    "max": item.get("magnitude_max", item.get("max")),
                }
            )
        return criteria, None

    code = _optional_str(payload.get("magnitude"))
    magnitude_min = payload.get("magnitude_min")
    magnitude_max = payload.get("magnitude_max")
    if code is None and magnitude_min is None and magnitude_max is None:
        return [], None
    return [{"code": code, "min": magnitude_min, "max": magnitude_max}], None


def _apply_magnitude_criteria(query, criteria):
    """AND together magnitude constraints using EXISTS subqueries."""
    for criterion in criteria:
        code = criterion.get("code")
        magnitude_min = criterion.get("min")
        magnitude_max = criterion.get("max")

        if (
            magnitude_min is not None
            and magnitude_max is not None
            and magnitude_min > magnitude_max
        ):
            return None, (
                {
                    "error": "validation_error",
                    "message": "magnitude_min cannot be greater than magnitude_max.",
                },
                400,
            )

        conditions = [EventMagnitude.event_id == SeismicEvent.id]
        if code is not None:
            magnitude = Magnitude.query.filter_by(code=code.upper()).first()
            if not magnitude:
                return None, (
                    {
                        "error": "not_found",
                        "message": f"Magnitude catalog entry not found for code: {code.upper()}",
                    },
                    404,
                )
            conditions.append(EventMagnitude.magnitude_id == magnitude.id)
        if magnitude_min is not None:
            conditions.append(EventMagnitude.value >= magnitude_min)
        if magnitude_max is not None:
            conditions.append(EventMagnitude.value <= magnitude_max)

        query = query.filter(exists().where(and_(*conditions)))

    return query, None


def _build_filtered_events_query(payload):
    """Build a SeismicEvent query from optional filter args. Returns (query, error_tuple)."""
    event_id = payload.get("event_id")
    event_query = _optional_str(payload.get("event_query"))
    iesdata_id = _optional_str(payload.get("iesdata_id"))
    seiscomp_oid = _optional_str(payload.get("seiscomp_oid"))
    location = _optional_str(payload.get("location"))
    area = _optional_str(payload.get("area"))
    depth_min = payload.get("depth_min")
    depth_max = payload.get("depth_max")
    date_from = payload.get("date_from")
    date_to = payload.get("date_to")

    magnitude_criteria, magnitude_error = _normalize_magnitude_criteria(payload)
    if magnitude_error:
        return None, magnitude_error

    if depth_min is not None and depth_max is not None and depth_min > depth_max:
        return None, (
            {
                "error": "validation_error",
                "message": "depth_min cannot be greater than depth_max.",
            },
            400,
        )
    if date_from is not None and date_to is not None and date_from > date_to:
        return None, (
            {
                "error": "validation_error",
                "message": "date_from cannot be after date_to.",
            },
            400,
        )

    query = SeismicEvent.query

    if event_id is not None:
        query = query.filter(SeismicEvent.id == event_id)

    if event_query is not None:
        pattern = f"%{event_query}%"
        query = query.filter(
            or_(
                cast(SeismicEvent.id, String).ilike(pattern),
                SeismicEvent.iesdata_id.ilike(pattern),
            )
        )

    if iesdata_id is not None:
        query = query.filter(SeismicEvent.iesdata_id.ilike(f"%{iesdata_id}%"))

    if seiscomp_oid is not None:
        query = query.filter(SeismicEvent.seiscomp_oid.ilike(f"%{seiscomp_oid}%"))

    if location is not None:
        pattern = f"%{location}%"
        query = query.filter(
            or_(
                SeismicEvent.location_en.ilike(pattern),
                SeismicEvent.location_ge.ilike(pattern),
            )
        )

    if area is not None:
        query = query.filter(SeismicEvent.area.ilike(f"%{area}%"))

    if depth_min is not None:
        query = query.filter(SeismicEvent.depth >= depth_min)
    if depth_max is not None:
        query = query.filter(SeismicEvent.depth <= depth_max)

    if date_from is not None:
        query = query.filter(SeismicEvent.origin_time >= date_from)
    if date_to is not None:
        query = query.filter(SeismicEvent.origin_time <= date_to)

    if magnitude_criteria:
        query, magnitude_apply_error = _apply_magnitude_criteria(query, magnitude_criteria)
        if magnitude_apply_error:
            return None, magnitude_apply_error

    return query.order_by(SeismicEvent.origin_time.desc()), None


@seismic_events_ns.route("/filter")
class SeismicEventsFilterApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(seismic_event_filter_parser)
    @seismic_events_ns.response(200, "Success", seismic_event_list_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def post(self):
        """Filter seismic events (requires can_event_view or can_event_edit). All body fields are optional."""
        denied = _require_can_event_view()
        if denied:
            return denied

        payload = seismic_event_filter_parser.parse_args()
        query, error = _build_filtered_events_query(payload)
        if error:
            return error

        items = query.all()
        response = {"items": [item.to_dict() for item in items], "total": len(items)}
        return marshal(response, seismic_event_list_response_model), 200


@seismic_events_ns.route("/magnitude_types")
class MagnitudeCatalogApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", magnitude_catalog_list_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List magnitude catalog types (requires can_event_view or can_event_edit)."""
        denied = _require_can_event_view()
        if denied:
            return denied

        items = Magnitude.query.order_by(Magnitude.code.asc()).all()
        payload = {"items": [item.to_dict() for item in items], "total": len(items)}
        return marshal(payload, magnitude_catalog_list_response_model), 200


@seismic_events_ns.route("/")
class SeismicEventsApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", seismic_event_list_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    def get(self):
        """List seismic events (requires can_event_view or can_event_edit)."""
        denied = _require_can_event_view()
        if denied:
            return denied

        items = SeismicEvent.query.order_by(SeismicEvent.origin_time.desc()).all()
        payload = {"items": [item.to_dict() for item in items], "total": len(items)}
        return marshal(payload, seismic_event_list_response_model), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(seismic_event_create_parser)
    @seismic_events_ns.response(201, "Created", seismic_event_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(409, "Conflict", error_model)
    def post(self):
        """Create a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        payload = seismic_event_create_parser.parse_args()
        event = SeismicEvent()
        error = _apply_event_fields(event, payload, creating=True)
        if error:
            return error

        try:
            event.create()
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "iesdata_id or seiscomp_oid is already registered.",
            }, 409
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400

        logger.info("Seismic event created: event_id=%s", event.id)
        return marshal(
            {"message": "Seismic event created successfully.", "event": event.to_dict()},
            seismic_event_response_model,
        ), 201


@seismic_events_ns.route("/<int:event_id>")
class SeismicEventDetailApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", seismic_event_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def get(self, event_id):
        """Get a seismic event by id (requires can_event_view or can_event_edit)."""
        denied = _require_can_event_view()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error
        return marshal(event.to_dict(), seismic_event_model), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(seismic_event_update_parser)
    @seismic_events_ns.response(200, "Success", seismic_event_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(409, "Conflict", error_model)
    def put(self, event_id):
        """Update a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error

        payload = seismic_event_update_parser.parse_args()
        # RequestParser always returns declared keys; treat only provided non-None as updates
        # except empty strings for optional text fields which clear via _optional_str when key present.
        update_payload = {}
        for key, value in payload.items():
            if value is not None:
                update_payload[key] = value

        apply_error = _apply_event_fields(event, update_payload, creating=False)
        if apply_error:
            return apply_error

        try:
            event.save()
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "iesdata_id or seiscomp_oid is already registered.",
            }, 409
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400

        logger.info("Seismic event updated: event_id=%s", event.id)
        return marshal(
            {"message": "Seismic event updated successfully.", "event": event.to_dict()},
            seismic_event_response_model,
        ), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", message_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def delete(self, event_id):
        """Delete a seismic event and related magnitudes/beachball (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error

        event_id_value = event.id
        delete_beachball_image(event_id_value)
        event.delete()
        logger.info("Seismic event deleted: event_id=%s", event_id_value)
        return marshal({"message": "Seismic event deleted successfully."}, message_response_model), 200


@seismic_events_ns.route("/<int:event_id>/magnitudes")
class EventMagnitudesApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(event_magnitude_create_parser)
    @seismic_events_ns.response(201, "Created", event_magnitude_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(409, "Conflict", error_model)
    def post(self, event_id):
        """Add a magnitude to a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error

        payload = event_magnitude_create_parser.parse_args()
        magnitude, mag_error = _resolve_magnitude(
            magnitude_id=payload.get("magnitude_id"),
            magnitude_code=payload.get("magnitude_code"),
        )
        if mag_error:
            return mag_error

        value = payload.get("value")
        if value is None:
            return {"error": "validation_error", "message": "value is required."}, 400

        item = EventMagnitude(
            event_id=event.id,
            magnitude_id=magnitude.id,
            value=float(value),
        )
        try:
            item.create()
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "This magnitude type is already assigned to the event.",
            }, 409

        logger.info(
            "Event magnitude added: event_id=%s event_magnitude_id=%s",
            event.id,
            item.id,
        )
        return marshal(
            {
                "message": "Event magnitude added successfully.",
                "event_magnitude": item.to_dict(),
            },
            event_magnitude_response_model,
        ), 201


@seismic_events_ns.route("/magnitudes/<int:event_magnitude_id>")
class EventMagnitudeDetailApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(event_magnitude_update_parser)
    @seismic_events_ns.response(200, "Success", event_magnitude_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(409, "Conflict", error_model)
    def put(self, event_magnitude_id):
        """Update an event magnitude (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        item = EventMagnitude.query.filter_by(id=event_magnitude_id).first()
        if not item:
            return {"error": "not_found", "message": "Event magnitude not found."}, 404

        payload = event_magnitude_update_parser.parse_args()
        if payload.get("value") is not None:
            item.value = float(payload.get("value"))

        if payload.get("magnitude_id") is not None or payload.get("magnitude_code") is not None:
            magnitude, mag_error = _resolve_magnitude(
                magnitude_id=payload.get("magnitude_id"),
                magnitude_code=payload.get("magnitude_code"),
            )
            if mag_error:
                return mag_error
            item.magnitude_id = magnitude.id

        try:
            item.save()
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "This magnitude type is already assigned to the event.",
            }, 409

        logger.info("Event magnitude updated: event_magnitude_id=%s", item.id)
        return marshal(
            {
                "message": "Event magnitude updated successfully.",
                "event_magnitude": item.to_dict(),
            },
            event_magnitude_response_model,
        ), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", message_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def delete(self, event_magnitude_id):
        """Delete an event magnitude (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        item = EventMagnitude.query.filter_by(id=event_magnitude_id).first()
        if not item:
            return {"error": "not_found", "message": "Event magnitude not found."}, 404

        item_id = item.id
        item.delete()
        logger.info("Event magnitude deleted: event_magnitude_id=%s", item_id)
        return marshal(
            {"message": "Event magnitude deleted successfully."},
            message_response_model,
        ), 200


@seismic_events_ns.route("/<int:event_id>/beachball")
class EventBeachballApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", event_beachball_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def get(self, event_id):
        """Get beachball for a seismic event (requires can_event_view or can_event_edit)."""
        denied = _require_can_event_view()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error
        if not event.beachball:
            return {"error": "not_found", "message": "Beachball not found for this event."}, 404
        return marshal(event.beachball.to_dict(), event_beachball_model), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(event_beachball_parser)
    @seismic_events_ns.response(201, "Created", event_beachball_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(409, "Conflict", error_model)
    def post(self, event_id):
        """Create beachball for a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error
        if event.beachball:
            return {
                "error": "conflict",
                "message": "Beachball already exists for this event. Use PUT to update.",
            }, 409

        payload = event_beachball_parser.parse_args()
        mechanism_error = _validate_beachball_mechanism_payload(payload)
        if mechanism_error:
            return mechanism_error

        beachball = EventBeachball(
            event_id=event.id,
            rake=payload.get("rake"),
            dip=payload.get("dip"),
            strike=payload.get("strike"),
            beachball_path=None,
        )
        try:
            _apply_generated_beachball_path(beachball)
            beachball.create()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except IntegrityError:
            db.session.rollback()
            return {
                "error": "conflict",
                "message": "Beachball already exists for this event. Use PUT to update.",
            }, 409
        except Exception as err:
            db.session.rollback()
            logger.exception("Beachball image generation failed: event_id=%s", event.id)
            return {
                "error": "generation_error",
                "message": f"Beachball image generation failed: {err}",
            }, 500

        logger.info("Beachball created: event_id=%s beachball_id=%s", event.id, beachball.id)
        return marshal(
            {"message": "Beachball created successfully.", "beachball": beachball.to_dict()},
            event_beachball_response_model,
        ), 201

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.expect(event_beachball_parser)
    @seismic_events_ns.response(200, "Success", event_beachball_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def put(self, event_id):
        """Update beachball for a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error
        if not event.beachball:
            return {"error": "not_found", "message": "Beachball not found for this event."}, 404

        payload = event_beachball_parser.parse_args()
        mechanism_error = _validate_beachball_mechanism_payload(payload)
        if mechanism_error:
            return mechanism_error

        beachball = event.beachball
        if payload.get("rake") is not None:
            beachball.rake = payload.get("rake")
        if payload.get("dip") is not None:
            beachball.dip = payload.get("dip")
        if payload.get("strike") is not None:
            beachball.strike = payload.get("strike")
        # beachball_path is server-generated; ignore any client-supplied path.

        try:
            _apply_generated_beachball_path(beachball)
            beachball.save()
        except ValueError as err:
            db.session.rollback()
            return {"error": "validation_error", "message": str(err)}, 400
        except Exception as err:
            db.session.rollback()
            logger.exception("Beachball image generation failed: event_id=%s", event.id)
            return {
                "error": "generation_error",
                "message": f"Beachball angles updated but image generation failed: {err}",
            }, 500

        logger.info("Beachball updated: event_id=%s beachball_id=%s", event.id, beachball.id)
        return marshal(
            {"message": "Beachball updated successfully.", "beachball": beachball.to_dict()},
            event_beachball_response_model,
        ), 200

    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", message_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    def delete(self, event_id):
        """Delete beachball for a seismic event (requires can_event_edit)."""
        denied = _require_can_event_edit()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error
        if not event.beachball:
            return {"error": "not_found", "message": "Beachball not found for this event."}, 404

        beachball_id = event.beachball.id
        delete_beachball_image(event.id)
        event.beachball.delete()
        logger.info("Beachball deleted: event_id=%s beachball_id=%s", event.id, beachball_id)
        return marshal({"message": "Beachball deleted successfully."}, message_response_model), 200


@seismic_events_ns.route("/<int:event_id>/publish")
@seismic_events_ns.param("event_id", "Seismic event id")
class SeismicEventPublishApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", publish_event_response_model)
    @seismic_events_ns.response(400, "Validation Error", error_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(500, "Configuration Error", error_model)
    @seismic_events_ns.response(502, "Bad Gateway", error_model)
    def post(self, event_id):
        """Publish (or update) a seismic event on WordPress (requires can_event_publish)."""
        denied = _require_can_event_publish()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error

        publish_code, config_error = _wp_publish_code_or_error()
        if config_error:
            return config_error

        mag_info = _pick_publish_magnitude(event)
        if mag_info is None:
            return {
                "error": "validation_error",
                "message": "Event must have at least one magnitude before publishing.",
            }, 400

        mag_value, mag_type = mag_info
        strike, dip, rake = _beachball_mechanism(event)
        location_ge = event.location_ge or ""
        location_en = event.location_en or ""

        try:
            wp_response = publish_eq(
                eq_id=event.id,
                code=publish_code,
                uccur_time=event.origin_time.strftime("%Y-%m-%d %H:%M:%S"),
                latitude=event.latitude,
                longitude=event.longitude,
                mag=mag_value,
                mag_type=mag_type,
                eq_type="A" if event.is_automatic else "M",
                depth=event.depth,
                description_ge=location_ge,
                description_en=location_en,
                region_ge=location_ge,
                region_en=location_en,
                strike=strike,
                dip=dip,
                rake=rake,
                important=0,
            )
        except Exception as exc:
            logger.exception("Publish event failed: event_id=%s", event.id)
            return {
                "error": "upstream_error",
                "message": f"Publish request failed: {exc}",
            }, 502

        published_row = event.published_event
        now = datetime.now(timezone.utc)
        if not published_row:
            published_row = PublishedEvent(
                event_id=event.id,
                wp_response=wp_response,
                published_at=now,
            )
            published_row.create(commit=False)
        else:
            published_row.wp_response = wp_response
            published_row.published_at = now
        published_row.save()

        logger.info(
            "Publish event completed: event_id=%s wp_response=%s",
            event.id,
            wp_response,
        )
        return marshal(
            {
                "message": "Publish request completed.",
                "event_id": event.id,
                "wp_response": wp_response,
                "published": True,
                "event": event.to_dict(),
            },
            publish_event_response_model,
        ), 200


@seismic_events_ns.route("/<int:event_id>/unpublish")
@seismic_events_ns.param("event_id", "Seismic event id")
class SeismicEventUnpublishApi(Resource):
    @seismic_events_ns.doc(security=JWT_OR_API_KEY)
    @seismic_events_ns.response(200, "Success", publish_event_response_model)
    @seismic_events_ns.response(401, "Unauthorized", error_model)
    @seismic_events_ns.response(403, "Forbidden", error_model)
    @seismic_events_ns.response(404, "Not Found", error_model)
    @seismic_events_ns.response(500, "Configuration Error", error_model)
    @seismic_events_ns.response(502, "Bad Gateway", error_model)
    def post(self, event_id):
        """Unpublish a seismic event from WordPress (requires can_event_publish)."""
        denied = _require_can_event_publish()
        if denied:
            return denied

        event, error = _get_event_or_404(event_id)
        if error:
            return error

        publish_code, config_error = _wp_publish_code_or_error()
        if config_error:
            return config_error

        try:
            wp_response = unpublish_eq(eq_id=event.id, code=publish_code)
        except Exception as exc:
            logger.exception("Unpublish event failed: event_id=%s", event.id)
            return {
                "error": "upstream_error",
                "message": f"Unpublish request failed: {exc}",
            }, 502

        if event.published_event:
            event.published_event.delete()

        logger.info(
            "Unpublish event completed: event_id=%s wp_response=%s",
            event.id,
            wp_response,
        )
        return marshal(
            {
                "message": "Unpublish request completed.",
                "event_id": event.id,
                "wp_response": wp_response,
                "published": False,
                "event": event.to_dict(),
            },
            publish_event_response_model,
        ), 200
