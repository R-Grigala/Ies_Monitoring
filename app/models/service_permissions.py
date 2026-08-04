from app.extensions import db
from app.models.base import BaseModel


class ServicePermission(db.Model, BaseModel):
    __tablename__ = "service_permissions"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False, index=True)
    permission_id = db.Column(db.Integer, db.ForeignKey("permissions.id"), nullable=False, index=True)

    granted_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    granted_at = db.Column(db.DateTime, nullable=False, default=db.func.now())

    degranted_at = db.Column(db.DateTime, nullable=True)
    degranted_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    service = db.relationship("Service", foreign_keys=[service_id], back_populates="service_permissions")
    permission = db.relationship("Permission", foreign_keys=[permission_id])

    __table_args__ = (
        db.Index(
            "ix_service_permissions_service_permission_active",
            "service_id",
            "permission_id",
            "degranted_at",
        ),
    )

    def __repr__(self):
        return (
            f"<ServicePermission service_id={self.service_id} permission_id={self.permission_id} "
            f"active={self.degranted_at is None}>"
        )
