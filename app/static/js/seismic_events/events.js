const eventsTableBody = document.getElementById("eventsTableBody");
const eventsStatus = document.getElementById("eventsStatus");
const eventsActionHeader = document.getElementById("eventsActionHeader");
const eventsById = new Map();
const getEventKey = (event) => String(event?.id ?? "");

let allEvents = [];
let canViewEvents = false;
let canManageEvents = false;

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

function getEventMagnitude(event) {
    const list = (Array.isArray(event?.magnitudes) ? event.magnitudes : []).filter(
        (item) => item.value !== null && item.value !== undefined
    );
    if (!list.length) {
        return null;
    }

    // ML always wins; otherwise fall back to the first recorded magnitude.
    const preferred =
        list.find((item) => (item.magnitude?.code || "").toUpperCase() === "ML") || list[0];

    return {
        value: Number(preferred.value),
        code: preferred.magnitude?.code || "",
    };
}

function getEventMl(event) {
    return getEventMagnitude(event)?.value ?? null;
}

function preferredLocation(event) {
    const lang = window.I18n?.getLanguage?.() || "en";
    if (lang === "ka") {
        return event.location_ge || event.location_en || event.area || "-";
    }
    return event.location_en || event.location_ge || event.area || "-";
}

function pad2(n) {
    return String(n).padStart(2, "0");
}

function toNaiveIsoString(year, month, day, hour = 0, minute = 0, second = 0) {
    return (
        `${year}-${pad2(month)}-${pad2(day)}T` +
        `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`
    );
}

function formatOriginTime(value) {
    if (!value) {
        return "-";
    }

    const raw = String(value).trim();
    const isoMatch = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (isoMatch) {
        return toNaiveIsoString(
            Number(isoMatch[1]),
            Number(isoMatch[2]),
            Number(isoMatch[3]),
            Number(isoMatch[4]),
            Number(isoMatch[5]),
            Number(isoMatch[6] ?? 0)
        );
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return raw;
    }
    return toNaiveIsoString(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
    );
}

function parseOriginTimeInput(value) {
    const raw = (value || "").trim();
    if (!raw) {
        return null;
    }

    // YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss (seconds optional)
    const isoLike = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
    );
    if (isoLike) {
        const year = Number(isoLike[1]);
        const month = Number(isoLike[2]);
        const day = Number(isoLike[3]);
        const hour = Number(isoLike[4] ?? 0);
        const minute = Number(isoLike[5] ?? 0);
        const second = Number(isoLike[6] ?? 0);
        const probe = new Date(year, month - 1, day, hour, minute, second);
        if (
            probe.getFullYear() !== year ||
            probe.getMonth() !== month - 1 ||
            probe.getDate() !== day ||
            probe.getHours() !== hour ||
            probe.getMinutes() !== minute ||
            probe.getSeconds() !== second
        ) {
            return null;
        }
        return toNaiveIsoString(year, month, day, hour, minute, second);
    }

    // dd/mm/yyyy, HH:mm:ss (comma optional; seconds optional)
    const dmy = raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (dmy) {
        const day = Number(dmy[1]);
        const month = Number(dmy[2]);
        const year = Number(dmy[3]);
        const hour = Number(dmy[4] ?? 0);
        const minute = Number(dmy[5] ?? 0);
        const second = Number(dmy[6] ?? 0);
        const probe = new Date(year, month - 1, day, hour, minute, second);
        if (
            probe.getFullYear() !== year ||
            probe.getMonth() !== month - 1 ||
            probe.getDate() !== day ||
            probe.getHours() !== hour ||
            probe.getMinutes() !== minute ||
            probe.getSeconds() !== second
        ) {
            return null;
        }
        return toNaiveIsoString(year, month, day, hour, minute, second);
    }

    return null;
}

function hasEventsPermission() {
    return canManageEvents === true;
}

async function requireEventsAuth(actionLabel = "perform this action") {
    let token = window.localStorage.getItem("access_token");
    if (!token) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("events.error.login", `Please log in to ${actionLabel}.`)
        );
        return false;
    }

    if (window.isTokenExpired?.(token)) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("alerts.session_expired", "Session has expired. Please sign in again.")
        );
        window.clearSessionData?.();
        return false;
    }

    if (!hasEventsPermission()) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("events.error.forbidden", `You do not have permission to ${actionLabel}.`)
        );
        return false;
    }

    return true;
}

let createEventGuardBound = false;

function bindCreateEventAuthGuard() {
    const createEventButton = document.getElementById("btnCreateEvent");
    if (!createEventButton) {
        return;
    }

    if (!canManageEvents) {
        createEventButton.classList.add("d-none");
        return;
    }

    createEventButton.classList.remove("d-none");

    if (createEventGuardBound) {
        return;
    }
    createEventGuardBound = true;

    createEventButton.addEventListener("click", async (event) => {
        event.preventDefault();
        if (!(await requireEventsAuth("add an earthquake"))) {
            return;
        }
        window.openCreateEventModal?.();
    });
}

function syncActionColumnVisibility() {
    if (!eventsActionHeader) {
        return;
    }
    eventsActionHeader.classList.remove("d-none");
}

function renderEvents(events) {
    syncActionColumnVisibility();

    if (!eventsTableBody || !eventsStatus) {
        return;
    }

    if (!Array.isArray(events) || events.length === 0) {
        eventsTableBody.innerHTML = "";
        eventsStatus.textContent = t("events.empty", "No events found.");
        return;
    }

    const sortedEvents = [...events].sort((a, b) => {
        const aTime = new Date(a.origin_time || 0).getTime();
        const bTime = new Date(b.origin_time || 0).getTime();
        return bTime - aTime;
    });

    eventsById.clear();
    sortedEvents.forEach((event) => eventsById.set(getEventKey(event), event));
    window.eventsById = eventsById;

    eventsTableBody.innerHTML = sortedEvents
        .map((event) => {
            const id = escapeHtml(event.id);
            const magnitude = getEventMagnitude(event);
            const magnitudeText =
                magnitude === null || Number.isNaN(magnitude.value)
                    ? "-"
                    : `${magnitude.value.toFixed(1)}${
                          magnitude.code ? ` ${magnitude.code}` : ""
                      }`;
            const depth =
                event.depth === null || event.depth === undefined
                    ? "-"
                    : Number(event.depth).toFixed(1);
            const lat =
                event.latitude === null || event.latitude === undefined
                    ? "-"
                    : Number(event.latitude).toFixed(4);
            const lon =
                event.longitude === null || event.longitude === undefined
                    ? "-"
                    : Number(event.longitude).toFixed(4);

            return `
      <tr data-event-id="${id}">
        <td>
          <div class="d-flex align-items-center justify-content-center gap-1">
            ${window.buildEventDetailsButton ? window.buildEventDetailsButton(event.id) : ""}
            ${window.buildViewEventButton ? window.buildViewEventButton(event.id) : ""}
            ${
                canManageEvents
                    ? `
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary edit-event-btn d-inline-flex align-items-center justify-content-center"
              data-edit-id="${id}"
              title="${t("events.table.edit", "Edit")}"
              aria-label="${t("events.table.edit", "Edit")}"
            >
              <i class="fa-solid fa-pen"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center"
              data-delete-id="${id}"
              title="${t("events.table.delete", "Delete")}"
              aria-label="${t("events.table.delete", "Delete")}"
            >
              <i class="fa-solid fa-trash"></i>
            </button>
            `
                    : ""
            }
          </div>
        </td>
        <td>
          ${
              window.buildEventIdLink
                  ? window.buildEventIdLink(event.id, event.id)
                  : escapeHtml(event.id)
          }
        </td>
        <td class="font-monospace">${escapeHtml(event.seiscomp_oid || "-")}</td>
        <td>${escapeHtml(formatOriginTime(event.origin_time))}</td>
        <td>${escapeHtml(magnitudeText)}</td>
        <td>${escapeHtml(depth)}</td>
        <td class="font-monospace">${escapeHtml(lat)}</td>
        <td class="font-monospace">${escapeHtml(lon)}</td>
        <td class="text-start">${escapeHtml(preferredLocation(event))}</td>
      </tr>
    `;
        })
        .join("");

    const loadedTemplate = t("events.loaded", "Loaded {count} earthquakes.");
    eventsStatus.textContent = loadedTemplate.replace(
        "{count}",
        String(sortedEvents.length)
    );
}

function renderEventsAndMap(events) {
    renderEvents(events);
    if (typeof window.updateMapMarkers === "function") {
        window.updateMapMarkers(Array.isArray(events) ? events : []);
    }
}

let filterRequestSeq = 0;

async function applyEventsFilter(filterState) {
    const requestId = ++filterRequestSeq;

    if (eventsStatus) {
        eventsStatus.textContent = t("events.loading", "Loading earthquakes...");
    }

    try {
        let data;
        if (!filterState || window.isEmptyEventsFilter?.(filterState)) {
            data = await window.makeApiRequest("/api/seismic_events/", {
                method: "GET",
            });
        } else {
            const payload = window.buildEventsFilterPayload(filterState);
            data = await window.makeApiRequest("/api/seismic_events/filter", {
                method: "POST",
                body: JSON.stringify(payload),
            });
        }

        if (requestId !== filterRequestSeq) {
            return;
        }

        allEvents = Array.isArray(data.items) ? data.items : [];
        window.updateAreaFilterOptions?.(allEvents);
        renderEventsAndMap(allEvents);
    } catch (error) {
        if (requestId !== filterRequestSeq) {
            return;
        }
        if (eventsTableBody) {
            eventsTableBody.innerHTML = "";
        }
        if (eventsStatus) {
            eventsStatus.textContent =
                error.message || t("events.error.load", "Failed to load earthquakes.");
        }
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("events.error.load", "Failed to load earthquakes.")
        );
    }
}

function onEventUpdated() {
    const currentFilter = window.getActiveEventsFilter?.() || null;
    applyEventsFilter(currentFilter);
}

function onEventDeleted() {
    const currentFilter = window.getActiveEventsFilter?.() || null;
    applyEventsFilter(currentFilter);
}

function onEventCreated(event) {
    if (!event?.id) {
        window.loadEvents?.();
        return;
    }
    onEventUpdated();
}

async function loadEvents() {
    if (eventsStatus) {
        eventsStatus.textContent = t("events.loading", "Loading earthquakes...");
    }

    try {
        const token = localStorage.getItem("access_token");
        if (!token || window.isTokenExpired?.(token)) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t("alerts.session_expired", "Session has expired. Please sign in again.")
            );
            window.clearSessionData?.();
            return;
        }

        const profile = await window.makeApiRequest("/api/accounts/ourself", {
            method: "GET",
        });
        canManageEvents = Boolean(profile?.can_event_edit);
        canViewEvents = canManageEvents || Boolean(profile?.can_event_view);
        window.canManageEvents = canManageEvents;
        window.canViewEvents = canViewEvents;

        if (!canViewEvents) {
            if (eventsTableBody) {
                eventsTableBody.innerHTML = "";
            }
            if (eventsStatus) {
                eventsStatus.textContent = t(
                    "events.error.forbidden",
                    "You do not have permission to manage earthquakes."
                );
            }
            document.getElementById("btnCreateEvent")?.classList.add("d-none");
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t(
                    "events.error.forbidden",
                    "You do not have permission to manage earthquakes."
                )
            );
            const i18n = window.I18n;
            window.location.href = i18n ? i18n.localizePath("/") : "/";
            return;
        }

        bindCreateEventAuthGuard();

        const currentFilter = window.getActiveEventsFilter?.() || null;
        await applyEventsFilter(currentFilter);
    } catch (error) {
        if (eventsTableBody) {
            eventsTableBody.innerHTML = "";
        }
        if (eventsStatus) {
            eventsStatus.textContent =
                error.message || t("events.error.load", "Failed to load earthquakes.");
        }
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("events.error.load", "Failed to load earthquakes.")
        );
    }
}

window.escapeHtml = escapeHtml;
window.formatOriginTime = formatOriginTime;
window.parseOriginTimeInput = parseOriginTimeInput;
window.getEventMl = getEventMl;
window.getEventMagnitude = getEventMagnitude;
window.requireEventsAuth = requireEventsAuth;
window.hasPermission = (code) => {
    if (code === "can_event_edit") {
        return canManageEvents;
    }
    if (code === "can_event_view") {
        return canViewEvents;
    }
    return false;
};
window.renderEvents = renderEvents;
window.renderEventsAndMap = renderEventsAndMap;
window.applyEventsFilter = applyEventsFilter;
window.loadEvents = loadEvents;
window.onEventUpdated = onEventUpdated;
window.onEventDeleted = onEventDeleted;
window.onEventCreated = onEventCreated;
window.eventsById = eventsById;

document.addEventListener("DOMContentLoaded", () => {
    eventsTableBody?.addEventListener("click", (event) => {
        const viewButton = event.target.closest("[data-view-id]");
        if (viewButton) {
            window.viewEvent?.(viewButton.dataset.viewId);
            return;
        }

        const editButton = event.target.closest("[data-edit-id]");
        if (editButton) {
            window.openEditEventModal?.(editButton.dataset.editId);
            return;
        }

        const deleteButton = event.target.closest("[data-delete-id]");
        if (deleteButton) {
            window.deleteEvent?.(deleteButton.dataset.deleteId);
        }
    });

    loadEvents().then(() => {
        const editId = new URLSearchParams(window.location.search).get("edit");
        if (editId && canManageEvents) {
            window.openEditEventModal?.(editId);
            const url = new URL(window.location.href);
            url.searchParams.delete("edit");
            window.history.replaceState({}, "", url.pathname + url.search);
        }
    });
});
