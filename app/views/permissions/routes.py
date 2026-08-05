from flask import Blueprint, redirect, render_template, request, url_for

from app.config import Config

permissions_blueprint = Blueprint(
    "permissions",
    __name__,
    template_folder=Config.TEMPLATES_FOLDERS + "/permissions",
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


@permissions_blueprint.route("/permissions")
@permissions_blueprint.route("/<lang>/permissions")
def permissions(lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(url_for("permissions.permissions", lang=_preferred_lang()))
    if raw_lang is not None and lang is None:
        return redirect(url_for("permissions.permissions", lang="en"))
    return render_template("permissions.html")
