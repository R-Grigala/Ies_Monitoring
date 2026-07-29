from app.utils.validators import validate_password, normalize_ge_phone, normalize_email
from app.utils.mailer import Mailer
from app.utils.url_serializer import UrlSerializer

mailer = Mailer()
url_serializer = UrlSerializer()

def is_authorized_request():
    from app.utils.auth_utils import is_authorized_request as _is_authorized_request
    return _is_authorized_request()
