import logging
from datetime import datetime, timezone

from flask import current_app
from flask_restx import Resource, marshal

from app.api.nsmodels.publish_events import (
    publish_events_ns,
    JWT_OR_API_KEY,
    publish_event_response_model,
    error_model,
)
from app.models import SeismicEvent, PublishedEvent
from app.utils.auth_utils import require_permissions
from app.utils.wp_publish_client import publish_eq, unpublish_eq

logger = logging.getLogger("app.publish_events")


def _require_can_event_publish():
    return require_permissions("can_event_publish")


def _get_event_or_404(event_id):
    event = SeismicEvent.query.filter_by(id=event_id).first()
    if not event:
        return None, ({"error": "not_found", "message": "Seismic event not found."}, 404)
    return event, None


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


@publish_events_ns.route("/<int:event_id>/publish")
@publish_events_ns.param("event_id", "Seismic event id")
class PublishEventApi(Resource):
    @publish_events_ns.doc(security=JWT_OR_API_KEY)
    @publish_events_ns.response(200, "Success", publish_event_response_model)
    @publish_events_ns.response(400, "Validation Error", error_model)
    @publish_events_ns.response(401, "Unauthorized", error_model)
    @publish_events_ns.response(403, "Forbidden", error_model)
    @publish_events_ns.response(404, "Not Found", error_model)
    @publish_events_ns.response(500, "Configuration Error", error_model)
    @publish_events_ns.response(502, "Bad Gateway", error_model)
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


@publish_events_ns.route("/<int:event_id>/unpublish")
@publish_events_ns.param("event_id", "Seismic event id")
class UnpublishEventApi(Resource):
    @publish_events_ns.doc(security=JWT_OR_API_KEY)
    @publish_events_ns.response(200, "Success", publish_event_response_model)
    @publish_events_ns.response(401, "Unauthorized", error_model)
    @publish_events_ns.response(403, "Forbidden", error_model)
    @publish_events_ns.response(404, "Not Found", error_model)
    @publish_events_ns.response(500, "Configuration Error", error_model)
    @publish_events_ns.response(502, "Bad Gateway", error_model)
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
