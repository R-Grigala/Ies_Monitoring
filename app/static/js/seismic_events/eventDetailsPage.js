const EVENT_DETAILS_ALERT_ID = "eventDetailsAlertPlaceholder";

let detailMap = null;
let detailMapMarker = null;

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatOriginTime(value) {
    if (!value) {
        return "—";
    }
    const raw = String(value).trim();
    const isoMatch = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (isoMatch) {
        const pad = (n) => String(n).padStart(2, "0");
        return (
            `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T` +
            `${pad(Number(isoMatch[4]))}:${pad(Number(isoMatch[5]))}:${pad(
                Number(isoMatch[6] ?? 0)
            )}`
        );
    }
    return raw;
}

function preferredLocation(event) {
    const lang = window.I18n?.getLanguage?.() || "en";
    if (lang === "ka") {
        return event.location_ge || event.location_en || event.area || event.seiscomp_oid || `#${event.id}`;
    }
    return event.location_en || event.location_ge || event.area || event.seiscomp_oid || `#${event.id}`;
}

function formatArea(area) {
    if (!area) {
        return t("events.area.unset", "Not specified");
    }
    return t(`events.area.${area}`, area);
}

function getPreferredMagnitude(event) {
    const list = (Array.isArray(event?.magnitudes) ? event.magnitudes : []).filter(
        (item) => item.value !== null && item.value !== undefined
    );
    if (!list.length) {
        return null;
    }
    const preferred =
        list.find((item) => (item.magnitude?.code || "").toUpperCase() === "ML") || list[0];
    return {
        value: Number(preferred.value),
        code: preferred.magnitude?.code || "",
    };
}

function displayOrDash(value) {
    return value === null || value === undefined || value === "" ? "—" : value;
}

function metadataItem(label, value, monospace = false) {
    return `
        <div class="metadata-item">
            <div class="event-summary-label">${escapeHtml(label)}</div>
            <div class="event-summary-value ${monospace ? "font-monospace" : ""}">${escapeHtml(
                displayOrDash(value)
            )}</div>
        </div>
    `;
}

function renderSummary(event) {
    const container = document.getElementById("eventDetailsSummary");
    const title = document.getElementById("eventDetailsTitle");
    if (title) {
        title.textContent = `${t("events.details.event_prefix", "Event")}: ${preferredLocation(event)}`;
    }
    if (!container) {
        return;
    }

    const magnitude = getPreferredMagnitude(event);
    const magnitudeHtml = magnitude
        ? `${escapeHtml(magnitude.value.toFixed(1))}<span class="event-summary-unit">${escapeHtml(
              magnitude.code || "ML"
          )}</span>`
        : "—";
    const depthHtml =
        event.depth === null || event.depth === undefined
            ? "—"
            : `${escapeHtml(Number(event.depth).toFixed(1))} <span class="event-summary-unit">km</span>`;
    const latLon =
        event.latitude === null ||
        event.latitude === undefined ||
        event.longitude === null ||
        event.longitude === undefined
            ? "—"
            : `${Number(event.latitude).toFixed(4)}, ${Number(event.longitude).toFixed(4)}`;

    container.innerHTML = `
        <div class="event-summary-grid">
            <div class="event-summary-item">
                <div class="event-summary-label" data-i18n="events.edit.origin_time">Origin Time (ISO 8601)</div>
                <div class="event-summary-value">${escapeHtml(formatOriginTime(event.origin_time))}</div>
            </div>
            <div class="event-summary-item">
                <div class="event-summary-label" data-i18n="events.table.ml">Magnitude</div>
                <div class="event-summary-value">${magnitudeHtml}</div>
            </div>
            <div class="event-summary-item">
                <div class="event-summary-label" data-i18n="events.edit.depth">Depth (km)</div>
                <div class="event-summary-value">${depthHtml}</div>
            </div>
            <div class="event-summary-item">
                <div class="event-summary-label" data-i18n="events.details.lat_lon">Lat / Lon</div>
                <div class="event-summary-value font-monospace">${escapeHtml(latLon)}</div>
            </div>
            <div class="event-summary-item">
                <div class="event-summary-label" data-i18n="events.table.id">Event ID</div>
                <div class="event-summary-value">${escapeHtml(event.id)}</div>
            </div>
        </div>
        <div class="event-summary-meta">
            <span class="text-muted">
                SeisComP OID:
                <code>${escapeHtml(event.seiscomp_oid || "—")}</code>
            </span>
            <span class="text-muted">
                IES data ID:
                <code>${escapeHtml(event.iesdata_id || "—")}</code>
            </span>
            <span class="badge ${event.is_automatic ? "text-bg-info text-dark" : "text-bg-secondary"}">
                ${escapeHtml(
                    event.is_automatic
                        ? t("events.details.automatic", "Automatic")
                        : t("events.details.manual", "Manual")
                )}
            </span>
        </div>
    `;
}

function renderOverview(event) {
    const container = document.getElementById("eventDetailsOverview");
    if (!container) {
        return;
    }

    container.innerHTML = [
        metadataItem(t("events.table.id", "Event ID"), event.id),
        metadataItem(t("events.edit.iesdata_id", "IES data ID"), event.iesdata_id, true),
        metadataItem(t("events.edit.seiscomp_oid", "SeisComP OID"), event.seiscomp_oid, true),
        metadataItem(
            t("events.edit.origin_time", "Origin Time (ISO 8601)"),
            formatOriginTime(event.origin_time),
            true
        ),
        metadataItem(
            t("events.edit.depth", "Depth (km)"),
            event.depth === null || event.depth === undefined
                ? "—"
                : Number(event.depth).toFixed(1)
        ),
        metadataItem(
            t("events.edit.latitude", "Latitude"),
            event.latitude === null || event.latitude === undefined
                ? "—"
                : Number(event.latitude).toFixed(4),
            true
        ),
        metadataItem(
            t("events.edit.longitude", "Longitude"),
            event.longitude === null || event.longitude === undefined
                ? "—"
                : Number(event.longitude).toFixed(4),
            true
        ),
        metadataItem(t("events.edit.location_ge", "Location GE"), event.location_ge),
        metadataItem(t("events.edit.location_en", "Location EN"), event.location_en),
        metadataItem(t("events.edit.area", "Area"), formatArea(event.area)),
        metadataItem(
            t("events.details.is_automatic", "Automatic"),
            event.is_automatic ? t("events.details.yes", "Yes") : t("events.details.no", "No")
        ),
        metadataItem(
            t("events.details.created_at", "Created at"),
            formatOriginTime(event.created_at),
            true
        ),
    ].join("");
}

function renderMagnitudes(magnitudes) {
    const container = document.getElementById("eventDetailsMagnitudes");
    if (!container) {
        return;
    }

    const list = Array.isArray(magnitudes) ? magnitudes : [];
    if (!list.length) {
        container.innerHTML = `<p class="text-muted mb-0">${escapeHtml(
            t("events.edit.magnitudes_empty", "No magnitudes recorded.")
        )}</p>`;
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th data-i18n="events.create.magnitude_type">Magnitude type</th>
                        <th data-i18n="events.create.magnitude_value">Magnitude value</th>
                    </tr>
                </thead>
                <tbody>
                    ${list
                        .map((item) => {
                            const code = item.magnitude?.code || "—";
                            const value =
                                item.value === null || item.value === undefined
                                    ? "—"
                                    : Number(item.value).toFixed(1);
                            return `
                                <tr>
                                    <td class="font-monospace">${escapeHtml(code)}</td>
                                    <td>${escapeHtml(value)}</td>
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderBeachball(beachball) {
    const container = document.getElementById("eventDetailsBeachball");
    if (!container) {
        return;
    }

    if (!beachball) {
        container.innerHTML = `<p class="text-muted mb-0">${escapeHtml(
            t("events.edit.beachball_empty", "No beachball data.")
        )}</p>`;
        return;
    }

    const cacheBust = Date.now();
    const imageHtml = beachball.beachball_path
        ? `
            <div class="text-center mb-3">
                <img
                    src="${escapeHtml(beachball.beachball_path)}?t=${cacheBust}"
                    alt="Beachball"
                    class="img-fluid event-details-beachball-img"
                >
            </div>
        `
        : "";

    container.innerHTML = `
        <div class="beachball-panel">
            ${imageHtml}
            <div class="metadata-grid">
                ${metadataItem(t("events.edit.beachball_strike", "Strike"), beachball.strike)}
                ${metadataItem(t("events.edit.beachball_dip", "Dip"), beachball.dip)}
                ${metadataItem(t("events.edit.beachball_rake", "Rake"), beachball.rake)}
            </div>
        </div>
    `;
}

function renderDetailMap(event) {
    if (typeof L === "undefined") {
        return;
    }

    const mapElement = document.getElementById("eventDetailsMap");
    if (!mapElement) {
        return;
    }

    const lat = Number(event.latitude);
    const lon = Number(event.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
        mapElement.innerHTML = `<p class="text-muted mb-0 p-3">${escapeHtml(
            t("events.details.map_unavailable", "Map coordinates are unavailable.")
        )}</p>`;
        return;
    }

    if (!detailMap) {
        detailMap = L.map(mapElement, {
            zoomControl: true,
            attributionControl: true,
        }).setView([lat, lon], 9);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap",
        }).addTo(detailMap);
    } else {
        detailMap.setView([lat, lon], Math.max(detailMap.getZoom(), 9));
    }

    if (detailMapMarker) {
        detailMap.removeLayer(detailMapMarker);
    }

    detailMapMarker = L.circleMarker([lat, lon], {
        radius: 8,
        color: "#0d6efd",
        weight: 1,
        fillColor: "#0d6efd",
        fillOpacity: 0.8,
    }).addTo(detailMap);

    const magnitude = getPreferredMagnitude(event);
    const magText = magnitude
        ? `${magnitude.value.toFixed(1)}${magnitude.code ? ` ${magnitude.code}` : ""}`
        : "—";
    detailMapMarker.bindPopup(`
        <div class="small">
            <div><strong>#${escapeHtml(event.id)}</strong></div>
            <div>${escapeHtml(formatOriginTime(event.origin_time))}</div>
            <div>${escapeHtml(magText)}</div>
            <div>${escapeHtml(preferredLocation(event))}</div>
        </div>
    `);

    setTimeout(() => detailMap?.invalidateSize(), 120);
}

function invalidateDetailMap() {
    setTimeout(() => detailMap?.invalidateSize(), 80);
}

function goToEventsList() {
    const path = window.I18n?.localizePath?.("/seismic_events") || "/seismic_events";
    window.location.href = path;
}

function applyEventToPage(event, canManage) {
    document.title = `IES Monitoring | Event ${event.id}`;
    renderSummary(event);
    renderOverview(event);
    renderMagnitudes(event.magnitudes);
    renderBeachball(event.beachball);
    renderDetailMap(event);
    renderActions(event, canManage);
    window.I18n?.applyTranslations?.();
}

function renderActions(event, canManage) {
    const container = document.getElementById("eventDetailsActions");
    if (!container) {
        return;
    }

    if (!canManage) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <button
            type="button"
            class="btn btn-outline-secondary"
            id="eventDetailsEditBtn"
            data-i18n="events.table.edit"
        >
            Edit
        </button>
        <button
            type="button"
            class="btn btn-outline-danger"
            id="eventDetailsDeleteBtn"
            data-i18n="events.table.delete"
        >
            Delete
        </button>
    `;
    window.I18n?.applyTranslations?.();

    document.getElementById("eventDetailsEditBtn")?.addEventListener("click", () => {
        window.openEditEventModal?.(event.id);
    });

    document.getElementById("eventDetailsDeleteBtn")?.addEventListener("click", async () => {
        const confirmed = await window.confirmDelete?.({
            message: t(
                "events.delete.confirm",
                "Are you sure you want to delete this earthquake?"
            ),
        });
        if (!confirmed) {
            return;
        }

        try {
            await window.makeApiRequest(`/api/seismic_events/${event.id}`, {
                method: "DELETE",
            });
            goToEventsList();
        } catch (error) {
            window.showAlert(
                EVENT_DETAILS_ALERT_ID,
                "danger",
                error.message || t("events.error.delete", "Failed to delete earthquake.")
            );
        }
    });
}

function showContent() {
    document.getElementById("eventDetailsLoading")?.classList.add("d-none");
    document.getElementById("eventDetailsContent")?.classList.remove("d-none");
    invalidateDetailMap();
}

function showLoadingError(message) {
    document.getElementById("eventDetailsLoading")?.classList.add("d-none");
    window.showAlert(EVENT_DETAILS_ALERT_ID, "danger", message);
}

async function loadEventDetails() {
    const page = document.getElementById("eventDetailsPage");
    const eventId = page?.dataset?.eventId;
    if (!eventId) {
        showLoadingError(t("events.error.load_detail", "Failed to load event details."));
        return;
    }

    try {
        const token = localStorage.getItem("access_token");
        if (!token || window.isTokenExpired?.(token)) {
            window.showAlert(
                EVENT_DETAILS_ALERT_ID,
                "danger",
                t("alerts.session_expired", "Session has expired. Please sign in again.")
            );
            window.clearSessionData?.();
            document.getElementById("eventDetailsLoading")?.classList.add("d-none");
            return;
        }

        const profile = await window.makeApiRequest("/api/accounts/ourself", {
            method: "GET",
        });
        const canManage = Boolean(profile?.can_event_edit);
        const canView = canManage || Boolean(profile?.can_event_view);

        if (!canView) {
            showLoadingError(
                t(
                    "events.error.forbidden",
                    "You do not have permission to manage earthquakes."
                )
            );
            const i18n = window.I18n;
            window.location.href = i18n ? i18n.localizePath("/") : "/";
            return;
        }

        const event = await window.makeApiRequest(`/api/seismic_events/${eventId}`, {
            method: "GET",
        });

        window.onEventUpdated = (updated) => {
            if (!updated?.id) {
                loadEventDetails();
                return;
            }
            applyEventToPage(updated, canManage);
        };
        window.onEventDeleted = () => {
            goToEventsList();
        };

        applyEventToPage(event, canManage);
        showContent();
    } catch (error) {
        showLoadingError(
            error.message || t("events.error.load_detail", "Failed to load event details.")
        );
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("tab-map")?.addEventListener("shown.bs.tab", () => {
        invalidateDetailMap();
    });
    loadEventDetails();
});
