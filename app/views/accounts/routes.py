from flask import Blueprint, redirect, render_template, request, url_for

from app.config import Config

accounts_blueprint = Blueprint(
    "accounts",
    __name__,
    template_folder=Config.TEMPLATES_FOLDERS + "/accounts",
)
SUPPORTED_LANGS = {"en", "ka"}


def _normalized_lang(lang):
    if lang in SUPPORTED_LANGS:
        return lang
    return None


def _preferred_lang():
    cookie_lang = request.cookies.get("lang")
    if cookie_lang in SUPPORTED_LANGS:
        return cookie_lang
    return "en"


@accounts_blueprint.route("/accounts")
@accounts_blueprint.route("/<lang>/accounts")
def accounts(lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(url_for("accounts.accounts", lang=_preferred_lang()))
    if raw_lang is not None and lang is None:
        return redirect(url_for("accounts.accounts", lang="en"))
    return render_template("accounts.html")
