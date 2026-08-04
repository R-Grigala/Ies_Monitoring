from flask import Blueprint, redirect, render_template, request, url_for

from app.config import Config

services_blueprint = Blueprint(
    "services",
    __name__,
    template_folder=Config.TEMPLATES_FOLDERS + "/services",
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


@services_blueprint.route("/services")
@services_blueprint.route("/<lang>/services")
def services(lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(url_for("services.services", lang=_preferred_lang()))
    if raw_lang is not None and lang is None:
        return redirect(url_for("services.services", lang="en"))
    return render_template("services.html")
