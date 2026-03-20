from flask_sqlalchemy import SQLAlchemy
from flask_restx import Api
from flask_migrate import Migrate


from src.config import Config

db = SQLAlchemy()
migrate = Migrate()

api = Api(
    title='EarthQuakeWatch API',
    version='1.0',
    description='Seismic monitoring API (Seiscomp → Shakemap → Mailer)',
    authorizations=Config.AUTHORIZATION,
    doc='/api' # Swagger UI path
)