function buildEventDetailsUrl(eventId) {
    const path = `/seismic_events/${eventId}`;
    return window.I18n?.localizePath?.(path) || path;
}

function buildViewEventButton(eventId) {
    if (eventId === null || eventId === undefined || eventId === "") {
        return "";
    }
    return `
        <button
            type="button"
            class="btn btn-sm btn-outline-primary d-inline-flex align-items-center justify-content-center"
            data-view-id="${window.escapeHtml?.(eventId) ?? eventId}"
            title="View on map"
            aria-label="View on map"
        >
            <i class="fa-solid fa-location-dot"></i>
        </button>
    `;
}

function buildEventDetailsButton(eventId) {
    if (eventId === null || eventId === undefined || eventId === "") {
        return "";
    }
    const href = buildEventDetailsUrl(eventId);
    const label = window.I18n?.t?.("events.table.details", "Details") || "Details";
    return `
        <a
            class="btn btn-sm btn-outline-info d-inline-flex align-items-center justify-content-center"
            href="${window.escapeHtml?.(href) ?? href}"
            title="${label}"
            aria-label="${label}"
        >
            <i class="fa-solid fa-circle-info"></i>
        </a>
    `;
}

function buildEventIdLink(eventId, label) {
    const safeId = window.escapeHtml?.(eventId) ?? String(eventId ?? "");
    const safeLabel = window.escapeHtml?.(label) ?? String(label ?? "-");
    const href = buildEventDetailsUrl(eventId);
    return `
        <a
            class="btn btn-link btn-sm p-0 text-decoration-none"
            href="${window.escapeHtml?.(href) ?? href}"
        >
            ${safeLabel}
        </a>
    `;
}

function focusEventRow(eventId) {
    const row = document.querySelector(`#eventsTableBody tr[data-event-id="${eventId}"]`);
    if (!row) {
        return;
    }
    row.classList.add("table-active");
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => row.classList.remove("table-active"), 1600);
}

function viewEvent(eventId) {
    if (eventId === null || eventId === undefined || eventId === "") {
        return;
    }
    window.focusEventOnMap?.(eventId);
    focusEventRow(eventId);
}

window.buildViewEventButton = buildViewEventButton;
window.buildEventDetailsButton = buildEventDetailsButton;
window.buildEventIdLink = buildEventIdLink;
window.buildEventDetailsUrl = buildEventDetailsUrl;
window.viewEvent = viewEvent;
