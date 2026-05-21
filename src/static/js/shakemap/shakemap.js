const eventsTableBody = document.getElementById("eventsTableBody");
const eventsStatus = document.getElementById("eventsStatus");
const lastUpdated = document.getElementById("lastUpdated");
const totalEvents = document.getElementById("totalEvents");
const galleryModalElement = document.getElementById("galleryModal");
const galleryModalBody = document.getElementById("galleryModalBody");
const galleryModalLabel = document.getElementById("galleryModalLabel");
const galleryModal = galleryModalElement ? new bootstrap.Modal(galleryModalElement) : null;
const STATUS_POLL_INTERVAL_MS = 4000;
let statusPollTimer = null;

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
  const createEventButton = document.getElementById("btnCreateEventShakemap");
  const createEventModalElement = document.getElementById("createEventModal");
  if (!createEventButton) {
    return;
  }

  const canCreateEvents =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_events")
      : false;

  if (!canCreateEvents) {
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

// უსაფრთხო escape, რომ HTML ინექცია არ მოხდეს ცხრილში.
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// აბრუნებს ყველაზე ახალ created_at დროს ივენთების სიიდან.
function getLatestCreatedAt(events) {
  const latest = events.reduce((maxDate, event) => {
    const createdAt = new Date(event.created_at || 0);
    if (Number.isNaN(createdAt.getTime())) {
      return maxDate;
    }
    return createdAt > maxDate ? createdAt : maxDate;
  }, new Date(0));

  if (latest.getTime() === 0) {
    return "—";
  }

  return latest.toLocaleString();
}

// ShakeMap სტატუსის ვიზუალური წარმოდგენა ცხრილში.
function buildShakeMapStatusBadge(status) {
  switch (status) {
    case "generated":
      return '<span class="badge text-bg-success" title="Generated">generated</span>';
    case "waiting":
      return '<span class="badge text-bg-info text-dark" title="Queued">waiting</span>';
    case "running":
      return '<span class="badge text-bg-warning text-dark" title="Running"><i class="fas fa-spinner fa-spin me-1"></i>running</span>';
    case "failed":
      return '<span class="badge text-bg-danger" title="Failed">failed</span>';
    case "pending":
      return '<span class="badge text-bg-secondary" title="Not started">pending</span>';
    default:
      return '<span class="badge text-bg-secondary" title="Unknown status">unknown</span>';
  }
}

// როცა რომელიმე ივენთი waiting/running სტატუსშია, სია ავტომატურად ახლდება.
function scheduleRunningStatusPoll(shouldPoll) {
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
  if (!shouldPoll) {
    return;
  }
  statusPollTimer = window.setTimeout(() => {
    loadEvents();
  }, STATUS_POLL_INTERVAL_MS);
}

// გალერეის ღილაკებზე handler-ების მიბმა.
function bindGalleryButtons() {
  const buttons = document.querySelectorAll(".open-gallery-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      openGallery(button.dataset.seiscompOid);
    });
  });
}

// რეგენერაციის ღილაკებზე handler-ების მიბმა.
function bindRegenerateButtons() {
  const buttons = document.querySelectorAll(".regenerate-shakemap-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      await regenerateShakeMap(button);
    });
  });
}

// არჩევითი რეგენერაცია ცხრილიდან კონკრეტული OID-ით.
async function regenerateShakeMap(button) {
  const canRunShakeMap =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_shakemap")
      : false;
  if (!canRunShakeMap) {
    showAlert("alertPlaceholder", "danger", "You do not have permission to generate ShakeMap.");
    return;
  }

  const seiscompOid = button.dataset.seiscompOid;
  if (!seiscompOid) {
    showAlert("alertPlaceholder", "danger", "SeisComP OID is missing.");
    return;
  }

  const accessToken = window.localStorage.getItem("access_token");
  if (!accessToken) {
    showAlert("alertPlaceholder", "danger", "Authorization is required to generate ShakeMap.");
    return;
  }
  if (typeof window.makeApiRequest !== "function") {
    showAlert("alertPlaceholder", "danger", "Authorization module failed to load.");
    return;
  }

  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  eventsStatus.textContent = `ShakeMap generation started (${seiscompOid})...`;
  let statusMessageOverride = null;

  try {
    const requestHeaders = {
      "Content-Type": "application/json",
      accept: "application/json",
    };
    const payload = await window.makeApiRequest("/api/shakemap", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ seiscomp_oid: seiscompOid }),
    });
    if (!payload || payload.error) {
      statusMessageOverride = payload?.error || "Failed to generate ShakeMap.";
      showAlert("alertPlaceholder", "danger", statusMessageOverride);
      return;
    }

    showAlert("alertPlaceholder", "success", payload?.message || `ShakeMap job queued (${seiscompOid}).`);
    await loadEvents();
  } catch (error) {
    statusMessageOverride = "Request failed during ShakeMap generation.";
    showAlert("alertPlaceholder", "danger", statusMessageOverride);
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-rotate-right"></i>';
    // ოპერაციის შედეგის მიუხედავად ვაახლებთ სიას, რომ running -> generated/failed გადმოვიდეს.
    await loadEvents();
    if (statusMessageOverride) {
      eventsStatus.textContent = statusMessageOverride;
    }
  }
}

// seiscomp_oid-ის მიხედვით ShakeMap სურათების გამოტანა modal-ში.
async function openGallery(seiscompOid) {
  if (!galleryModal) {
    return;
  }

  galleryModalLabel.textContent = `ShakeMap gallery (${seiscompOid})`;
  galleryModalBody.innerHTML = '<p class="text-muted mb-0">Loading images...</p>';
  galleryModal.show();

  try {
    const response = await fetch(`/api/shakemap/${encodeURIComponent(seiscompOid)}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      galleryModalBody.innerHTML = `<div class="alert alert-danger mb-0">${
        escapeHtml(payload.error || "Failed to load gallery.")
      }</div>`;
      return;
    }

    const cards = payload.images
      .map((image) => {
        if (!image.exists) {
          return `
            <div class="col-md-4">
              <div class="card h-100">
                <div class="card-body d-flex align-items-center justify-content-center text-muted">
                  ${escapeHtml(image.filename)} does not exist
                </div>
              </div>
            </div>
          `;
        }

        return `
          <div class="col-md-4">
            <div class="d-flex align-items-center justify-content-center"> 
              <p class="card-text mb-0 text-center fw-semibold">${escapeHtml(image.filename)}</p>
            </div>
            <div class="card h-90 shadow-sm">
              <a
                href="${escapeHtml(image.url)}"
                target="_blank"
                rel="noopener noreferrer"
                title="Open full size in a new tab"
              >
                <img
                  src="${escapeHtml(image.url)}"
                  class="card-img-top"
                  alt="${escapeHtml(image.filename)}"
                  loading="lazy"
                  style="cursor: zoom-in;"
                >
              </a>

            </div>
          </div>
        `;
      })
      .join("");

    galleryModalBody.innerHTML = `
      <div class="mb-3">
        <span class="badge text-bg-secondary">products_path</span>
        <code class="ms-2">${escapeHtml(payload.products_path)}</code>
      </div>
      <div class="row g-3">
        ${cards}
      </div>
    `;
  } catch (error) {
    galleryModalBody.innerHTML = '<div class="alert alert-danger mb-0">Request failed while loading gallery.</div>';
  }
}

// ივენთების ცხრილის რენდერი და ზედა სტატუსების განახლება.
function renderEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    eventsTableBody.innerHTML = "";
    eventsStatus.textContent = "No events found.";
    totalEvents.textContent = "0";
    lastUpdated.textContent = "—";
    return;
  }

  const sortedEvents = [...events].sort((a, b) => {
    const aTime = new Date(a.origin_time || 0).getTime();
    const bTime = new Date(b.origin_time || 0).getTime();
    return bTime - aTime;
  });
  const canRunShakeMap =
    typeof window.hasPermission === "function"
      ? window.hasPermission("can_shakemap")
      : false;

  eventsTableBody.innerHTML = sortedEvents
    .map(
      (event) => `
      <tr>
        <td>
          ${buildShakeMapStatusBadge(event.shakemap_status)}
          ${
            canRunShakeMap
              ? `
          <button
            type="button"
            class="btn btn-sm btn-outline-warning ms-2 regenerate-shakemap-btn"
            data-seiscomp-oid="${escapeHtml(event.seiscomp_oid || "")}"
            title="Regenerate"
            ${
              event.seiscomp_oid &&
              !["running", "waiting"].includes(event.shakemap_status)
                ? ""
                : "disabled"
            }
          >
            <i class="fas fa-rotate-right"></i>
          </button>
          `
              : ""
          }
        </td>
        <td>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary open-gallery-btn"
            data-seiscomp-oid="${escapeHtml(event.seiscomp_oid)}"
            title="Gallery"
          >
            <i class="fas fa-images"></i>
          </button>
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

  const hasRunningStatus = sortedEvents.some((event) =>
    ["running", "waiting"].includes(event.shakemap_status)
  );
  eventsStatus.textContent = `Loaded ${sortedEvents.length} events.`;
  totalEvents.textContent = String(sortedEvents.length);
  lastUpdated.textContent = getLatestCreatedAt(sortedEvents);
  bindGalleryButtons();
  bindRegenerateButtons();
  scheduleRunningStatusPoll(hasRunningStatus);
}

// /api/events-დან მონაცემების წამოღება და UI-ის განახლება.
async function loadEvents() {
  eventsStatus.textContent = "Loading events...";

  try {
    const response = await fetch("/api/events", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok) {
      eventsTableBody.innerHTML = "";
      showAlert("alertPlaceholder", "danger", payload.error || "Failed to load events.");
      totalEvents.textContent = "—";
      lastUpdated.textContent = "—";
      return;
    }

    renderEvents(payload);
  } catch (error) {
    eventsTableBody.innerHTML = "";
    eventsStatus.textContent = "Request failed while loading events.";
    totalEvents.textContent = "—";
    lastUpdated.textContent = "—";
    scheduleRunningStatusPoll(true);
  }
}

// საწყისი ჩატვირთვა.
window.requireEventsAuth = requireEventsAuth;
window.loadEvents = loadEvents;
bindCreateEventAuthGuard();
loadEvents();
