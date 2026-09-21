from flask_restx import fields

from app.extensions import api
from app.api.nsmodels.seismic_events import seismic_event_model

publish_events_ns = api.namespace(
    "Publish Events",
    description="Publish and unpublish seismic events to WordPress",
    path="/publish_events",
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
