import os
from datetime import timedelta
from os import path, sep, pardir

from dotenv import load_dotenv
from sqlalchemy.engine import URL
from sqlalchemy.pool import StaticPool

BASE_DIR = path.abspath(path.dirname(__file__) + sep + pardir)

# override=True: the dev reloader passes the old values to its child process,
# so without it edits to .env would be ignored until a full restart.
load_dotenv(dotenv_path=path.join(BASE_DIR, ".env"), override=True)


def _database_uri(uri_key, mysql_database_key, sqlite_name):
    """
    Pick the database URI: an explicit `<uri_key>` wins, then MySQL built from the
    MYSQL_* parts (database name from `mysql_database_key`), then a local SQLite file.
    """
    explicit = os.getenv(uri_key)
    if explicit:
        return explicit

    host = os.getenv("MYSQL_HOST")
    database = os.getenv(mysql_database_key)
    if host and database:
        # URL.create escapes special characters in the password.
        return URL.create(
            "mysql+pymysql",
            username=os.getenv("MYSQL_USER"),
            password=os.getenv("MYSQL_PASSWORD"),
            host=host,
            port=int(os.getenv("MYSQL_PORT", "3306")),
            database=database,
            query={"charset": "utf8mb4"},
        ).render_as_string(hide_password=False)

    return "sqlite:///" + path.join(BASE_DIR, sqlite_name)


class Config:
    BASE_DIR = BASE_DIR
    TEMPLATES_FOLDERS = path.join(BASE_DIR, "app", "templates")
    APP_ENV = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development").lower()

    # Reconnect after MySQL drops idle connections (wait_timeout).
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 3600}

    SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("MY_SECRET_KEY", "default_secret_key")

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    API_KEY = os.getenv("API_KEY", "default_api_key")
    LOG_DIR = os.getenv("LOG_DIR", path.join(BASE_DIR, "logs"))
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", 5 * 1024 * 1024))
    LOG_BACKUP_COUNT = int(os.getenv("LOG_BACKUP_COUNT", 5))

    MAIL_SERVER = os.getenv("MAIL_SERVER")
    MAIL_PORT = os.getenv("MAIL_PORT")
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")

    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_SAMESITE = "Strict"
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_REFRESH_COOKIE_PATH = "/api/auth"

    AUTHORIZATION = {
        "JsonWebToken": {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "JWT token using Bearer scheme. Example: Bearer <access_token>",
        },
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "Service API key from /api/services/. Example: ies_...",
        },
    }

    WP_AJAX_URL = os.getenv(
        "WP_AJAX_URL",
        "https://ies-staging.iliauni.edu.ge/wp-admin/admin-ajax.php",
    )
    WP_PUBLISH_CODE = os.getenv("WP_PUBLISH_CODE", "")
    # Browser key: restrict it to this site's HTTP referrers in Google Cloud Console.
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
    WP_SSL_VERIFY = os.getenv("WP_SSL_VERIFY", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

class DevelopmentConfig(Config):
    DEBUG = True
    JWT_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = _database_uri("DEV_DATABASE_URI", "DEV_MYSQL_DATABASE", "dev.db")


class ProductionConfig(Config):
    DEBUG = False
    JWT_COOKIE_SECURE = True
    APP_ENV = "production"
    SQLALCHEMY_DATABASE_URI = _database_uri("PROD_DATABASE_URI", "MYSQL_DATABASE", "prod.db")


class TestingConfig(Config):
    TESTING = True
    DEBUG = False
    SECRET_KEY = "test-secret-key-at-least-32-bytes-long"
    JWT_SECRET_KEY = "test-jwt-secret-key-at-least-32-bytes"
    API_KEY = "test-api-key"
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=1)
    LOG_DIR = path.join(Config.BASE_DIR, "logs", "test")
    LOG_LEVEL = "WARNING"
    WTF_CSRF_ENABLED = False
    WP_AJAX_URL = "https://example.test/wp-admin/admin-ajax.php"
    WP_PUBLISH_CODE = "test-wp-publish-code"
    WP_SSL_VERIFY = True


def get_config():
    env = Config.APP_ENV
    if env == "production":
        return ProductionConfig
    if env == "testing":
        return TestingConfig
    return DevelopmentConfig
