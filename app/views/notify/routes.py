from flask import Blueprint, redirect, render_template, request, url_for

from app.config import Config

notify_blueprint = Blueprint(
    "notify",
    __name__,
    template_folder=Config.TEMPLATES_FOLDERS + "/notify",
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


@notify_blueprint.route("/notify")
@notify_blueprint.route("/<lang>/notify")
def notify(lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(url_for("notify.notify", lang=_preferred_lang()))
    if raw_lang is not None and lang is None:
        return redirect(url_for("notify.notify", lang="en"))
    return render_template("notify.html")
