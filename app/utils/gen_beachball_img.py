"""Generate and remove ObsPy beachball PNGs for seismic events."""

from __future__ import annotations

import logging
from pathlib import Path

# Headless-safe backend before matplotlib / ObsPy imaging imports.
import matplotlib

matplotlib.use("Agg")

from obspy.imaging.beachball import beachball
import matplotlib.pyplot as plt

from app.config import Config

logger = logging.getLogger("app.beachball")

BEACHBALL_DIRNAME = "beachballs"
BEACHBALL_WIDTH = 300
BEACHBALL_FACECOLOR = "#f51441"
BEACHBALL_LINEWIDTH = 3
BEACHBALL_ALPHA = 1.0


def get_beachballs_dir() -> Path:
    directory = Path(Config.BASE_DIR) / "app" / "static" / BEACHBALL_DIRNAME
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def beachball_filename(event_id: int) -> str:
    return f"beachball_{int(event_id)}.png"


def beachball_fs_path(event_id: int) -> Path:
    return get_beachballs_dir() / beachball_filename(event_id)


def beachball_web_path(event_id: int) -> str:
    return f"/static/{BEACHBALL_DIRNAME}/{beachball_filename(event_id)}"


def has_complete_mechanism(strike, dip, rake) -> bool:
    return strike is not None and dip is not None and rake is not None


def generate_beachball_image(event_id: int, strike: float, dip: float, rake: float) -> str:
    """
    Render beachball PNG for an event and return the public web path.

    Overwrites any existing file for the same event_id.
    """
    if not has_complete_mechanism(strike, dip, rake):
        raise ValueError("strike, dip, and rake are all required to generate a beachball image.")

    outfile = beachball_fs_path(event_id)
    try:
        beachball(
            [float(strike), float(dip), float(rake)],
            outfile=str(outfile),
            width=BEACHBALL_WIDTH,
            alpha=BEACHBALL_ALPHA,
            facecolor=BEACHBALL_FACECOLOR,
            format="png",
            linewidth=BEACHBALL_LINEWIDTH,
        )
    finally:
        plt.close("all")
    web_path = beachball_web_path(event_id)
    logger.info("Beachball image written: event_id=%s path=%s", event_id, web_path)
    return web_path


def delete_beachball_image(event_id: int) -> None:
    """Remove generated PNG for an event if it exists."""
    path = beachball_fs_path(event_id)
    try:
        if path.is_file():
            path.unlink()
            logger.info("Beachball image deleted: event_id=%s path=%s", event_id, path)
    except OSError as err:
        logger.warning("Could not delete beachball image for event_id=%s: %s", event_id, err)


def sync_beachball_image(event_id: int, strike, dip, rake) -> str | None:
    """
    Generate image when mechanism is complete; otherwise leave file as-is and return None.

    Returns web path when generated, else None (caller should only set path when not None,
    or clear path if incomplete and desired).
    """
    if not has_complete_mechanism(strike, dip, rake):
        return None
    return generate_beachball_image(event_id, strike, dip, rake)
