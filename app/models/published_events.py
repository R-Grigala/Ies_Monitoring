from datetime import datetime, timezone

from app.extensions import db
from app.models.base import BaseModel


class PublishedEvent(db.Model, BaseModel):
    __tablename__ = "published_events"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(
        db.Integer,
        db.ForeignKey("seismic_events.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    wp_response = db.Column(db.Text, nullable=True)
    published_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    event = db.relationship(
        "SeismicEvent",
        foreign_keys=[event_id],
        back_populates="published_event",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "wp_response": self.wp_response,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }

    def __repr__(self):
        return f"<PublishedEvent id={self.id} event_id={self.event_id}>"
