from app.extensions import db
from app.models.base import BaseModel


class Magnitude(db.Model, BaseModel):
    __tablename__ = "magnitudes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    code = db.Column(db.String(50), unique=True, nullable=False, index=True)
    description = db.Column(db.String(500), nullable=True)

    event_magnitudes = db.relationship(
        "EventMagnitude",
        back_populates="magnitude",
        lazy="select",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "description": self.description,
        }

    def __repr__(self):
        return f"<Magnitude id={self.id} code={self.code}>"
