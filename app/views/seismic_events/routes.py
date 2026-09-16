from flask import Blueprint, redirect, render_template, request, url_for

from app.config import Config

seismic_events_blueprint = Blueprint(
    "seismic_events",
    __name__,
    template_folder=Config.TEMPLATES_FOLDERS + "/seismic_events",
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


@seismic_events_blueprint.route("/seismic_events")
@seismic_events_blueprint.route("/<lang>/seismic_events")
def events(lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(url_for("seismic_events.events", lang=_preferred_lang()))
    if raw_lang is not None and lang is None:
        return redirect(url_for("seismic_events.events", lang="en"))
    return render_template("events.html")


@seismic_events_blueprint.route("/seismic_events/<int:event_id>")
@seismic_events_blueprint.route("/<lang>/seismic_events/<int:event_id>")
def event_details(event_id, lang=None):
    raw_lang = lang
    lang = _normalized_lang(lang)
    if raw_lang is None:
        return redirect(
            url_for(
                "seismic_events.event_details",
                lang=_preferred_lang(),
                event_id=event_id,
            )
        )
    if raw_lang is not None and lang is None:
        return redirect(
            url_for("seismic_events.event_details", lang="en", event_id=event_id)
        )
    return render_template("eventDetails.html", event_id=event_id)
