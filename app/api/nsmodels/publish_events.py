from flask_restx import fields, reqparse

from app.extensions import api
from app.api.nsmodels.seismic_events import seismic_event_model, seismic_event_public_model

publish_events_ns = api.namespace(
    "Publish Events",
    description="Publish and unpublish seismic events to WordPress",
    path="/api",
)

JWT_OR_API_KEY = ["JsonWebToken", "ApiKeyAuth"]

error_model = publish_events_ns.model(
    "PublishEventsErrorResponse",
    {
        "error": fields.String(required=True, example="forbidden"),
        "message": fields.String(
            required=True,
            example="Missing required permission: can_event_publish",
        ),
    },
)

published_event_item_model = publish_events_ns.model(
    "PublishedEventItem",
    {
        "id": fields.Integer(required=True, example=1),
        "event_id": fields.Integer(required=True, example=1),
        "published_at": fields.String(required=False, example="2026-08-05T12:35:00"),
        "event": fields.Nested(seismic_event_public_model, required=True),
    },
)

published_events_list_response_model = publish_events_ns.model(
    "PublishedEventsListResponse",
    {
        "items": fields.List(fields.Nested(published_event_item_model), required=True),
        "total": fields.Integer(required=True, example=1),
        "limit": fields.Integer(required=False, example=100),
    },
)

published_events_get_parser = reqparse.RequestParser()
published_events_get_parser.add_argument(
    "limit",
    type=int,
    required=False,
    location="args",
    help="Page size (default 100, max 200)",
)

publish_event_response_model = publish_events_ns.model(
    "PublishEventResponse",
    {
        "message": fields.String(required=True, example="Publish request completed."),
        "event_id": fields.Integer(required=True, example=1),
        "wp_response": fields.String(required=False, example="1"),
        "published": fields.Boolean(required=True, example=True),
        "event": fields.Nested(seismic_event_model, required=True),
    },
)
