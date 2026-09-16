from app.extensions import api
from app.api.auth import (
    RegistrationApi,
    AuthorizationApi,
    AccessTokenRefreshApi,
    LogoutApi,
    LogoutAllApi,
)
from app.api.services import ServicesApi, ServiceDetailApi
from app.api.accounts import (
    CurrentUserApi,
    AccountsApi,
    AccountDetailApi,
    AccountPermissionsApi,
    AccountPermissionDetailApi,
)
from app.api.permissions import PermissionsApi, PermissionDetailApi
from app.api.recips import (
    RecipsApi,
    RecipDetailApi,
    RecipEmailsApi,
    RecipEmailDetailApi,
    RecipNumbersApi,
    RecipNumberDetailApi,
)
from app.api.seismic_events import (
    MagnitudeCatalogApi,
    SeismicEventsApi,
    SeismicEventsFilterApi,
    SeismicEventDetailApi,
    EventMagnitudesApi,
    EventMagnitudeDetailApi,
    EventBeachballApi,
)
