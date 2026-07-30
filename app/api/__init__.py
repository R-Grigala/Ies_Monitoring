from app.extensions import api
from app.api.auth import (
    RegistrationApi,
    AuthorizationApi,
    AccessTokenRefreshApi,
    LogoutApi,
    LogoutAllApi,
)

from app.api.accounts import CurrentUserApi, AccountsApi, AccountDetailApi
from app.api.recips import (
    RecipsApi,
    RecipDetailApi,
    RecipEmailsApi,
    RecipEmailDetailApi,
    RecipNumbersApi,
    RecipNumberDetailApi,
)