from flask.cli import with_appcontext
from flask import current_app
import click
from datetime import datetime
import os

from app.extensions import db
from app.models import User, Permission

# --- Core logic (გამოსაყენებელი როგორც CLI-დან, ისე ტესტებიდან) ---

def _is_production_environment():
    """ამოწმებს გაშვებულია თუ არა აპი production გარემოში."""
    config_flag = current_app.config.get("APP_ENV")
    return config_flag == "production"


def _require_reset_confirmation(confirm_text):
    """init_db-სთვის სავალდებულო დამცავი ტექსტის ვალიდაცია."""
    if confirm_text != "RESET_DB":
        raise click.ClickException( 
            "უსაფრთხოების მიზნით მიუთითე --confirm-text RESET_DB"
        )

def init_db_core():
    """Drop and recreate all database tables."""
    db.drop_all()
    db.create_all()

def populate_db_core():

    click.echo("Creating Permissions")
    permissions = Permission(
        name="admin",
        description="Admin permissions",
        can_users=True,
        can_shakemap=True,
        can_events=True
    )
    permissions.create()

    click.echo("Creating Admin User")
    admin_user = User (
        name="Roma",
        lastname="Grigalashvili",
        email="roma.grigalashvili@iliauni.edu.ge",
        password="PASSWORD",
        
    )
    admin_user.create()


# --- Click CLI commands (thin wrappers around core logic) ---

@click.command("init_db")
@click.option(
    "--force",
    is_flag=True,
    help="Production გარემოში აუცილებელია ამ flag-ის გადაცემა.",
)
@click.option(
    "--confirm-text",
    default="",
    help='უსაფრთხოებისთვის ზუსტად მიუთითე: RESET_DB',
)
@with_appcontext
def init_db(force, confirm_text):
    """CLI: recreate DB schema."""
    if _is_production_environment() and not force:
        raise click.ClickException(
            "Production გარემოში init_db დაბლოკილია. გამოიყენე --force."
        )

    _require_reset_confirmation(confirm_text)

    if not force and not click.confirm("ნამდვილად გსურს ბაზის სრული reset (drop/create)?"):
        click.echo("ოპერაცია გაუქმდა.")
        return

    click.echo("Creating Database")
    init_db_core()
    click.echo("Database Created")

@click.command("populate_db")
@click.option(
    "--force",
    is_flag=True,
    help="Production გარემოში აუცილებელია ამ flag-ის გადაცემა.",
)
@with_appcontext
def populate_db(force):
    """CLI: populate DB with a single sample seismic event."""
    if _is_production_environment() and not force:
        raise click.ClickException(
            "Production გარემოში populate_db დაბლოკილია. გამოიყენე --force."
        )

    click.echo("Populating Database with sample seismic events...")
    populate_db_core()
    click.echo("Database Populated")