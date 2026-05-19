from src.utils.validators import validate_password, normalize_ge_phone, normalize_email


def is_authorized_request():
    from src.utils.auth_utils import is_authorized_request as _is_authorized_request
    return _is_authorized_request()

def have_permission(permission):
    from src.utils.auth_utils import have_permission as _have_permission
    return _have_permission(permission)