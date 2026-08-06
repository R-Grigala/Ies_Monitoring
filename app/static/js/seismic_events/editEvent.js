let editEventModal = null;

const EDIT_EVENT_ALERT_ID = "editEventAlertPlaceholder";

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

function ensureEditEventModal() {
    if (editEventModal) {
        return editEventModal;
    }
    const modalElement = document.getElementById("editEventModal");
    if (modalElement && window.bootstrap?.Modal) {
        editEventModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }
    return editEventModal;
}

function clearEditEventAlert() {
    const container = document.getElementById(EDIT_EVENT_ALERT_ID);
    if (container) {
        container.innerHTML = "";
    }
}

function toDatetimeLocalValue(isoValue) {
    if (!isoValue) {
        return "";
    }
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        "T",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes()),
        ":",
        pad(date.getSeconds()),
    ].join("");
}

function fromDatetimeLocalValue(localValue) {
    if (!localValue) {
        return null;
    }
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

function renderMagnitudesSummary(magnitudes) {
    const container = document.getElementById("editEventMagnitudes");
    if (!container) {
        return;
    }
    const list = Array.isArray(magnitudes) ? magnitudes : [];
    if (!list.length) {
        container.innerHTML = `<span class="text-muted small">${escapeHtml(
            t("events.edit.magnitudes_empty", "No magnitudes recorded.")
        )}</span>`;
        return;
    }
    container.innerHTML = list
        .map((item) => {
            const code = item.magnitude?.code || "?";
            const value =
                item.value === null || item.value === undefined ? "—" : Number(item.value).toFixed(2);
            return `<span class="badge text-bg-light border">${escapeHtml(code)}: ${escapeHtml(
                value
            )}</span>`;
        })
        .join("");
}

function renderBeachballSummary(beachball) {
    const container = document.getElementById("editEventBeachball");
    if (!container) {
        return;
    }
    if (!beachball) {
        container.textContent = t("events.edit.beachball_empty", "No beachball data.");
        return;
    }
    const parts = [
        beachball.strike !== null && beachball.strike !== undefined
            ? `strike ${beachball.strike}`
            : null,
        beachball.dip !== null && beachball.dip !== undefined ? `dip ${beachball.dip}` : null,
        beachball.rake !== null && beachball.rake !== undefined ? `rake ${beachball.rake}` : null,
        beachball.beachball_path || null,
    ].filter(Boolean);
    container.textContent = parts.length
        ? parts.join(" · ")
        : t("events.edit.beachball_empty", "No beachball data.");
}

function fillEventForm(event) {
    document.getElementById("editEventId").value = event.id || "";
    document.getElementById("editEventOriginTime").value = toDatetimeLocalValue(
        event.origin_time
    );
    document.getElementById("editEventDepth").value =
        event.depth === null || event.depth === undefined ? "" : event.depth;
    document.getElementById("editEventLatitude").value =
        event.latitude === null || event.latitude === undefined ? "" : event.latitude;
    document.getElementById("editEventLongitude").value =
        event.longitude === null || event.longitude === undefined ? "" : event.longitude;
    document.getElementById("editEventLocationGe").value = event.location_ge || "";
    document.getElementById("editEventLocationEn").value = event.location_en || "";
    document.getElementById("editEventArea").value = event.area || "";
    document.getElementById("editEventIesdataId").value = event.iesdata_id || "";
    document.getElementById("editEventSeiscompOid").value = event.seiscomp_oid || "";
    renderMagnitudesSummary(event.magnitudes);
    renderBeachballSummary(event.beachball);
}

async function openEditEventModal(eventId) {
    const modal = ensureEditEventModal();
    if (!modal) {
        window.showAlert?.(
            "alertPlaceholder",
            "danger",
            t("events.error.load_detail", "Failed to load earthquake details.")
        );
        return;
    }

    clearEditEventAlert();

    try {
        const event = await window.makeApiRequest(`/api/seismic_events/${eventId}`, {
            method: "GET",
        });
        fillEventForm(event);
        modal.show();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("events.error.load_detail", "Failed to load earthquake details.")
        );
    }
}

async function submitEditEventForm(formEvent) {
    formEvent.preventDefault();

    const eventId = document.getElementById("editEventId").value;
    const originTimeLocal = document.getElementById("editEventOriginTime").value;
    const latitude = document.getElementById("editEventLatitude").value;
    const longitude = document.getElementById("editEventLongitude").value;
    const depth = document.getElementById("editEventDepth").value;
    const submitButton = document.getElementById("editEventSubmit");

    const origin_time = fromDatetimeLocalValue(originTimeLocal);
    if (!eventId || !origin_time || latitude === "" || longitude === "") {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            t("events.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    submitButton.disabled = true;
    clearEditEventAlert();

    try {
        const payload = {
            origin_time,
            latitude: Number(latitude),
            longitude: Number(longitude),
            location_ge: document.getElementById("editEventLocationGe").value.trim() || null,
            location_en: document.getElementById("editEventLocationEn").value.trim() || null,
            area: document.getElementById("editEventArea").value.trim() || null,
            iesdata_id: document.getElementById("editEventIesdataId").value.trim() || null,
            seiscomp_oid: document.getElementById("editEventSeiscompOid").value.trim() || null,
        };
        if (depth !== "") {
            payload.depth = Number(depth);
        }

        const data = await window.makeApiRequest(`/api/seismic_events/${eventId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });

        const updated = data.event || data;
        window.onEventUpdated?.(updated);
        ensureEditEventModal()?.hide();
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("events.edit.success", "Earthquake updated successfully.")
        );
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            error.message || t("events.error.update", "Failed to update earthquake.")
        );
    } finally {
        submitButton.disabled = false;
    }
}

async function deleteEventFromModal() {
    const eventId = document.getElementById("editEventId").value;
    if (!eventId) {
        return;
    }

    const confirmed = await window.confirmDelete({
        message: t(
            "events.delete.confirm",
            "Are you sure you want to delete this earthquake?"
        ),
    });
    if (!confirmed) {
        return;
    }

    const deleteButton = document.getElementById("editEventDelete");
    deleteButton.disabled = true;

    try {
        const data = await window.makeApiRequest(`/api/seismic_events/${eventId}`, {
            method: "DELETE",
        });
        window.onEventDeleted?.(eventId);
        window.closeModal("editEventModal");
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("events.delete.success", "Earthquake deleted successfully.")
        );
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            error.message || t("events.error.delete", "Failed to delete earthquake.")
        );
    } finally {
        deleteButton.disabled = false;
    }
}

window.openEditEventModal = openEditEventModal;

document.addEventListener("DOMContentLoaded", () => {
    ensureEditEventModal();
    document
        .getElementById("editEventForm")
        ?.addEventListener("submit", submitEditEventForm);
    document
        .getElementById("editEventDelete")
        ?.addEventListener("click", deleteEventFromModal);
});
