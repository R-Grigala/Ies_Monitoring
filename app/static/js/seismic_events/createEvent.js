let createEventModal = null;
const CREATE_EVENT_ALERT_ID = "createEventAlertPlaceholder";

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function clearCreateEventAlert() {
    const container = document.getElementById(CREATE_EVENT_ALERT_ID);
    if (container) {
        container.innerHTML = "";
    }
}

function ensureCreateEventModal() {
    if (createEventModal) {
        return createEventModal;
    }
    const modalElement = document.getElementById("createEventModal");
    if (modalElement && window.bootstrap?.Modal) {
        createEventModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }
    return createEventModal;
}

function openCreateEventModal() {
    document.getElementById("createEventForm")?.reset();
    clearCreateEventAlert();
    ensureCreateEventModal()?.show();
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

async function maybeAttachMl(eventId, mlValue) {
    if (mlValue === "" || mlValue === null || mlValue === undefined) {
        return;
    }
    const value = Number(mlValue);
    if (Number.isNaN(value)) {
        return;
    }
    await window.makeApiRequest(`/api/seismic_events/${eventId}/magnitudes`, {
        method: "POST",
        body: JSON.stringify({
            value,
            magnitude_code: "ML",
        }),
    });
}

async function submitCreateEventForm(formEvent) {
    formEvent.preventDefault();

    const origin_time = fromDatetimeLocalValue(
        document.getElementById("createEventOriginTime")?.value
    );
    const latitude = document.getElementById("createEventLatitude")?.value;
    const longitude = document.getElementById("createEventLongitude")?.value;
    const depth = document.getElementById("createEventDepth")?.value;
    const ml = document.getElementById("createEventMl")?.value;
    const submitButton = document.getElementById("createEventSubmit");

    if (!origin_time || latitude === "" || longitude === "") {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "danger",
            t("events.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (!(await window.requireEventsAuth?.("add an earthquake"))) {
        return;
    }

    submitButton.disabled = true;
    clearCreateEventAlert();

    try {
        const payload = {
            origin_time,
            latitude: Number(latitude),
            longitude: Number(longitude),
            location_ge: document.getElementById("createEventLocationGe")?.value.trim() || null,
            location_en: document.getElementById("createEventLocationEn")?.value.trim() || null,
            area: document.getElementById("createEventArea")?.value.trim() || null,
            iesdata_id: document.getElementById("createEventIesdataId")?.value.trim() || null,
            seiscomp_oid: document.getElementById("createEventSeiscompOid")?.value.trim() || null,
        };
        if (depth !== "") {
            payload.depth = Number(depth);
        }

        const data = await window.makeApiRequest("/api/seismic_events/", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        let created = data.event || data;
        if (created?.id) {
            try {
                await maybeAttachMl(created.id, ml);
                created = await window.makeApiRequest(`/api/seismic_events/${created.id}`, {
                    method: "GET",
                });
            } catch (attachError) {
                window.showAlert(
                    "alertPlaceholder",
                    "warning",
                    attachError.message ||
                        t(
                            "events.create.ml_warning",
                            "Event created, but ML magnitude could not be saved."
                        )
                );
            }
        }

        window.onEventCreated?.(created);
        ensureCreateEventModal()?.hide();
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("events.create.success", "Earthquake created successfully.")
        );
    } catch (error) {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "danger",
            error.message || t("events.error.create", "Failed to create earthquake.")
        );
    } finally {
        submitButton.disabled = false;
    }
}

window.openCreateEventModal = openCreateEventModal;

document.addEventListener("DOMContentLoaded", () => {
    ensureCreateEventModal();
    document
        .getElementById("createEventForm")
        ?.addEventListener("submit", submitCreateEventForm);
});
