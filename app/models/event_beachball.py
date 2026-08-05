from app.extensions import db
from app.models.base import BaseModel


class EventBeachball(db.Model, BaseModel):
    __tablename__ = "event_beachball"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    event_id = db.Column(
        db.Integer,
        db.ForeignKey("seismic_events.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    rake = db.Column(db.Float, nullable=True)
    dip = db.Column(db.Float, nullable=True)
    strike = db.Column(db.Float, nullable=True)
    beachball_path = db.Column(db.String(500), nullable=True)

    event = db.relationship("SeismicEvent", foreign_keys=[event_id], back_populates="beachball")

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "rake": self.rake,
            "dip": self.dip,
            "strike": self.strike,
            "beachball_path": self.beachball_path,
        }

    def __repr__(self):
        return f"<EventBeachball id={self.id} event_id={self.event_id}>"
