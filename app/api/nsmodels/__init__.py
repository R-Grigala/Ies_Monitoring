from app.api.nsmodels.auth import auth_ns, registration_parser, auth_parser, request_reset_password_parser, reset_password_parser
from app.api.nsmodels.accounts import (
    accounts_ns,
    account_model,
    account_update_parser,
    account_update_response_model,
    account_list_response_model,
    error_model,
)
from app.api.nsmodels.recips import (
    recips_ns,
    recip_model,
    recip_email_model,
    recip_number_model,
    recip_create_parser,
    recip_update_parser,
    recip_email_create_parser,
    recip_email_update_parser,
    recip_number_create_parser,
    recip_number_update_parser,
    recip_response_model,
    recip_list_response_model,
    recip_email_response_model,
    recip_number_response_model,
    message_response_model,
)