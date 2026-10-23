from app.extensions import db
from app.models.base import BaseModel


class SeismicEvent(db.Model, BaseModel):
    __tablename__ = "seismic_events"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    iesdata_id = db.Column(db.Integer, unique=True, nullable=True, index=True)
    seiscomp_oid = db.Column(db.String(20), unique=True, nullable=True, index=True)

    origin_time = db.Column(db.DateTime, nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    depth = db.Column(db.Float, nullable=True)

    location_ge = db.Column(db.String(500), nullable=True)
    location_en = db.Column(db.String(500), nullable=True)
    area = db.Column(db.String(20), nullable=True)
    is_automatic = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=True)

    # A change is made either by a logged-in user or by a service API key; the other FK stays NULL.
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_by_service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)
    updated_by_service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)

    created_by_user = db.relationship("User", foreign_keys=[created_by_user_id])
    updated_by_user = db.relationship("User", foreign_keys=[updated_by_user_id])
    created_by_service = db.relationship("Service", foreign_keys=[created_by_service_id])
    updated_by_service = db.relationship("Service", foreign_keys=[updated_by_service_id])

    event_magnitudes = db.relationship(
        "EventMagnitude",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="select",
    )
    beachball = db.relationship(
        "EventBeachball",
        back_populates="event",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="select",
    )
    published_event = db.relationship(
        "PublishedEvent",
        back_populates="event",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="select",
    )

    def mark_created_by(self, actor):
        self.created_by_user_id = actor["user_id"]
        self.created_by_service_id = actor["service"].id if actor["service"] else None

    def mark_updated_by(self, actor):
        self.updated_at = db.func.now()
        self.updated_by_user_id = actor["user_id"]
        self.updated_by_service_id = actor["service"].id if actor["service"] else None

    @staticmethod
    def _actor_dict(user, service):
        if user is not None:
            full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            return {"kind": "user", "name": full_name or user.email}
        if service is not None:
            return {"kind": "service", "name": service.name}
        return None

    def to_dict(self):
        published = self.published_event
        return {
            "id": self.id,
            "iesdata_id": self.iesdata_id,
            "seiscomp_oid": self.seiscomp_oid,
            "origin_time": self.origin_time.isoformat() if self.origin_time else None,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "depth": self.depth,
            "location_ge": self.location_ge,
            "location_en": self.location_en,
            "area": self.area,
            "is_automatic": bool(self.is_automatic),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self._actor_dict(self.created_by_user, self.created_by_service),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "updated_by": self._actor_dict(self.updated_by_user, self.updated_by_service),
            "magnitudes": [item.to_dict() for item in self.event_magnitudes],
            "beachball": self.beachball.to_dict() if self.beachball else None,
            "is_published": published is not None,
            "published_at": (
                published.published_at.isoformat()
                if published and published.published_at
                else None
            ),
        }

    def __repr__(self):
        return (
            f"<SeismicEvent id={self.id} origin_time={self.origin_time} "
            f"lat={self.latitude} lon={self.longitude}>"
        )
