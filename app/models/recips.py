from app.extensions import db
from app.models.base import BaseModel


class Recip(db.Model, BaseModel):
    __tablename__ = "recips"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(255), nullable=False, index=True)

    is_staff = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    emails = db.relationship(
        "RecipEmail",
        back_populates="recip",
        cascade="all, delete-orphan",
        lazy="select",
    )
    numbers = db.relationship(
        "RecipNumber",
        back_populates="recip",
        cascade="all, delete-orphan",
        lazy="select",
    )
    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    updated_by = db.relationship("User", foreign_keys=[updated_by_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "is_staff": self.is_staff,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by_user_id": self.created_by_user_id,
            "updated_by_user_id": self.updated_by_user_id,
            "emails": [email.to_dict() for email in self.emails],
            "numbers": [number.to_dict() for number in self.numbers],
        }

    def __repr__(self):
        return f"<Recip id={self.id} username={self.username} active={self.is_active}>"
