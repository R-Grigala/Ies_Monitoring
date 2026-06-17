import logging

from flask_restx import Resource
import datetime

from src.api.nsmodels import event_ns, event_model, event_parser
from src.utils import is_authorized_request, have_permission
from src.models import SeismicEvent, ShakemapJob

logger = logging.getLogger("app.events")

@event_ns.route('/events')
@event_ns.doc(
    responses={
        200: 'OK',
        201: 'Created',
        400: 'Invalid Argument',
        401: 'Unauthorized',
        404: 'Not Found'
    }
)
class SeismicListAPI(Resource):
    @event_ns.marshal_list_with(event_model)  # Swagger-ში სქემის საჩვენებლად
    def get(self):
        """აბრუნებს მიწისძვრების სრულ სიას."""
        events = SeismicEvent.query.all()
        if not events:
            logger.info("Events list: no records found")
            return {"error": "No earthquakes found."}, 404

        logger.info("Events list success: count=%s", len(events))
        return events

    @event_ns.expect(event_parser)
    @event_ns.doc(
        security=[{'ApiKeyAuth': []}, {'JsonWebToken': []}],
        description='Create or update a seismic event (requires X-API-Key or JWT Bearer token)',
    )
    def post(self):
        """Create or update a seismic event (upsert, API key or JWT)"""
        # --- ავტორიზაციის შემოწმება ---
        if not is_authorized_request():
            logger.warning("Event upsert denied: unauthorized")
            return {'error': 'Access denied. Provide a valid X-API-Key or JWT token.'}, 401
        # --- უფლების შემოწმება ---
        if not have_permission("can_events"):
            logger.warning("Event upsert denied: missing can_events permission")
            return {'error': 'You do not have permission to add earthquakes.'}, 403

        # --- მოთხოვნის body-ის დამუშავება ---
        args = event_parser.parse_args()

        # --- origin_time-ის datetime-ად გარდაქმნა ---
        try:
            origin_time = datetime.datetime.fromisoformat(args['origin_time'])
        except Exception:
            logger.info(
                "Event upsert failed: event_id=%s invalid origin_time format",
                args.get("event_id"),
            )
            return {
                'error': 'Invalid origin_time format (use ISO 8601, e.g. 2025-10-24T12:20:00).'
            }, 400

        # --- ვამოწმებთ, არსებობს თუ არა უკვე ეს მოვლენა ---
        seiscomp_oid = args.get('seiscomp_oid')
        exist_event = (
            SeismicEvent.query.filter_by(seiscomp_oid=seiscomp_oid).first()
            if seiscomp_oid is not None
            else None
        )
        if exist_event:
            # -------- არსებული მოვლენის განახლება --------
            exist_event.event_id = args.get('event_id')
            exist_event.origin_time = origin_time
            exist_event.origin_msec = args.get('origin_msec')
            exist_event.latitude = args['latitude']
            exist_event.longitude = args['longitude']
            exist_event.depth = args['depth']
            exist_event.location_ge = args.get('location_ge')
            exist_event.location_en = args.get('location_en')
            exist_event.area = args.get('area')
            exist_event.ml = args.get('ml')

            exist_event.save()
            logger.info("Event updated: seiscomp_oid=%s", seiscomp_oid)
            return {
                'message': f'Earthquake event updated successfully: {seiscomp_oid}'
            }, 200

        else:
            # -------- ახალი მოვლენის შექმნა --------
            new_event = SeismicEvent(
                event_id=args.get('event_id'),
                seiscomp_oid=seiscomp_oid,
                origin_time=origin_time,
                origin_msec=args.get('origin_msec'),
                latitude=args['latitude'],
                longitude=args['longitude'],
                depth=args['depth'],
                location_ge=args.get('location_ge'),
                location_en=args.get('location_en'),
                area=args.get('area'),
                ml=args.get('ml'),
            )
            new_event.create()
            logger.info("Event created: id=%s seiscomp_oid=%s", new_event.id, seiscomp_oid)

            return {
                'message': f'Earthquake event created successfully: {new_event.id}'
            }, 201


@event_ns.route('/events/<int:id>')
@event_ns.doc(
    responses={
        200: 'OK',
        401: 'Unauthorized',
        404: 'Not Found'
    }
)
class SeismicEventAPI(Resource):
    @event_ns.expect(event_parser)
    @event_ns.doc(
        security=[{'ApiKeyAuth': []}, {'JsonWebToken': []}],
        description='Update a seismic event by id (requires X-API-Key or JWT Bearer token)',
    )
    def put(self, id):
        """Update seismic event by primary key id."""
        if not is_authorized_request():
            logger.warning("Event update denied: id=%s unauthorized", id)
            return {'error': 'Access denied. You are not authorized.'}, 401
        if not have_permission("can_events"):
            logger.warning("Event update denied: id=%s missing can_events permission", id)
            return {'error': 'You do not have permission to edit earthquakes.'}, 403

        args = event_parser.parse_args()

        event = SeismicEvent.query.filter_by(id=id).first()
        if not event:
            logger.info("Event update failed: id=%s not found", id)
            return {'error': f'Earthquake event not found: {id}'}, 404

        try:
            origin_time = datetime.datetime.fromisoformat(args['origin_time'])
        except Exception:
            logger.info(
                "Event update failed: id=%s invalid origin_time format",
                id,
            )
            return {
                'error': 'Invalid origin_time format (use ISO 8601, e.g. 2025-10-24T12:20:00).'
            }, 400

        event.event_id = args.get('event_id')
        event.seiscomp_oid = event.seiscomp_oid # SeisComP OID cannot be edited after event creation.
        event.origin_time = origin_time
        event.origin_msec = args.get('origin_msec')
        event.latitude = args['latitude']
        event.longitude = args['longitude']
        event.depth = args['depth']
        event.location_ge = args.get('location_ge')
        event.location_en = args.get('location_en')
        event.area = args.get('area')
        event.ml = args.get('ml')
        event.save()

        logger.info("Event updated via PUT: id=%s seiscomp_oid=%s", id, event.seiscomp_oid)
        return {'message': f'Earthquake event updated successfully: {id}'}, 200

    @event_ns.doc(security='JsonWebToken', description='Delete a seismic event by id (requires JWT Bearer token)')
    def delete(self, id):
        """Delete seismic event by primary key id (requires authorization)."""
        if not is_authorized_request():
            logger.warning("Event delete denied: id=%s unauthorized", id)
            return {'error': 'Access denied. Provide a valid JWT token.'}, 401
        if not have_permission("can_events"):
            logger.warning("Event delete denied: id=%s missing can_events permission", id)
            return {'error': 'You do not have permission to delete earthquakes.'}, 403

        event = SeismicEvent.query.filter_by(id=id).first()
        if not event:
            logger.info("Event delete failed: id=%s not found", id)
            return {'error': f'Earthquake event not found: {id}'}, 404

        # Delete related ShakeMap job first (if exists) to keep DB consistent.
        shakemap_job = ShakemapJob.query.filter_by(seiscomp_oid=event.seiscomp_oid).first()
        if shakemap_job:
            shakemap_job.delete()
            logger.info(
                "Related ShakeMap job deleted: event_id=%s seiscomp_oid=%s job_id=%s",
                id,
                event.seiscomp_oid,
                shakemap_job.id,
            )

        event.delete()
        logger.info("Event deleted: id=%s", id)
        return {'message': f'Earthquake event deleted successfully: {id}'}, 200