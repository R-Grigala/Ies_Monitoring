(() => {
    const tableBody = document.getElementById("publishedTableBody");
    const countValue = document.getElementById("publishedCount");
    const PUBLISHED_LIMIT = 100;

    function t(key, fallback) {
        return window.I18n ? window.I18n.t(key, fallback) : fallback;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function formatNumber(value, maxDigits) {
        return Number(value).toLocaleString("en-US", {
            minimumFractionDigits: 1,
            maximumFractionDigits: maxDigits,
        });
    }

    // Same rule as the admin list and WordPress publish: ML first, else the first magnitude.
    function pickMagnitude(event) {
        const list = (event?.magnitudes || []).filter(
            (item) => item.value !== null && item.value !== undefined
        );
        if (!list.length) {
            return null;
        }
        const preferred =
            list.find((item) => (item.magnitude?.code || "").toUpperCase() === "ML") || list[0];
        return { value: Number(preferred.value), code: preferred.magnitude?.code || "M" };
    }

    function magnitudeLevel(value) {
        if (value >= 5) return "major";
        if (value >= 4) return "strong";
        if (value >= 3) return "moderate";
        return "minor";
    }

    function typeCell(event) {
        const automatic = Boolean(event.is_automatic);
        const label = automatic
            ? t("published.legend.automatic", "Automatic")
            : t("published.legend.calculated", "Calculated (reviewed)");
        const letter = automatic ? "A" : "C";
        return `<span class="published-type published-type-${letter.toLowerCase()}" title="${escapeHtml(label)}">${letter}</span>`;
    }

    function timeCell(value) {
        const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
        if (!match) {
            return escapeHtml(value || "-");
        }
        return `
            <div class="published-date">${match[1]}</div>
            <div class="published-time">${match[2]}</div>`;
    }

    function magnitudeCell(event) {
        const magnitude = pickMagnitude(event);
        if (!magnitude) {
            return '<span class="text-muted">-</span>';
        }
        return `
            <span class="published-mag published-mag-${magnitudeLevel(magnitude.value)}">
                <span class="published-mag-value">${formatNumber(magnitude.value, 2)}</span>
                <span class="published-mag-code">${escapeHtml(magnitude.code)}</span>
            </span>`;
    }

    function beachballCell(event) {
        const beachball = event.beachball;
        if (!beachball?.beachball_path) {
            return "";
        }
        const angles =
            beachball.strike !== null && beachball.strike !== undefined
                ? `Strike ${beachball.strike}° · Dip ${beachball.dip}° · Rake ${beachball.rake}°`
                : "FM";
        return `
            <a href="${escapeHtml(beachball.beachball_path)}" target="_blank" rel="noopener"
               class="published-beachball" title="${escapeHtml(angles)}">
                <img src="${escapeHtml(beachball.beachball_path)}" alt="${escapeHtml(angles)}" loading="lazy">
            </a>`;
    }

    function depthCell(depth) {
        if (depth === null || depth === undefined) {
            return '<span class="text-muted">-</span>';
        }
        return `<span class="published-depth">${formatNumber(depth, 1)}</span>`;
    }

    function formatCoordinates(event) {
        const lat = Number(event.latitude);
        const lon = Number(event.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return "";
        }
        const latLabel = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`;
        const lonLabel = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;
        return `${latLabel}, ${lonLabel}`;
    }

    function locationCell(event) {
        const lang = window.I18n?.getLanguage?.() || "en";
        const primary = lang === "ka" ? event.location_ge : event.location_en;
        const text = primary || event.location_en || event.location_ge || "-";
        const coordinates = formatCoordinates(event);
        return `
            <div class="published-location">${escapeHtml(text)}</div>
            ${coordinates ? `<div class="published-coords"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${coordinates}</div>` : ""}
            ${depthMeta(event.depth)}`;
    }

    // Phone cards show depth next to the coordinates; the desktop table has its own column.
    function depthMeta(depth) {
        if (depth === null || depth === undefined) {
            return "";
        }
        const label = t("events.table.depth_km", "Depth (km)");
        return `<div class="published-depth-meta"><i class="fa-solid fa-arrow-down-long" aria-hidden="true"></i> ${escapeHtml(label)}: <strong>${formatNumber(depth, 1)}</strong></div>`;
    }

    function renderPlaceholder(icon, message) {
        tableBody.innerHTML = `
            <tr class="published-placeholder-row">
                <td colspan="6">
                    <i class="fa-solid ${icon} d-block mb-2" aria-hidden="true"></i>
                    ${escapeHtml(message)}
                </td>
            </tr>`;
    }

    function renderRows(items) {
        tableBody.innerHTML = items
            .filter((item) => item.event)
            .map(
                ({ event }) => `
                <tr>
                    <td class="published-col-type">${typeCell(event)}</td>
                    <td class="published-col-time">${timeCell(event.origin_time)}</td>
                    <td class="published-col-mag">${magnitudeCell(event)}</td>
                    <td class="published-col-fm">${beachballCell(event)}</td>
                    <td class="published-col-depth">${depthCell(event.depth)}</td>
                    <td class="published-col-location">${locationCell(event)}</td>
                </tr>`
            )
            .join("");
    }

    async function loadPublishedEvents() {
        try {
            const response = await fetch(`/api/publish_events/?limit=${PUBLISHED_LIMIT}`, {
                headers: { Accept: "application/json" },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const items = (Array.isArray(data.items) ? data.items : []).filter((item) => item.event);
            countValue.textContent = Number(data.total) || items.length;
            if (!items.length) {
                renderPlaceholder("fa-house-crack", t("published.empty", "No published earthquakes yet."));
                return;
            }
            renderRows(items);
        } catch (error) {
            console.error("Failed to load published earthquakes:", error);
            countValue.textContent = "–";
            renderPlaceholder(
                "fa-triangle-exclamation",
                t("published.error", "Could not load published earthquakes.")
            );
        }
    }

    document.addEventListener("DOMContentLoaded", loadPublishedEvents);
})();
