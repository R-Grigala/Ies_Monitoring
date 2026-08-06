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

function buildEventIdLink(eventId, label) {
    const safeId = window.escapeHtml?.(eventId) ?? String(eventId ?? "");
    const safeLabel = window.escapeHtml?.(label) ?? String(label ?? "-");
    return `
        <button
            type="button"
            class="btn btn-link btn-sm p-0 text-decoration-none"
            data-view-id="${safeId}"
        >
            ${safeLabel}
        </button>
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
window.buildEventIdLink = buildEventIdLink;
window.viewEvent = viewEvent;
