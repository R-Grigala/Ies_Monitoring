import uuid

from app.extensions import db
from app.models.base import BaseModel


class Service(db.Model, BaseModel):
    __tablename__ = "services"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))

    name = db.Column(db.String(255), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)

    api_key_prefix = db.Column(db.String(16), nullable=False, index=True)
    api_key_hash = db.Column(db.String(64), unique=True, nullable=False, index=True)

    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    last_used_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=db.func.now(), onupdate=db.func.now())
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    service_permissions = db.relationship(
        "ServicePermission",
        foreign_keys="ServicePermission.service_id",
        back_populates="service",
        cascade="all, delete-orphan",
        lazy="select",
    )
    created_by = db.relationship("User", foreign_keys=[created_by_user_id])
    updated_by = db.relationship("User", foreign_keys=[updated_by_user_id])

    def check_permission(self, permission_code):
        from app.utils.auth_utils import has_service_permission

        return has_service_permission(self, permission_code)

    def to_dict(self):
        return {
            "uuid": self.uuid,
            "name": self.name,
            "description": self.description,
            "api_key_prefix": self.api_key_prefix,
            "is_active": self.is_active,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by_user_id": self.created_by_user_id,
            "updated_by_user_id": self.updated_by_user_id,
        }

    def __repr__(self):
        return f"<Service uuid={self.uuid} name={self.name} active={self.is_active}>"
