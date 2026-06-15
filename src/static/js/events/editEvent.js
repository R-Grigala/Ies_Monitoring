const editEventForm = document.getElementById("editEventForm");
const editEventSubmitBtn = document.getElementById("editEventSubmitBtn");
const editEventStatus = document.getElementById("editEventStatus");
const editEventModalElement = document.getElementById("editEventModal");
const editEventModal = editEventModalElement ? new bootstrap.Modal(editEventModalElement) : null;

function buildEditEventPayload() {
  const rawEventId = document.getElementById("editEventIdInput").value.trim();
  return {
    event_id: rawEventId ? Number(rawEventId) : null,
    seiscomp_oid: document.getElementById("editSeiscompOidInput").value.trim(),
    origin_time: document.getElementById("editOriginTimeInput").value.trim(),
    origin_msec: document.getElementById("editOriginMsecInput").value
      ? Number(document.getElementById("editOriginMsecInput").value)
      : null,
    latitude: Number(document.getElementById("editLatitudeInput").value),
    longitude: Number(document.getElementById("editLongitudeInput").value),
    depth: Number(document.getElementById("editDepthInput").value),
    location_ge: document.getElementById("editLocationGeInput").value.trim() || null,
    location_en: document.getElementById("editLocationEnInput").value.trim() || null,
    area: document.getElementById("editAreaInput").value.trim() || null,
    ml: Number(document.getElementById("editMlInput").value),
  };
}

window.openEditEventModal = function openEditEventModal(eventId) {
  const eventMap = window.eventsById;
  const event = eventMap?.get(String(eventId));
  if (!event || !editEventModal) {
    return;
  }

  document.getElementById("editEventIdInput").value = event.event_id ?? "";
  document.getElementById("editSeiscompOidInput").value = event.seiscomp_oid ?? "";
  document.getElementById("editOriginTimeInput").value = event.origin_time ?? "";
  document.getElementById("editOriginMsecInput").value = event.origin_msec ?? "";
  document.getElementById("editLatitudeInput").value = event.latitude ?? "";
  document.getElementById("editLongitudeInput").value = event.longitude ?? "";
  document.getElementById("editDepthInput").value = event.depth ?? "";
  document.getElementById("editMlInput").value = event.ml ?? "";
  document.getElementById("editLocationGeInput").value = event.location_ge ?? "";
  document.getElementById("editLocationEnInput").value = event.location_en ?? "";
  document.getElementById("editAreaInput").value = event.area ?? "";
  editEventForm.dataset.rowId = String(event.id);
  editEventStatus.textContent = "";
  editEventStatus.className = "small mt-3 text-muted";

  editEventModal.show();
};

async function submitEditEvent(event) {
  event.preventDefault();
  if (
    typeof window.requireEventsAuth === "function" &&
    !(await Promise.resolve(window.requireEventsAuth("Edit event")))
  ) {
    return;
  }

  const payload = buildEditEventPayload();
  const rowId = editEventForm?.dataset?.rowId;
  if (!rowId) {
    const message = "Missing event id for update.";
    editEventStatus.textContent = message;
    editEventStatus.className = "small mt-3 text-danger";
    showAlert("alertPlaceholder", "danger", message);
    return;
  }
  editEventSubmitBtn.disabled = true;
  editEventStatus.textContent = "Updating event...";
  editEventStatus.className = "small mt-3 text-muted";

  try {
    const data = await window.makeApiRequest(`/api/events/${encodeURIComponent(rowId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!data || data.error) {
      const message = data?.error || "Failed to update event.";
      editEventStatus.textContent = message;
      editEventStatus.className = "small mt-3 text-danger";
      showAlert("alertPlaceholder", "danger", message);
      return;
    }

    const message = data.message || "Event updated successfully.";
    editEventStatus.textContent = message;
    editEventStatus.className = "small mt-3 text-success";
    showAlert("alertPlaceholder", "success", message);

    if (window.loadEvents) {
      await window.loadEvents();
    }
    closeModal("editEventModal");
  } catch {
    const message = "Request failed while updating event.";
    editEventStatus.textContent = message;
    editEventStatus.className = "small mt-3 text-danger";
    showAlert("alertPlaceholder", "danger", message);
  } finally {
    editEventSubmitBtn.disabled = false;
  }
}

if (editEventForm) {
  editEventForm.addEventListener("submit", submitEditEvent);
}
