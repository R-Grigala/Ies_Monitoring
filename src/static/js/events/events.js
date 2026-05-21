const eventsTableBody = document.getElementById("eventsTableBody");
const eventsStatus = document.getElementById("eventsStatus");
const eventsById = new Map();

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function requireEventsAuth(actionLabel = "perform this action") {
  let token = window.localStorage.getItem("access_token");
  if (!token) {
    showAlert("alertPlaceholder", "danger", `Please log in to ${actionLabel}.`);
    return false;
  }

  if (typeof isTokenExpired === "function" && isTokenExpired(token)) {
    if (typeof refreshToken === "function") {
      const refreshedToken = await refreshToken();
      if (!refreshedToken) {
        showAlert("alertPlaceholder", "danger", `Please sign in again to ${actionLabel}.`);
        return false;
      }
      token = refreshedToken;
    } else {
      showAlert("alertPlaceholder", "danger", `Please sign in again to ${actionLabel}.`);
      return false;
    }
  }

  const hasEventsPermission =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_events")
      : true;

  if (typeof window.hasPermission === "function" && !hasEventsPermission) {
    showAlert("alertPlaceholder", "danger", `You do not have permission to ${actionLabel}.`);
    return false;
  }

  return true;
}

function bindCreateEventAuthGuard() {
  const createEventButton = document.getElementById("btnCreateEvent");
  const createEventModalElement = document.getElementById("createEventModal");
  if (!createEventButton) {
    return;
  }

  const canManageEvents =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_events")
      : false;

  if (!canManageEvents) {
    createEventButton.classList.add("d-none");
    return;
  }

  createEventButton.classList.remove("d-none");

  createEventButton.removeAttribute("data-bs-toggle");
  createEventButton.removeAttribute("data-bs-target");

  createEventButton.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!(await requireEventsAuth("add an earthquake"))) {
      if (createEventModalElement && typeof bootstrap !== "undefined") {
        bootstrap.Modal.getOrCreateInstance(createEventModalElement).hide();
      }
      return;
    }

    if (createEventModalElement && typeof bootstrap !== "undefined") {
      bootstrap.Modal.getOrCreateInstance(createEventModalElement).show();
    }
  });
}


function renderEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    eventsTableBody.innerHTML = "";
    eventsStatus.textContent = "No events found.";
    return;
  }

  const sortedEvents = [...events].sort((a, b) => {
    const aTime = new Date(a.origin_time || 0).getTime();
    const bTime = new Date(b.origin_time || 0).getTime();
    return bTime - aTime;
  });
  const canManageEvents =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_events")
      : false;
  eventsById.clear();
  sortedEvents.forEach((event) => eventsById.set(String(event.event_id), event));
  window.eventsById = eventsById;

  eventsTableBody.innerHTML = sortedEvents
    .map(
      (event) => `
      <tr>
        <td>
          ${
            canManageEvents
              ? `
          <div class="d-flex align-items-center gap-1">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary edit-event-btn d-inline-flex align-items-center justify-content-center"
              onclick="openEditEventModal('${escapeHtml(event.event_id)}')"
              title="Edit event"
              aria-label="Edit event"
            >
              <img
                src="/static/img/pen-solid.svg"
                alt="Edit"
                style="width: 14px; height: 14px;"
              >
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger d-inline-flex align-items-center justify-content-center"
              onclick="deleteEvent('${escapeHtml(event.event_id)}')"
              title="Delete event"
              aria-label="Delete event"
            >
              <img
                src="/static/img/trash-solid.svg"
                alt="Delete"
                style="width: 14px; height: 14px;"
              >
            </button>
          </div>
          `
              : ""
          }
        </td>
        <td>${escapeHtml(event.event_id)}</td>
        <td>${escapeHtml(event.seiscomp_oid)}</td>
        <td>${escapeHtml(event.origin_time)}</td>
        <td>${escapeHtml(event.ml)}</td>
        <td>${escapeHtml(event.depth)}</td>
        <td>${escapeHtml(event.latitude)}</td>
        <td>${escapeHtml(event.longitude)}</td>
        <td>${escapeHtml(event.location_en || event.location_ge || event.area || "-")}</td>
      </tr>
    `
    )
    .join("");

  eventsStatus.textContent = `Loaded ${sortedEvents.length} earthquakes.`;
}

function renderEventsAndMap(events) {
  renderEvents(events);
  if (typeof window.updateMapMarkers === "function") {
    window.updateMapMarkers(Array.isArray(events) ? events : []);
  }
}

async function loadEvents() {
  eventsStatus.textContent = "Loading earthquakes...";

  try {
    const response = await fetch("/api/events", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      eventsTableBody.innerHTML = "";
      eventsStatus.textContent = payload.error || "Failed to load earthquakes.";
      return;
    }

    renderEventsAndMap(Array.isArray(payload) ? payload : []);
  } catch {
    eventsTableBody.innerHTML = "";
    eventsStatus.textContent = "Request failed while loading earthquakes.";
  }
}
window.escapeHtml = escapeHtml;
window.requireEventsAuth = requireEventsAuth;
window.renderEvents = renderEvents;
window.renderEventsAndMap = renderEventsAndMap;
window.loadEvents = loadEvents;

document.addEventListener("DOMContentLoaded", () => {
  bindCreateEventAuthGuard();
  loadEvents();
});
