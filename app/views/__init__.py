"""Views პაკეტის ექსპორტები.

ეს პაკეტი აექსპორტებს Flask blueprint-ებს,
რომლებიც HTML გვერდების რენდერზე არიან პასუხისმგებელი.
"""

from app.views.auth.routes import auth_blueprint
from app.views.accounts.routes import accounts_blueprint