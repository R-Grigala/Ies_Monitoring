let activeFilter = null;

function readNumberField(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === null || raw === undefined || raw === "") {
        return null;
    }
    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
}

function readTextField(id) {
    return (document.getElementById(id)?.value || "").trim().toLowerCase();
}

function parseFilterDate(value, endOfDay = false) {
    const raw = (value || "").trim();
    if (!raw) {
        return null;
    }

    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
        return null;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    if (endOfDay) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }
    return date;
}

function readFilterState() {
    return {
        eventId: readTextField("filterEventId"),
        seiscompOid: readTextField("filterSeiscompOid"),
        location: readTextField("filterLocation"),
        area: document.getElementById("filterArea")?.value || "",
        magnitudes: readMagnitudeFilterRows(),
        depthMin: readNumberField("filterDepthMin"),
        depthMax: readNumberField("filterDepthMax"),
        dateFrom: document.getElementById("filterDateFrom")?.value?.trim() || null,
        dateTo: document.getElementById("filterDateTo")?.value?.trim() || null,
    };
}

function isEmptyFilter(filter) {
    if (!filter) {
        return true;
    }
    return Object.values(filter).every((value) => {
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        return value === null || value === undefined || value === "";
    });
}

function inRange(value, min, max) {
    if (min !== null) {
        if (value === null || value === undefined || value < min) {
            return false;
        }
    }
    if (max !== null) {
        if (value === null || value === undefined || value > max) {
            return false;
        }
    }
    return true;
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function matchesText(haystackParts, needle) {
    if (!needle) {
        return true;
    }
    const haystack = haystackParts
        .filter((part) => part !== null && part !== undefined && part !== "")
        .join(" ")
        .toLowerCase();
    return haystack.includes(needle);
}

function updateAreaFilterOptions(events) {
    const select = document.getElementById("filterArea");
    if (!select) {
        return;
    }

    const knownValues = new Set([...select.options].map((option) => option.value));
    const legacyAreas = [
        ...new Set(
            (Array.isArray(events) ? events : [])
                .map((event) => (event.area || "").trim())
                .filter((area) => area && !knownValues.has(area))
        ),
    ].sort((a, b) => a.localeCompare(b));

    // Legacy free-text areas stay filterable alongside the fixed categories.
    legacyAreas.forEach((area) => {
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.appendChild(option);
    });
}

function matchesMagnitude(event, filterState) {
    const criteria = filterState.magnitudes || [];
    if (!criteria.length) {
        return true;
    }

    const magnitudes = (Array.isArray(event.magnitudes) ? event.magnitudes : []).filter(
        (item) => item.value !== null && item.value !== undefined
    );

    // Every configured type must be present and inside its own range.
    return criteria.every((criterion) => {
        if (!criterion.code) {
            return inRange(
                window.getEventMl?.(event) ?? null,
                criterion.min,
                criterion.max
            );
        }

        return magnitudes.some(
            (item) =>
                (item.magnitude?.code || "").toUpperCase() === criterion.code &&
                inRange(Number(item.value), criterion.min, criterion.max)
        );
    });
}

let magnitudeTypeCatalog = [];

function readMagnitudeFilterRows() {
    return [...document.querySelectorAll("#filterMagnitudeRows .magnitude-filter-row")]
        .map((row) => ({
            code: (row.querySelector("[data-magnitude-code]")?.value || "").toUpperCase(),
            min: toNumberOrNull(row.querySelector("[data-magnitude-min]")?.value),
            max: toNumberOrNull(row.querySelector("[data-magnitude-max]")?.value),
        }))
        .filter(
            (criterion) => criterion.code || criterion.min !== null || criterion.max !== null
        );
}

function addMagnitudeFilterRow() {
    const container = document.getElementById("filterMagnitudeRows");
    if (!container) {
        return;
    }

    const anyLabel = window.I18n
        ? window.I18n.t("events.filter.magnitude_any", "Any type")
        : "Any type";
    const options = [`<option value="">${anyLabel}</option>`]
        .concat(
            magnitudeTypeCatalog.map((item) => {
                const code = window.escapeHtml ? window.escapeHtml(item.code) : item.code;
                return `<option value="${code}">${code}</option>`;
            })
        )
        .join("");

    const row = document.createElement("div");
    row.className = "row g-1 align-items-center magnitude-filter-row";
    row.innerHTML = `
        <div class="col-4">
            <select class="form-select form-select-sm" data-magnitude-code>${options}</select>
        </div>
        <div class="col-3">
            <input
                type="number"
                class="form-control form-control-sm"
                step="0.1"
                data-magnitude-min
                data-i18n-placeholder="events.filter.mag_min"
                placeholder="min"
            >
        </div>
        <div class="col-3">
            <input
                type="number"
                class="form-control form-control-sm"
                step="0.1"
                data-magnitude-max
                data-i18n-placeholder="events.filter.mag_max"
                placeholder="max"
            >
        </div>
        <div class="col-2 d-grid">
            <button type="button" class="btn btn-sm btn-outline-danger" data-magnitude-remove>
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;

    container.appendChild(row);
    window.I18n?.applyTranslations?.();
}

async function loadMagnitudeTypeFilterOptions() {
    try {
        const data = await window.makeApiRequest("/api/seismic_events/magnitude_types", {
            method: "GET",
        });
        magnitudeTypeCatalog = Array.isArray(data.items) ? data.items : [];
    } catch {
        // Filtering by type is optional; other filters keep working without the catalog.
    }
    addMagnitudeFilterRow();
}

function filterEventsList(events, filterState) {
    const list = Array.isArray(events) ? events : [];
    if (!filterState || isEmptyFilter(filterState)) {
        return list;
    }

    return list.filter((event) => {
        if (!matchesText([event.id, event.iesdata_id], filterState.eventId)) {
            return false;
        }
        if (!matchesText([event.seiscomp_oid], filterState.seiscompOid)) {
            return false;
        }
        if (
            !matchesText(
                [event.location_ge, event.location_en, event.area],
                filterState.location
            )
        ) {
            return false;
        }
        if (filterState.area && (event.area || "").trim() !== filterState.area) {
            return false;
        }

        const origin = event.origin_time ? new Date(event.origin_time) : null;
        if (filterState.dateFrom) {
            const from = parseFilterDate(filterState.dateFrom, false);
            if (!from || !origin || origin < from) {
                return false;
            }
        }
        if (filterState.dateTo) {
            const to = parseFilterDate(filterState.dateTo, true);
            if (!to || !origin || origin > to) {
                return false;
            }
        }

        if (!matchesMagnitude(event, filterState)) {
            return false;
        }

        if (
            !inRange(
                toNumberOrNull(event.depth),
                filterState.depthMin,
                filterState.depthMax
            )
        ) {
            return false;
        }

        return true;
    });
}

function getActiveEventsFilter() {
    return activeFilter;
}

function initFilterDatePickers() {
    if (typeof flatpickr !== "function") {
        return { from: null, to: null };
    }

    const options = {
        dateFormat: "d/m/Y",
        allowInput: true,
        disableMobile: true,
    };

    return {
        from: flatpickr("#filterDateFrom", options),
        to: flatpickr("#filterDateTo", options),
    };
}

document.addEventListener("DOMContentLoaded", () => {
    loadMagnitudeTypeFilterOptions();
    const datePickers = initFilterDatePickers();

    const form = document.getElementById("filterEventForm");
    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        activeFilter = readFilterState();
        window.applyEventsFilter?.(activeFilter);
    });

    document
        .getElementById("filterMagnitudeAdd")
        ?.addEventListener("click", addMagnitudeFilterRow);

    document.getElementById("filterMagnitudeRows")?.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-magnitude-remove]");
        if (removeButton) {
            removeButton.closest(".magnitude-filter-row")?.remove();
        }
    });

    document.getElementById("filterEventReset")?.addEventListener("click", () => {
        form?.reset();
        datePickers.from?.clear();
        datePickers.to?.clear();
        const areaSelect = document.getElementById("filterArea");
        if (areaSelect) {
            areaSelect.value = "";
        }
        const magnitudeRows = document.getElementById("filterMagnitudeRows");
        if (magnitudeRows) {
            magnitudeRows.innerHTML = "";
            addMagnitudeFilterRow();
        }
        activeFilter = null;
        window.applyEventsFilter?.(null);
    });
});

window.filterEventsList = filterEventsList;
window.getActiveEventsFilter = getActiveEventsFilter;
window.updateAreaFilterOptions = updateAreaFilterOptions;
