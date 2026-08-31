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
                item.value === null || item.value === undefined ? "" : Number(item.value);
            return `
        <div class="d-flex align-items-center gap-2" data-magnitude-id="${escapeHtml(item.id)}">
            <span class="badge text-bg-light border font-monospace">${escapeHtml(code)}</span>
            <input
                type="number"
                class="form-control form-control-sm"
                step="0.1"
                value="${escapeHtml(value)}"
                data-magnitude-value-for="${escapeHtml(item.id)}"
            >
            <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                data-magnitude-save="${escapeHtml(item.id)}"
                data-i18n="events.edit.magnitude_save"
            >
                Save
            </button>
            <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-magnitude-delete="${escapeHtml(item.id)}"
                data-i18n="events.edit.magnitude_delete"
            >
                Delete
            </button>
        </div>
    `;
        })
        .join("");

    window.I18n?.applyTranslations?.();
}

let editMagnitudeTypesLoaded = false;

async function loadEditMagnitudeTypes() {
    const select = document.getElementById("editEventMagnitudeCode");
    if (!select || editMagnitudeTypesLoaded) {
        return;
    }

    try {
        const data = await window.makeApiRequest("/api/seismic_events/magnitude_types", {
            method: "GET",
        });
        (Array.isArray(data.items) ? data.items : []).forEach((item) => {
            const option = document.createElement("option");
            option.value = item.code;
            option.textContent = item.code;
            if (item.description) {
                option.title = item.description;
            }
            select.appendChild(option);
        });
        editMagnitudeTypesLoaded = true;
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "warning",
            error.message ||
                t("events.create.magnitude_types_error", "Failed to load magnitude types.")
        );
    }
}

async function refreshEventMagnitudes(eventId) {
    const event = await window.makeApiRequest(`/api/seismic_events/${eventId}`, {
        method: "GET",
    });
    renderMagnitudesSummary(event.magnitudes);
    window.onEventUpdated?.(event);
}

async function addEventMagnitude() {
    const eventId = document.getElementById("editEventId")?.value;
    const code = document.getElementById("editEventMagnitudeCode")?.value || "";
    const rawValue = document.getElementById("editEventMagnitudeValue")?.value ?? "";

    if (!eventId) {
        return;
    }

    if (!code || rawValue === "") {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            t(
                "events.create.magnitude_incomplete",
                "Select both a magnitude type and its value, or leave both empty."
            )
        );
        return;
    }

    const addButton = document.getElementById("editEventMagnitudeAdd");
    addButton.disabled = true;
    clearEditEventAlert();

    try {
        await window.makeApiRequest(`/api/seismic_events/${eventId}/magnitudes`, {
            method: "POST",
            body: JSON.stringify({ value: Number(rawValue), magnitude_code: code }),
        });
        document.getElementById("editEventMagnitudeCode").value = "";
        document.getElementById("editEventMagnitudeValue").value = "";
        await refreshEventMagnitudes(eventId);
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            error.message || t("events.edit.magnitude_add_error", "Failed to add magnitude.")
        );
    } finally {
        addButton.disabled = false;
    }
}

async function saveEventMagnitude(eventMagnitudeId) {
    const eventId = document.getElementById("editEventId")?.value;
    const input = document.querySelector(
        `[data-magnitude-value-for="${eventMagnitudeId}"]`
    );
    const rawValue = input?.value ?? "";

    if (rawValue === "") {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            t("events.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    clearEditEventAlert();

    try {
        await window.makeApiRequest(`/api/seismic_events/magnitudes/${eventMagnitudeId}`, {
            method: "PUT",
            body: JSON.stringify({ value: Number(rawValue) }),
        });
        await refreshEventMagnitudes(eventId);
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            error.message ||
                t("events.edit.magnitude_update_error", "Failed to update magnitude.")
        );
    }
}

async function deleteEventMagnitude(eventMagnitudeId) {
    const eventId = document.getElementById("editEventId")?.value;

    const confirmed = await window.confirmDelete({
        message: t(
            "events.edit.magnitude_delete_confirm",
            "Are you sure you want to delete this magnitude?"
        ),
    });
    if (!confirmed) {
        return;
    }

    clearEditEventAlert();

    try {
        await window.makeApiRequest(`/api/seismic_events/magnitudes/${eventMagnitudeId}`, {
            method: "DELETE",
        });
        await refreshEventMagnitudes(eventId);
    } catch (error) {
        window.showAlert(
            EDIT_EVENT_ALERT_ID,
            "danger",
            error.message ||
                t("events.edit.magnitude_delete_error", "Failed to delete magnitude.")
        );
    }
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

function setAreaValue(area) {
    const select = document.getElementById("editEventArea");
    if (!select) {
        return;
    }

    const isKnown = [...select.options].some((option) => option.value === area);
    if (!isKnown && area) {
        // Keep legacy free-text areas selectable so editing does not silently drop them.
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.appendChild(option);
    }

    select.value = area;
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
    setAreaValue(event.area || "");
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
        await loadEditMagnitudeTypes();
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
    document
        .getElementById("editEventMagnitudeAdd")
        ?.addEventListener("click", addEventMagnitude);

    document.getElementById("editEventMagnitudes")?.addEventListener("click", (event) => {
        const saveButton = event.target.closest("[data-magnitude-save]");
        if (saveButton) {
            saveEventMagnitude(saveButton.dataset.magnitudeSave);
            return;
        }

        const deleteButton = event.target.closest("[data-magnitude-delete]");
        if (deleteButton) {
            deleteEventMagnitude(deleteButton.dataset.magnitudeDelete);
        }
    });
});
