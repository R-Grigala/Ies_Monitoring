import logging
import warnings

import requests
from flask import current_app
from urllib3.exceptions import InsecureRequestWarning

logger = logging.getLogger("app.wp_publish")


def _wp_ajax_url():
    return (current_app.config.get("WP_AJAX_URL") or "").strip()


def _wp_ssl_verify():
    return bool(current_app.config.get("WP_SSL_VERIFY", True))


def _post_wp_ajax(payload, timeout=20):
    url = _wp_ajax_url()
    if not url:
        raise RuntimeError("WP_AJAX_URL is not configured.")

    verify = _wp_ssl_verify()
    if not verify:
        logger.warning("WP SSL verification disabled (WP_SSL_VERIFY=false) for %s", url)
        warnings.simplefilter("ignore", InsecureRequestWarning)

    response = requests.post(url, data=payload, timeout=timeout, verify=verify)
    response.raise_for_status()
    return response.text.strip()


def _nullable(value):
    return "" if value is None else value


def publish_eq(
    *,
    eq_id,
    code,
    uccur_time,
    latitude,
    longitude,
    mag,
    mag_type,
    eq_type,
    depth,
    description_ge="",
    description_en="",
    region_ge="",
    region_en="",
    strike=None,
    dip=None,
    rake=None,
    important=0,
    timeout=20,
):
    """Publish or update earthquake in WordPress (action=insert_update_eq)."""
    payload = {
        "action": "insert_update_eq",
        "id": eq_id,
        "uccur_time": uccur_time,
        "latitude": latitude,
        "longitude": longitude,
        "mag": mag,
        "mag_type": mag_type,
        "type": eq_type,
        "depth": _nullable(depth),
        "description_ge": description_ge or "",
        "description_en": description_en or "",
        "region_ge": region_ge or "",
        "region_en": region_en or "",
        "strike": _nullable(strike),
        "dip": _nullable(dip),
        "rake": _nullable(rake),
        "important": important,
        "code": code,
    }
    return _post_wp_ajax(payload, timeout=timeout)


def unpublish_eq(*, eq_id, code, timeout=20):
    """Unpublish earthquake in WordPress (action=unpublish_eq)."""
    payload = {
        "action": "unpublish_eq",
        "id": eq_id,
        "code": code,
    }
    return _post_wp_ajax(payload, timeout=timeout)
