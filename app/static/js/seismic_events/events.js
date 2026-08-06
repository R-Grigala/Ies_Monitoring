const eventsTableBody = document.getElementById("eventsTableBody");
const eventsStatus = document.getElementById("eventsStatus");
const eventsActionHeader = document.getElementById("eventsActionHeader");
const eventsById = new Map();
const getEventKey = (event) => String(event?.id ?? "");

let allEvents = [];
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

function getEventMl(event) {
    const list = Array.isArray(event?.magnitudes) ? event.magnitudes : [];
    const ml = list.find((item) => {
        const code = (item.magnitude?.code || "").toUpperCase();
        return code === "ML";
    });
    if (ml && ml.value !== null && ml.value !== undefined) {
        return Number(ml.value);
    }
    if (list.length && list[0].value !== null && list[0].value !== undefined) {
        return Number(list[0].value);
    }
    return null;
}

function preferredLocation(event) {
    const lang = window.I18n?.getLanguage?.() || "en";
    if (lang === "ka") {
        return event.location_ge || event.location_en || event.area || "-";
    }
    return event.location_en || event.location_ge || event.area || "-";
}

function formatOriginTime(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    const lang = window.I18n?.getLanguage?.() || "en";
    return date.toLocaleString(lang === "ka" ? "ka-GE" : "en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
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
            const ml = getEventMl(event);
            const mlText = ml === null || Number.isNaN(ml) ? "-" : ml.toFixed(1);
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
        <td>${escapeHtml(mlText)}</td>
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

function applyEventsFilter(filterState) {
    const filtered = window.filterEventsList
        ? window.filterEventsList(allEvents, filterState)
        : allEvents;
    renderEventsAndMap(filtered);
}

function onEventUpdated(event) {
    if (!event?.id) {
        return;
    }
    const without = allEvents.filter((item) => Number(item.id) !== Number(event.id));
    allEvents = [event, ...without];
    const currentFilter = window.getActiveEventsFilter?.() || null;
    applyEventsFilter(currentFilter);
}

function onEventDeleted(eventId) {
    allEvents = allEvents.filter((item) => Number(item.id) !== Number(eventId));
    const currentFilter = window.getActiveEventsFilter?.() || null;
    applyEventsFilter(currentFilter);
}

function onEventCreated(event) {
    if (!event?.id) {
        window.loadEvents?.();
        return;
    }
    onEventUpdated(event);
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
        canManageEvents = Boolean(profile?.can_events);
        window.canManageEvents = canManageEvents;

        if (!canManageEvents) {
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

        const data = await window.makeApiRequest("/api/seismic_events/", {
            method: "GET",
        });
        allEvents = Array.isArray(data.items) ? data.items : [];
        const currentFilter = window.getActiveEventsFilter?.() || null;
        applyEventsFilter(currentFilter);
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
window.getEventMl = getEventMl;
window.requireEventsAuth = requireEventsAuth;
window.hasPermission = (code) =>
    code === "can_events" ? hasEventsPermission() : false;
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

    loadEvents();
});
