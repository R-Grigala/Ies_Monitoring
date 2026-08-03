import hashlib
import secrets
from datetime import datetime


API_KEY_PREFIX = "ies_"


def generate_api_key():
    """Generate a raw API key and its stored hash/prefix.

    Returns:
        tuple[str, str, str]: (raw_key, prefix, sha256_hash)
    """
    raw_key = f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    prefix = raw_key[:12]
    key_hash = hash_api_key(raw_key)
    return raw_key, prefix, key_hash


def hash_api_key(raw_key: str) -> str:
    """Hash an API key with SHA-256 for deterministic DB lookup."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def find_service_by_api_key(raw_key: str):
    """Resolve an active service from a raw API key header value."""
    if not raw_key or not isinstance(raw_key, str):
        return None

    from app.models import Service

    key_hash = hash_api_key(raw_key.strip())
    return Service.query.filter_by(api_key_hash=key_hash, is_active=True).first()


def touch_service_last_used(service, commit=True):
    """Update service last_used_at timestamp."""
    service.last_used_at = datetime.now()
    if commit:
        service.save()
