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

let magnitudeTypes = [];

async function loadMagnitudeTypes() {
    if (magnitudeTypes.length) {
        return magnitudeTypes;
    }

    try {
        const data = await window.makeApiRequest("/api/seismic_events/magnitude_types", {
            method: "GET",
        });
        magnitudeTypes = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "warning",
            error.message ||
                t("events.create.magnitude_types_error", "Failed to load magnitude types.")
        );
    }
    return magnitudeTypes;
}

function addMagnitudeRow() {
    const container = document.getElementById("createEventMagnitudes");
    if (!container) {
        return;
    }

    const row = document.createElement("div");
    row.className = "row g-2 align-items-center magnitude-row";

    const noneLabel = t("events.create.magnitude_none", "None");
    const options = [`<option value="">${noneLabel}</option>`]
        .concat(
            magnitudeTypes.map((item) => {
                const code = window.escapeHtml ? window.escapeHtml(item.code) : item.code;
                const title = item.description
                    ? ` title="${window.escapeHtml ? window.escapeHtml(item.description) : item.description}"`
                    : "";
                return `<option value="${code}"${title}>${code}</option>`;
            })
        )
        .join("");

    row.innerHTML = `
        <div class="col-5 col-md-5">
            <select class="form-select" data-magnitude-code>${options}</select>
        </div>
        <div class="col-5 col-md-5">
            <input
                type="number"
                class="form-control"
                step="0.1"
                data-magnitude-value
                data-i18n-placeholder="events.create.magnitude_value"
                placeholder="Magnitude value"
            >
        </div>
        <div class="col-2 col-md-2 d-grid">
            <button
                type="button"
                class="btn btn-outline-danger"
                data-magnitude-remove
                aria-label="${t("events.edit.magnitude_delete", "Delete")}"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;

    container.appendChild(row);
    window.I18n?.applyTranslations?.();
}

function readMagnitudeRows() {
    const rows = [...document.querySelectorAll("#createEventMagnitudes .magnitude-row")];
    const entries = [];

    for (const row of rows) {
        const code = row.querySelector("[data-magnitude-code]")?.value || "";
        const rawValue = row.querySelector("[data-magnitude-value]")?.value ?? "";

        if (!code && rawValue === "") {
            continue;
        }
        if (!code || rawValue === "") {
            return { error: "incomplete" };
        }
        if (entries.some((entry) => entry.magnitude_code === code)) {
            return { error: "duplicate" };
        }
        entries.push({ magnitude_code: code, value: Number(rawValue) });
    }

    return { entries };
}

async function openCreateEventModal() {
    document.getElementById("createEventForm")?.reset();
    const container = document.getElementById("createEventMagnitudes");
    if (container) {
        container.innerHTML = "";
    }
    clearCreateEventAlert();
    ensureCreateEventModal()?.show();
    await loadMagnitudeTypes();
    addMagnitudeRow();
}

function fromOriginTimeInput(value) {
    if (window.parseOriginTimeInput) {
        return window.parseOriginTimeInput(value);
    }
    const raw = (value || "").trim();
    if (!raw) {
        return null;
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

async function attachMagnitudes(eventId, entries) {
    for (const entry of entries) {
        await window.makeApiRequest(`/api/seismic_events/${eventId}/magnitudes`, {
            method: "POST",
            body: JSON.stringify(entry),
        });
    }
}

function readOptionalNumber(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
}

function readBeachballPayload() {
    const payload = {};
    const strike = readOptionalNumber("createEventBeachballStrike");
    const dip = readOptionalNumber("createEventBeachballDip");
    const rake = readOptionalNumber("createEventBeachballRake");

    if (strike !== null) {
        payload.strike = strike;
    }
    if (dip !== null) {
        payload.dip = dip;
    }
    if (rake !== null) {
        payload.rake = rake;
    }
    return payload;
}

async function attachBeachball(eventId, payload) {
    if (!payload || Object.keys(payload).length === 0) {
        return;
    }
    await window.makeApiRequest(`/api/seismic_events/${eventId}/beachball`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

async function submitCreateEventForm(formEvent) {
    formEvent.preventDefault();

    const origin_time = fromOriginTimeInput(
        document.getElementById("createEventOriginTime")?.value
    );
    const latitude = document.getElementById("createEventLatitude")?.value;
    const longitude = document.getElementById("createEventLongitude")?.value;
    const depth = document.getElementById("createEventDepth")?.value;
    const submitButton = document.getElementById("createEventSubmit");

    if (!origin_time || depth === "" || latitude === "" || longitude === "") {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "danger",
            t("events.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    const { entries: magnitudeEntries, error: magnitudeError } = readMagnitudeRows();
    if (magnitudeError === "incomplete") {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "danger",
            t(
                "events.create.magnitude_incomplete",
                "Select both a magnitude type and its value, or leave both empty."
            )
        );
        return;
    }
    if (magnitudeError === "duplicate") {
        window.showAlert(
            CREATE_EVENT_ALERT_ID,
            "danger",
            t(
                "events.create.magnitude_duplicate",
                "Each magnitude type can only be added once."
            )
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
            depth: Number(depth),
            location_ge: document.getElementById("createEventLocationGe")?.value.trim() || null,
            location_en: document.getElementById("createEventLocationEn")?.value.trim() || null,
            area: document.getElementById("createEventArea")?.value.trim() || null,
            iesdata_id: document.getElementById("createEventIesdataId")?.value.trim() || null,
            seiscomp_oid: document.getElementById("createEventSeiscompOid")?.value.trim() || null,
        };

        const data = await window.makeApiRequest("/api/seismic_events/", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        let created = data.event || data;
        if (created?.id) {
            const warnings = [];
            try {
                await attachMagnitudes(created.id, magnitudeEntries);
            } catch (attachError) {
                warnings.push(
                    attachError.message ||
                        t(
                            "events.create.magnitude_warning",
                            "Event created, but the magnitude could not be saved."
                        )
                );
            }

            try {
                await attachBeachball(created.id, readBeachballPayload());
            } catch (beachballError) {
                warnings.push(
                    beachballError.message ||
                        t(
                            "events.create.beachball_warning",
                            "Event created, but the beachball could not be saved."
                        )
                );
            }

            created = await window.makeApiRequest(`/api/seismic_events/${created.id}`, {
                method: "GET",
            });

            window.onEventCreated?.(created);
            ensureCreateEventModal()?.hide();

            if (warnings.length) {
                window.showAlert("alertPlaceholder", "warning", warnings.join(" "));
            } else {
                window.showAlert(
                    "alertPlaceholder",
                    "success",
                    data.message || t("events.create.success", "Earthquake created successfully.")
                );
            }
            return;
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
    document
        .getElementById("createEventMagnitudeAdd")
        ?.addEventListener("click", addMagnitudeRow);

    document.getElementById("createEventMagnitudes")?.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-magnitude-remove]");
        if (removeButton) {
            removeButton.closest(".magnitude-row")?.remove();
        }
    });
});
