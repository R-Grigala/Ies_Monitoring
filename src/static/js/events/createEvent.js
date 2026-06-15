const addEventForm = document.getElementById("addEventForm");
const addEventSubmitBtn = document.getElementById("addEventSubmitBtn");
const addEventStatus = document.getElementById("addEventStatus");

function buildCreateEventPayload() {
  const rawEventId = document.getElementById("eventIdInput").value.trim();
  return {
    event_id: rawEventId ? Number(rawEventId) : null,
    seiscomp_oid: document.getElementById("seiscompOidInput").value.trim(),
    origin_time: document.getElementById("originTimeInput").value.trim(),
    origin_msec: document.getElementById("originMsecInput").value
      ? Number(document.getElementById("originMsecInput").value)
      : null,
    latitude: Number(document.getElementById("latitudeInput").value),
    longitude: Number(document.getElementById("longitudeInput").value),
    depth: Number(document.getElementById("depthInput").value),
    location_ge: document.getElementById("locationGeInput").value.trim() || null,
    location_en: document.getElementById("locationEnInput").value.trim() || null,
    area: document.getElementById("areaInput").value.trim() || null,
    ml: Number(document.getElementById("mlInput").value),
  };
}

async function createEvent(event) {
  event.preventDefault();
  if (
    typeof window.requireEventsAuth === "function" &&
    !(await Promise.resolve(window.requireEventsAuth("Add earthquake")))
  ) {
    return;
  }

  const payload = buildCreateEventPayload();
  addEventSubmitBtn.disabled = true;
  addEventStatus.textContent = "Creating event...";
  addEventStatus.className = "small mt-3 text-muted";

  try {
    const data = await window.makeApiRequest("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!data || data.error) {
      const message = data?.error || "Failed to create event.";
      addEventStatus.textContent = message;
      addEventStatus.className = "small mt-3 text-danger";
      showAlert("alertPlaceholder", "danger", message);
      return;
    }

    const message = data.message || "Event created successfully.";
    addEventStatus.textContent = message;
    addEventStatus.className = "small mt-3 text-success";
    showAlert("alertPlaceholder", "success", message);
    addEventForm.reset();
    if (window.loadEvents) {
      await window.loadEvents();
    }
  } catch {
    const message = "Request failed while creating event.";
    addEventStatus.textContent = message;
    addEventStatus.className = "small mt-3 text-danger";
    showAlert("alertPlaceholder", "danger", message);
  } finally {
    addEventSubmitBtn.disabled = false;
  }
}

if (addEventForm) {
  addEventForm.addEventListener("submit", createEvent);
}
