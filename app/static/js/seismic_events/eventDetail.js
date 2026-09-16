function buildEventDetailsUrl(eventId) {
    const path = `/seismic_events/${eventId}`;
    return window.I18n?.localizePath?.(path) || path;
}

function buildEventDetailsButton(eventId) {
    if (eventId === null || eventId === undefined || eventId === "") {
        return "";
    }
    const href = buildEventDetailsUrl(eventId);
    const label = window.I18n?.t?.("events.table.details", "Details") || "Details";
    return `
        <a
            class="btn btn-sm btn-outline-primary events-action-btn"
            href="${window.escapeHtml?.(href) ?? href}"
            title="${label}"
            aria-label="${label}"
        >
            <i class="fa-solid fa-circle-info"></i>
        </a>
    `;
}

function buildEventIdLink(eventId, label) {
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

window.buildEventDetailsButton = buildEventDetailsButton;
window.buildEventIdLink = buildEventIdLink;
window.buildEventDetailsUrl = buildEventDetailsUrl;
