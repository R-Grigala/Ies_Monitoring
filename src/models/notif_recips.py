from src.extensions import db
from src.models.base import BaseModel
from sqlalchemy.orm import validates
from src.utils import normalize_ge_phone, normalize_email


class PhoneRecipient(db.Model, BaseModel):
    __tablename__ = "phone_recipients"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=False, unique=True, index=True)
    staff_member = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def __repr__(self):
        return f"<PhoneRecipient id={self.id} username={self.username} phone={self.phone}>"

    @validates("phone")
    def validate_and_normalize_phone(self, key, phone):
        return normalize_ge_phone(phone)


class EmailRecipient(db.Model, BaseModel):
    __tablename__ = "email_recipients"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=False, unique=True, index=True)
    staff_member = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def __repr__(self):
        return f"<EmailRecipient id={self.id} username={self.username} email={self.email}>"

    @validates("email")
    def validate_and_normalize_email(self, key, email):
        return normalize_email(email)
