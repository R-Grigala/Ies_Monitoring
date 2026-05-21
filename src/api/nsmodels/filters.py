from flask_restx import reqparse, fields
from src.extensions import api
filter_ns = api.namespace(
    "EventsFilter",
    description="API endpoint for seismic events filtering",
    path="/api",
)
filter_model = api.model(
    "SeismicEventFilter",
    {
        'event_id': fields.Integer(required=True, description='Primary key / manually assigned ID'),
        'seiscomp_oid': fields.String(required=True,description='SeisComP OID'),
        'origin_time': fields.DateTime(required=True, description='Origin time of the event'),
        'origin_msec': fields.Integer(description='Milliseconds of origin time'),
        'latitude': fields.Float(required=True, description='Latitude of the event'),
        'longitude': fields.Float(required=True, description='Longitude of the event'),
        'depth': fields.Float(required=True, description='Depth in km'),
        'location_ge': fields.String(description='Location GE'),
        'location_en': fields.String(description='Location EN'),
        'area': fields.String(description='Area name'),
        'ml': fields.Float(required=True, description='Local Magnitude (ML)'),
        'shakemap_status': fields.String(
            description='ShakeMap status (pending/running/generated/failed)',
            enum=['pending', 'running', 'generated', 'failed'],
        ),
        'created_at': fields.DateTime(description='Record creation timestamp (UTC)')
    },
)
filter_parser = reqparse.RequestParser()
filter_parser.add_argument("event_id", type=int, required=False, location="args", help="Exact event ID")
filter_parser.add_argument("seiscomp_oid", type=str, required=False, location="args", help="Filter by SeisComP OID substring")
filter_parser.add_argument("location", type=str, required=False, location="args", help="Filter by location_ge or location_en substring")
filter_parser.add_argument(
    "area",
    type=str,
    required=False,
    location="args",
    choices=("local", "regional", "teleseismic"),
    help="Area type: local, regional or teleseismic",
)
filter_parser.add_argument("ml_min", type=float, required=False, location="args", help="Minimum ML value")
filter_parser.add_argument("ml_max", type=float, required=False, location="args", help="Maximum ML value")
filter_parser.add_argument("depth_min", type=float, required=False, location="args", help="Minimum depth value")
filter_parser.add_argument("depth_max", type=float, required=False, location="args", help="Maximum depth value")
filter_parser.add_argument(
    "start_time",
    type=str,
    required=False,
    location="args",
    help="Start datetime (ISO 8601) or date (YYYY-MM-DD)",
)
filter_parser.add_argument(
    "end_time",
    type=str,
    required=False,
    location="args",
    help="End datetime (ISO 8601) or date (YYYY-MM-DD)",
)
filter_parser.add_argument(
    "shakemap_status",
    type=str,
    required=False,
    location="args",
    choices=("pending", "running", "generated", "failed"),
    help="ShakeMap status: pending, running, generated or failed",
)