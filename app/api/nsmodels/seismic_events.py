import math
from datetime import datetime, timezone

from flask_restx import fields, inputs, reqparse

from app.extensions import api

seismic_events_ns = api.namespace(
    "Seismic Events",
    description="Seismic events, magnitudes, and beachball management endpoints",
    path="/api",
)

JWT_OR_API_KEY = ["JsonWebToken", "ApiKeyAuth"]


def parse_datetime(value):
    """Parse ISO 8601 into naive UTC (the DB stores origin_time as naive UTC)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError as err:
            raise ValueError(
                "Invalid datetime format. Use ISO 8601, e.g. 2026-08-05T12:30:00"
            ) from err
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _number_parser(name, minimum=None, maximum=None):
    """Finite float parser; rejects bool, NaN, and Infinity (NaN is stored as NULL)."""
    # reqparse prefixes the argument help text, so the message omits the field name.
    if minimum is not None and maximum is not None:
        message = f"must be a number between {minimum:g} and {maximum:g}"
    else:
        message = "must be a finite number"

    def parse(value):
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            raise ValueError(message)
        try:
            number = float(value)
        except (TypeError, ValueError) as err:
            raise ValueError(message) from err
        if not math.isfinite(number):
            raise ValueError(message)
        if minimum is not None and number < minimum:
            raise ValueError(message)
        if maximum is not None and number > maximum:
            raise ValueError(message)
        return number

    parse.__name__ = f"parse_{name}"
    return parse


parse_latitude = _number_parser("latitude", -90, 90)
parse_longitude = _number_parser("longitude", -180, 180)
parse_depth = _number_parser("depth", -10, 800)
# The allowed range depends on the magnitude type, so it is checked in the API once the type is known.
parse_magnitude_value = _number_parser("value")
parse_strike = _number_parser("strike", 0, 360)
parse_dip = _number_parser("dip", 0, 90)
parse_rake = _number_parser("rake", -180, 180)
parse_number = _number_parser("value")


def parse_iesdata_id(value):
    """Accept a positive integer or a string of digits; reject bool, float, and text."""
    if value is None or value == "":
        return None
    if isinstance(value, bool) or isinstance(value, float):
        raise ValueError("iesdata_id must be a positive integer, e.g. 539870")
    if isinstance(value, int):
        number = value
    else:
        text = str(value).strip()
        if not (text.isascii() and text.isdigit()):
            raise ValueError("iesdata_id must be a positive integer, e.g. 539870")
        number = int(text)
    if number < 1:
        raise ValueError("iesdata_id must be a positive integer, e.g. 539870")
    return number


magnitude_catalog_model = seismic_events_ns.model(
    "MagnitudeCatalogItem",
    {
        "id": fields.Integer(required=True, example=1),
        "code": fields.String(required=True, example="MW"),
        "description": fields.String(
            required=False,
            example="Moment Magnitude – Calculated from the seismic moment.",
        ),
    },
)

event_magnitude_model = seismic_events_ns.model(
    "EventMagnitude",
    {
        "id": fields.Integer(required=True, example=1),
        "event_id": fields.Integer(required=True, example=1),
        "magnitude_id": fields.Integer(required=True, example=5),
        "value": fields.Float(required=True, example=4.2),
        "magnitude": fields.Nested(magnitude_catalog_model, required=False),
    },
)

event_beachball_model = seismic_events_ns.model(
    "EventBeachball",
    {
        "id": fields.Integer(required=True, example=1),
        "event_id": fields.Integer(required=True, example=1),
        "rake": fields.Float(required=False, example=90.0),
        "dip": fields.Float(required=False, example=45.0),
        "strike": fields.Float(required=False, example=180.0),
        "beachball_path": fields.String(
            required=False,
            example="/static/beachballs/event_1.png",
        ),
    },
)

event_actor_model = seismic_events_ns.model(
    "SeismicEventActor",
    {
        "kind": fields.String(required=True, enum=["user", "service"], example="user"),
        "name": fields.String(required=True, example="Roma Grigalashvili"),
    },
)

seismic_event_model = seismic_events_ns.model(
    "SeismicEvent",
    {
        "id": fields.Integer(required=True, example=1),
        "iesdata_id": fields.Integer(required=False, example=539870),
        "seiscomp_oid": fields.String(required=False, example="ies2026nrtc"),
        "origin_time": fields.String(required=True, example="2026-08-05T12:30:00"),
        "latitude": fields.Float(required=True, example=41.7151),
        "longitude": fields.Float(required=True, example=44.8271),
        "depth": fields.Float(required=False, example=10.5),
        "location_ge": fields.String(required=False, example="თბილისის მახლობლად"),
        "location_en": fields.String(required=False, example="Near Tbilisi"),
        "area": fields.String(required=False, example="Georgia"),
        "is_automatic": fields.Boolean(required=True, example=False),
        "created_at": fields.String(required=False, example="2026-08-05T12:31:00"),
        "created_by": fields.Nested(event_actor_model, required=False, allow_null=True),
        "updated_at": fields.String(required=False, example="2026-08-05T13:02:00", allow_null=True),
        "updated_by": fields.Nested(event_actor_model, required=False, allow_null=True),
        "magnitudes": fields.List(fields.Nested(event_magnitude_model), required=True),
        "beachball": fields.Nested(event_beachball_model, required=False, allow_null=True),
        "is_published": fields.Boolean(required=True, example=False),
        "published_at": fields.String(required=False, example="2026-08-05T12:35:00", allow_null=True),
    },
)

# For unauthenticated endpoints: who created or edited an event is internal.
EVENT_AUDIT_FIELDS = ("created_by", "updated_at", "updated_by")
seismic_event_public_model = seismic_events_ns.model(
    "SeismicEventPublic",
    {name: field for name, field in seismic_event_model.items() if name not in EVENT_AUDIT_FIELDS},
)

seismic_event_list_response_model = seismic_events_ns.model(
    "SeismicEventListResponse",
    {
        "items": fields.List(fields.Nested(seismic_event_model), required=True),
        "total": fields.Integer(required=True, example=1),
        "limit": fields.Integer(required=False, example=100),
        "offset": fields.Integer(required=False, example=0),
    },
)

seismic_event_response_model = seismic_events_ns.model(
    "SeismicEventResponse",
    {
        "message": fields.String(required=True, example="Seismic event created successfully."),
        "event": fields.Nested(seismic_event_model, required=True),
    },
)

event_magnitude_response_model = seismic_events_ns.model(
    "EventMagnitudeResponse",
    {
        "message": fields.String(required=True, example="Event magnitude added successfully."),
        "event_magnitude": fields.Nested(event_magnitude_model, required=True),
    },
)

event_beachball_response_model = seismic_events_ns.model(
    "EventBeachballResponse",
    {
        "message": fields.String(required=True, example="Beachball saved successfully."),
        "beachball": fields.Nested(event_beachball_model, required=True),
    },
)

magnitude_catalog_list_response_model = seismic_events_ns.model(
    "MagnitudeCatalogListResponse",
    {
        "items": fields.List(fields.Nested(magnitude_catalog_model), required=True),
        "total": fields.Integer(required=True, example=11),
    },
)

message_response_model = seismic_events_ns.model(
    "SeismicEventMessageResponse",
    {
        "message": fields.String(required=True, example="Seismic event deleted successfully."),
    },
)

error_model = seismic_events_ns.model(
    "SeismicEventErrorResponse",
    {
        "error": fields.String(required=True, example="forbidden"),
        "message": fields.String(
            required=True,
            example="Missing required permission: can_event_edit",
        ),
    },
)

seismic_event_create_parser = reqparse.RequestParser()
seismic_event_create_parser.add_argument(
    "origin_time",
    type=parse_datetime,
    required=True,
    help="Origin time ISO 8601, e.g. 2026-08-05T12:30:00",
)
seismic_event_create_parser.add_argument("latitude", type=parse_latitude, required=True, help="Latitude")
seismic_event_create_parser.add_argument("longitude", type=parse_longitude, required=True, help="Longitude")
seismic_event_create_parser.add_argument("depth", type=parse_depth, required=False, help="Depth in km")
seismic_event_create_parser.add_argument("iesdata_id", type=parse_iesdata_id, required=False, help="IES data id (positive integer)")
seismic_event_create_parser.add_argument(
    "seiscomp_oid",
    type=str,
    required=False,
    help="SeisComP object id",
)
seismic_event_create_parser.add_argument("location_ge", type=str, required=False, help="Location in Georgian")
seismic_event_create_parser.add_argument("location_en", type=str, required=False, help="Location in English")
seismic_event_create_parser.add_argument("area", type=str, required=False, help="Area / region")
seismic_event_create_parser.add_argument(
    "is_automatic",
    type=inputs.boolean,
    required=False,
    default=False,
    help="Whether the event was created automatically (default: false)",
)

seismic_event_update_parser = reqparse.RequestParser()
seismic_event_update_parser.add_argument(
    "origin_time",
    type=parse_datetime,
    required=False,
    help="Origin time ISO 8601, e.g. 2026-08-05T12:30:00",
)
seismic_event_update_parser.add_argument("latitude", type=parse_latitude, required=False, help="Latitude")
seismic_event_update_parser.add_argument("longitude", type=parse_longitude, required=False, help="Longitude")
seismic_event_update_parser.add_argument("depth", type=parse_depth, required=False, help="Depth in km")
seismic_event_update_parser.add_argument("iesdata_id", type=parse_iesdata_id, required=False, help="IES data id (positive integer)")
seismic_event_update_parser.add_argument(
    "seiscomp_oid",
    type=str,
    required=False,
    help="SeisComP object id",
)
seismic_event_update_parser.add_argument("location_ge", type=str, required=False, help="Location in Georgian")
seismic_event_update_parser.add_argument("location_en", type=str, required=False, help="Location in English")
seismic_event_update_parser.add_argument("area", type=str, required=False, help="Area / region")
seismic_event_update_parser.add_argument(
    "is_automatic",
    type=inputs.boolean,
    required=False,
    help="Whether the event was created automatically",
)
# PUT is a partial update: omitted keys stay unchanged, explicit null clears optional fields.
for _argument in seismic_event_update_parser.args:
    _argument.store_missing = False

event_magnitude_create_parser = reqparse.RequestParser()
event_magnitude_create_parser.add_argument(
    "value",
    type=parse_magnitude_value,
    required=True,
    help="Magnitude value, e.g. 4.2",
)
event_magnitude_create_parser.add_argument(
    "magnitude_id",
    type=int,
    required=False,
    help="Magnitude catalog id (alternative to magnitude_code)",
)
event_magnitude_create_parser.add_argument(
    "magnitude_code",
    type=str,
    required=False,
    help="Magnitude catalog code, e.g. MW / ML",
)

event_magnitude_update_parser = reqparse.RequestParser()
event_magnitude_update_parser.add_argument(
    "value",
    type=parse_magnitude_value,
    required=False,
    help="Magnitude value, e.g. 4.2",
)
event_magnitude_update_parser.add_argument(
    "magnitude_id",
    type=int,
    required=False,
    help="Magnitude catalog id (alternative to magnitude_code)",
)
event_magnitude_update_parser.add_argument(
    "magnitude_code",
    type=str,
    required=False,
    help="Magnitude catalog code, e.g. MW / ML",
)

event_beachball_parser = reqparse.RequestParser()
event_beachball_parser.add_argument("rake", type=parse_rake, required=False, help="Rake angle")
event_beachball_parser.add_argument("dip", type=parse_dip, required=False, help="Dip angle")
event_beachball_parser.add_argument("strike", type=parse_strike, required=False, help="Strike angle")
event_beachball_parser.add_argument(
    "beachball_path",
    type=str,
    required=False,
    help="Ignored. Image path is generated server-side from strike/dip/rake.",
)

def parse_magnitude_filters(value):
    """Accept a list of magnitude filter objects from JSON."""
    if value is None or value == "":
        return None
    if not isinstance(value, list):
        raise ValueError("magnitudes must be a list of filter objects")
    return value


seismic_event_get_parser = reqparse.RequestParser()
seismic_event_get_parser.add_argument(
    "limit",
    type=int,
    required=False,
    location="args",
    help="Page size (default 100, max 200)",
)
seismic_event_get_parser.add_argument(
    "offset",
    type=int,
    required=False,
    location="args",
    help="Number of events to skip (default 0)",
)

EVENT_SORT_FIELDS = ("time", "magnitude", "depth", "type", "published")
EVENT_SORT_ORDERS = ("desc", "asc")
EVENT_SORT_HELP = (
    "Sort field: time (default), magnitude (ML, else first recorded), depth, "
    "type (is_automatic), published. Missing values sort last."
)

seismic_event_get_parser.add_argument(
    "sort", type=str, choices=EVENT_SORT_FIELDS, required=False,
    location="args", help=EVENT_SORT_HELP,
)
seismic_event_get_parser.add_argument(
    "order", type=str, choices=EVENT_SORT_ORDERS, required=False,
    location="args", help="Sort direction: desc (default) or asc",
)

seismic_event_filter_parser = reqparse.RequestParser()
seismic_event_filter_parser.add_argument(
    "event_id",
    type=int,
    required=False,
    help="Exact seismic event id",
)
seismic_event_filter_parser.add_argument(
    "event_query",
    type=str,
    required=False,
    help="Substring match against event id or iesdata_id",
)
seismic_event_filter_parser.add_argument(
    "iesdata_id",
    type=parse_iesdata_id,
    required=False,
    help="Exact IES data id",
)
seismic_event_filter_parser.add_argument(
    "seiscomp_oid",
    type=str,
    required=False,
    help="Substring match against SeisComP object id",
)
seismic_event_filter_parser.add_argument(
    "location",
    type=str,
    required=False,
    help="Substring match against location_en or location_ge",
)
seismic_event_filter_parser.add_argument(
    "area",
    type=str,
    required=False,
    help="Substring match against area",
)
seismic_event_filter_parser.add_argument(
    "magnitude",
    type=str,
    required=False,
    help="Magnitude catalog code, e.g. MW / ML (filters by that type)",
)
seismic_event_filter_parser.add_argument(
    "magnitude_min",
    type=parse_number,
    required=False,
    help="Minimum magnitude value (inclusive)",
)
seismic_event_filter_parser.add_argument(
    "magnitude_max",
    type=parse_number,
    required=False,
    help="Maximum magnitude value (inclusive)",
)
seismic_event_filter_parser.add_argument(
    "magnitudes",
    type=parse_magnitude_filters,
    location="json",
    required=False,
    help="List of magnitude filters: [{magnitude, magnitude_min, magnitude_max}, ...]",
)
seismic_event_filter_parser.add_argument(
    "depth_min",
    type=parse_number,
    required=False,
    help="Minimum depth in km (inclusive)",
)
seismic_event_filter_parser.add_argument(
    "depth_max",
    type=parse_number,
    required=False,
    help="Maximum depth in km (inclusive)",
)
seismic_event_filter_parser.add_argument(
    "date_from",
    type=parse_datetime,
    required=False,
    help="Origin time from (ISO 8601, inclusive)",
)
seismic_event_filter_parser.add_argument(
    "date_to",
    type=parse_datetime,
    required=False,
    help="Origin time to (ISO 8601, inclusive)",
)
seismic_event_filter_parser.add_argument(
    "limit",
    type=int,
    required=False,
    help="Max events to return, newest first (default 100, max 200)",
)
seismic_event_filter_parser.add_argument(
    "offset",
    type=int,
    required=False,
    help="Number of matching events to skip (default 0)",
)
seismic_event_filter_parser.add_argument(
    "sort", type=str, choices=EVENT_SORT_FIELDS, required=False, help=EVENT_SORT_HELP,
)
seismic_event_filter_parser.add_argument(
    "order", type=str, choices=EVENT_SORT_ORDERS, required=False,
    help="Sort direction: desc (default) or asc",
)
