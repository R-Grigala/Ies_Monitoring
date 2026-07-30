from sqlalchemy.orm import validates

from app.extensions import db
from app.models.base import BaseModel
from app.utils.validators import normalize_ge_phone


class RecipNumber(db.Model, BaseModel):
    __tablename__ = "recip_numbers"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    phone_number = db.Column(db.String(50), unique=True, nullable=False, index=True)
    recip_id = db.Column(db.Integer, db.ForeignKey("recips.id"), nullable=False, index=True)

    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    recip = db.relationship("Recip", foreign_keys=[recip_id], back_populates="numbers")
    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    updated_by = db.relationship("User", foreign_keys=[updated_by_user_id])

    @validates("phone_number")
    def validate_and_normalize_phone(self, _, phone_number):
        return normalize_ge_phone(phone_number)

    def to_dict(self):
        return {
            "id": self.id,
            "phone_number": self.phone_number,
            "recip_id": self.recip_id,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by_user_id": self.created_by_user_id,
            "updated_by_user_id": self.updated_by_user_id,
        }

    def __repr__(self):
        return (
            f"<RecipNumber id={self.id} phone_number={self.phone_number} "
            f"recip_id={self.recip_id}>"
        )
