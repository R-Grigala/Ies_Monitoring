from app.extensions import db
from app.models.base import BaseModel


class EventMagnitude(db.Model, BaseModel):
    __tablename__ = "event_magnitudes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    magnitude_id = db.Column(db.Integer, db.ForeignKey("magnitudes.id"), nullable=False, index=True)
    event_id = db.Column(db.Integer, db.ForeignKey("seismic_events.id"), nullable=False, index=True)
    value = db.Column(db.Float, nullable=False)

    event = db.relationship("SeismicEvent", foreign_keys=[event_id], back_populates="event_magnitudes")
    magnitude = db.relationship("Magnitude", foreign_keys=[magnitude_id], back_populates="event_magnitudes")

    __table_args__ = (
        db.UniqueConstraint("event_id", "magnitude_id", name="uq_event_magnitudes_event_magnitude"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "magnitude_id": self.magnitude_id,
            "value": self.value,
            "magnitude": self.magnitude.to_dict() if self.magnitude else None,
        }

    def __repr__(self):
        return (
            f"<EventMagnitude id={self.id} event_id={self.event_id} "
            f"magnitude_id={self.magnitude_id} value={self.value}>"
        )
