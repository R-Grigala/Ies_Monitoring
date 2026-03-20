from src.extensions import db
from src.models.base import BaseModel

class SeismicEvent(db.Model, BaseModel):
    __tablename__ = 'seismic_events'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(50), unique=True, nullable=False)
    origin_time = db.Column(db.DateTime, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    depth = db.Column(db.Float, nullable=False)
    magnitude = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(128), nullable=True)