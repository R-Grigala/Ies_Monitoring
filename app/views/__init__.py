"""Views პაკეტის ექსპორტები.

ეს პაკეტი აექსპორტებს Flask blueprint-ებს,
რომლებიც HTML გვერდების რენდერზე არიან პასუხისმგებელი.
"""

from app.views.auth.routes import auth_blueprint
from app.views.accounts.routes import accounts_blueprint
from app.views.notify.routes import notify_blueprint
from app.views.services.routes import services_blueprint
from app.views.permissions.routes import permissions_blueprint
