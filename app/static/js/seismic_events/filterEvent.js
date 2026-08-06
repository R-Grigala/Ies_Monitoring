let activeFilter = null;

function readFilterState() {
    const num = (id) => {
        const raw = document.getElementById(id)?.value;
        if (raw === null || raw === undefined || raw === "") {
            return null;
        }
        const value = Number(raw);
        return Number.isNaN(value) ? null : value;
    };

    return {
        dateFrom: document.getElementById("filterDateFrom")?.value || null,
        dateTo: document.getElementById("filterDateTo")?.value || null,
        magMin: num("filterMagMin"),
        magMax: num("filterMagMax"),
        depthMin: num("filterDepthMin"),
        depthMax: num("filterDepthMax"),
        location: (document.getElementById("filterLocation")?.value || "").trim().toLowerCase(),
    };
}

function isEmptyFilter(filter) {
    if (!filter) {
        return true;
    }
    return !(
        filter.dateFrom ||
        filter.dateTo ||
        filter.magMin !== null ||
        filter.magMax !== null ||
        filter.depthMin !== null ||
        filter.depthMax !== null ||
        filter.location
    );
}

function filterEventsList(events, filterState) {
    const list = Array.isArray(events) ? events : [];
    if (!filterState || isEmptyFilter(filterState)) {
        return list;
    }

    return list.filter((event) => {
        const origin = event.origin_time ? new Date(event.origin_time) : null;
        if (filterState.dateFrom) {
            const from = new Date(`${filterState.dateFrom}T00:00:00`);
            if (!origin || origin < from) {
                return false;
            }
        }
        if (filterState.dateTo) {
            const to = new Date(`${filterState.dateTo}T23:59:59`);
            if (!origin || origin > to) {
                return false;
            }
        }

        const ml = window.getEventMl?.(event);
        if (filterState.magMin !== null) {
            if (ml === null || ml === undefined || ml < filterState.magMin) {
                return false;
            }
        }
        if (filterState.magMax !== null) {
            if (ml === null || ml === undefined || ml > filterState.magMax) {
                return false;
            }
        }

        const depth =
            event.depth === null || event.depth === undefined ? null : Number(event.depth);
        if (filterState.depthMin !== null) {
            if (depth === null || depth < filterState.depthMin) {
                return false;
            }
        }
        if (filterState.depthMax !== null) {
            if (depth === null || depth > filterState.depthMax) {
                return false;
            }
        }

        if (filterState.location) {
            const haystack = [
                event.id,
                event.iesdata_id,
                event.seiscomp_oid,
                event.location_ge,
                event.location_en,
                event.area,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            if (!haystack.includes(filterState.location)) {
                return false;
            }
        }

        return true;
    });
}

function getActiveEventsFilter() {
    return activeFilter;
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("filterEventForm");
    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        activeFilter = readFilterState();
        window.applyEventsFilter?.(activeFilter);
    });

    document.getElementById("filterEventReset")?.addEventListener("click", () => {
        form?.reset();
        activeFilter = null;
        window.applyEventsFilter?.(null);
    });
});

window.filterEventsList = filterEventsList;
window.getActiveEventsFilter = getActiveEventsFilter;
