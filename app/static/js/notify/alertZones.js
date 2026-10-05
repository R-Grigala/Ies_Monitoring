(function () {
    const GEORGIA_CENTER = [42.2, 43.5];
    const DEFAULT_ZOOM = 7;
    const NEW_ZONE_STYLE = { color: "#0d6efd", weight: 2, fillOpacity: 0.2 };
    const SAVED_ZONE_STYLE = { color: "#dc3545", weight: 2, fillOpacity: 0.12 };
    const DISABLED_ZONE_STYLE = { color: "#6c757d", weight: 2, dashArray: "6 4", fillOpacity: 0.08 };

    let map = null;
    let drawnItems = null;
    let savedZonesLayer = null;
    let zonesData = [];
    const zoneLayersById = new Map();
    // Saved zones stay off the map until the user ticks them in the list.
    const visibleZoneIds = new Set();
    // While a zone is being edited its saved layer is hidden so only the editable copy is shown.
    let editingZoneId = null;

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

    function magnitudeRangeLabel(zone) {
        const min = Number(zone.min_magnitude).toFixed(1);
        if (zone.max_magnitude === null || zone.max_magnitude === undefined) {
            return `ML ≥ ${min}`;
        }
        return `ML ${min} – ${Number(zone.max_magnitude).toFixed(1)}`;
    }

    const CHANNEL_ICONS = { mail: "fa-envelope", number: "fa-sms", push_notif: "fa-bell" };

    function channelsHtml(zone) {
        return (zone.notif_channels || [])
            .map((channel) => {
                const icon = CHANNEL_ICONS[channel] || "fa-paper-plane";
                const label = escapeHtml(t(`alertZones.channel.${channel}`, channel));
                return `<span class="d-inline-flex align-items-center gap-1"><i class="fas ${icon}" aria-hidden="true"></i>${label}</span>`;
            })
            .join("");
    }

    function getDrawnPolygon() {
        const layers = drawnItems ? drawnItems.getLayers() : [];
        return layers.length ? layers[0] : null;
    }

    function updatePolygonStatus() {
        const status = document.getElementById("alertZonePolygonStatus");
        if (!status) {
            return;
        }
        const hasPolygon = Boolean(getDrawnPolygon());
        const icon = hasPolygon ? "fa-check-circle" : "fa-exclamation-circle";
        const label = hasPolygon
            ? t("alertZones.form.polygon_ready", "Polygon ready")
            : t("alertZones.form.no_polygon", "No polygon drawn yet");
        status.innerHTML = `<i class="fas ${icon} me-1" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
        status.className = `badge rounded-pill alert-zones-polygon-status ${
            hasPolygon ? "text-bg-success" : "text-bg-light border text-dark"
        }`;
    }

    function initMap() {
        const mapElement = document.getElementById("alertZonesMap");
        if (!mapElement || typeof L === "undefined") {
            return;
        }

        map = L.map(mapElement).setView(GEORGIA_CENTER, DEFAULT_ZOOM);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap",
        }).addTo(map);

        savedZonesLayer = L.featureGroup().addTo(map);
        drawnItems = L.featureGroup().addTo(map);

        if (L.Control.Draw) {
            map.addControl(
                new L.Control.Draw({
                    position: "topleft",
                    draw: {
                        polygon: {
                            allowIntersection: false,
                            showArea: false,
                            shapeOptions: NEW_ZONE_STYLE,
                        },
                        polyline: false,
                        rectangle: false,
                        circle: false,
                        circlemarker: false,
                        marker: false,
                    },
                    edit: {
                        featureGroup: drawnItems,
                    },
                })
            );

            // Only one new polygon at a time: a fresh drawing replaces the previous one.
            map.on(L.Draw.Event.CREATED, (event) => {
                drawnItems.clearLayers();
                drawnItems.addLayer(event.layer);
                updatePolygonStatus();
            });
            map.on(L.Draw.Event.EDITED, updatePolygonStatus);
            map.on(L.Draw.Event.DELETED, updatePolygonStatus);
        } else {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t("alertZones.error.draw", "Map drawing tools failed to load.")
            );
        }

        setTimeout(() => map.invalidateSize(), 100);
        window.addEventListener("resize", () => map?.invalidateSize());
    }

    function renderSavedZonesOnMap() {
        if (!savedZonesLayer) {
            return;
        }
        savedZonesLayer.clearLayers();
        zoneLayersById.clear();

        zonesData.forEach((zone) => {
            const layer = L.geoJSON(zone.geometry, {
                style: zone.enabled ? SAVED_ZONE_STYLE : DISABLED_ZONE_STYLE,
            });
            layer.bindTooltip(`${escapeHtml(zone.name)} · ${magnitudeRangeLabel(zone)}`, { sticky: true });
            const zoneId = String(zone.id);
            if (visibleZoneIds.has(zoneId) && zoneId !== editingZoneId) {
                layer.addTo(savedZonesLayer);
            }
            zoneLayersById.set(zoneId, layer);
        });
    }

    function setZoneVisibility(zoneId, visible) {
        const id = String(zoneId);
        const layer = zoneLayersById.get(id);
        if (visible) {
            visibleZoneIds.add(id);
            if (layer && savedZonesLayer && id !== editingZoneId && !savedZonesLayer.hasLayer(layer)) {
                savedZonesLayer.addLayer(layer);
            }
        } else {
            visibleZoneIds.delete(id);
            if (layer && savedZonesLayer) {
                savedZonesLayer.removeLayer(layer);
            }
        }
        const checkbox = document.querySelector(`[data-toggle-zone-id="${CSS.escape(id)}"]`);
        if (checkbox) {
            checkbox.checked = visible;
            checkbox.closest(".alert-zones-item")?.classList.toggle("is-visible", visible);
        }
    }

    function renderZonesList() {
        const list = document.getElementById("alertZonesList");
        const empty = document.getElementById("alertZonesEmpty");
        const total = document.getElementById("alertZonesTotal");
        if (!list) {
            return;
        }

        list.innerHTML = "";
        total.textContent = String(zonesData.length);
        empty.classList.toggle("d-none", zonesData.length > 0);

        zonesData.forEach((zone) => {
            const zoneId = escapeHtml(zone.id);
            const isVisible = visibleZoneIds.has(String(zone.id));
            const isEditing = String(zone.id) === editingZoneId;
            const item = document.createElement("li");
            item.className = [
                "alert-zones-item",
                zone.enabled ? "" : "is-disabled",
                isVisible ? "is-visible" : "",
                isEditing ? "is-editing" : "",
            ].filter(Boolean).join(" ");

            const statusBadge = zone.enabled
                ? `<span class="badge rounded-pill text-bg-success">${escapeHtml(t("alertZones.status.enabled", "Enabled"))}</span>`
                : `<span class="badge rounded-pill text-bg-secondary">${escapeHtml(t("alertZones.status.disabled", "Disabled"))}</span>`;
            const audienceIcon = zone.notif_is_staff ? "fa-user-tie" : "fa-users";
            const audience = zone.notif_is_staff
                ? t("notify.staff.yes", "Staff")
                : t("notify.staff.no", "External");
            const onMapLabel = escapeHtml(t("alertZones.list.on_map", "On map"));
            const deleteLabel = escapeHtml(t("alertZones.list.delete", "Delete"));
            const editLabel = escapeHtml(t("alertZones.list.edit", "Edit"));

            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <div class="flex-grow-1 min-w-0">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-semibold text-truncate">${escapeHtml(zone.name)}</span>
                            ${statusBadge}
                        </div>
                        <div class="d-flex flex-wrap gap-1 mt-2">
                            <span class="badge text-bg-light border text-dark">${magnitudeRangeLabel(zone)}</span>
                            <span class="badge text-bg-light border text-dark">
                                <i class="fas ${audienceIcon} me-1" aria-hidden="true"></i>${escapeHtml(audience)}
                            </span>
                        </div>
                        <div class="d-flex flex-wrap gap-3 small text-muted mt-2">${channelsHtml(zone)}</div>
                    </div>
                    <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0">
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" role="switch"
                                id="alertZoneVisible${zoneId}"
                                data-toggle-zone-id="${zoneId}"
                                ${isVisible ? "checked" : ""}>
                            <label class="form-check-label small" for="alertZoneVisible${zoneId}">${onMapLabel}</label>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <button type="button" class="btn btn-sm btn-link text-primary p-0 alert-zones-action"
                                data-edit-zone-id="${zoneId}" title="${editLabel}" aria-label="${editLabel}">
                                <i class="fas fa-pen" aria-hidden="true"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-link text-danger p-0 alert-zones-action"
                                data-delete-zone-id="${zoneId}" title="${deleteLabel}" aria-label="${deleteLabel}">
                                <i class="fas fa-trash-alt" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    }

    function renderZones() {
        renderSavedZonesOnMap();
        renderZonesList();
    }

    async function loadZones() {
        const token = localStorage.getItem("access_token");
        if (!token || window.isTokenExpired(token)) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t("alerts.session_expired", "Session has expired. Please sign in again.")
            );
            window.clearSessionData();
            document.getElementById("alertZonesLoading")?.classList.add("d-none");
            return;
        }

        try {
            const data = await window.makeApiRequest("/api/alert_zones", { method: "GET" });
            zonesData = Array.isArray(data.items) ? data.items : [];
            renderZones();
        } catch (error) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                error.message || t("alertZones.error.load", "Failed to load alert zones.")
            );
        } finally {
            document.getElementById("alertZonesLoading")?.classList.add("d-none");
        }
    }

    async function deleteZone(zoneId) {
        const confirmed = await window.confirmDelete({
            message: t("alertZones.delete.confirm", "Are you sure you want to delete this alert zone?"),
        });
        if (!confirmed) {
            return;
        }

        try {
            const data = await window.makeApiRequest(`/api/alert_zones/${zoneId}`, { method: "DELETE" });
            zonesData = zonesData.filter((zone) => zone.id !== Number(zoneId));
            visibleZoneIds.delete(String(zoneId));
            if (editingZoneId === String(zoneId)) {
                resetForm();
            }
            renderZones();
            window.showAlert(
                "alertPlaceholder",
                "success",
                data.message || t("alertZones.delete.success", "Alert zone deleted successfully.")
            );
        } catch (error) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                error.message || t("alertZones.error.delete", "Failed to delete alert zone.")
            );
        }
    }

    function setLabel(elementId, key, fallback) {
        const element = document.getElementById(elementId);
        if (element) {
            element.dataset.i18n = key;
            element.textContent = t(key, fallback);
        }
    }

    function updateFormMode() {
        const isEditing = editingZoneId !== null;
        setLabel(
            "alertZoneFormTitle",
            isEditing ? "alertZones.form.edit_title" : "alertZones.form.title",
            isEditing ? "Edit alert zone" : "New alert zone"
        );
        setLabel(
            "alertZoneSubmitLabel",
            isEditing ? "alertZones.form.update" : "alertZones.form.submit",
            isEditing ? "Save changes" : "Save zone"
        );
        setLabel(
            "alertZoneResetLabel",
            isEditing ? "alertZones.form.cancel" : "alertZones.form.reset",
            isEditing ? "Cancel" : "Clear"
        );
        const resetIcon = document.getElementById("alertZoneResetIcon");
        if (resetIcon) {
            resetIcon.className = `fas ${isEditing ? "fa-times" : "fa-eraser"} me-1`;
        }
        document.getElementById("alertZoneFormCard")?.classList.toggle("is-editing", isEditing);
    }

    function resetForm() {
        const wasEditing = editingZoneId !== null;
        editingZoneId = null;
        document.getElementById("alertZoneForm")?.reset();
        document.getElementById("alertZoneEnabled").checked = true;
        drawnItems?.clearLayers();
        updatePolygonStatus();
        updateFormMode();
        if (wasEditing) {
            renderZones();
        }
    }

    function startEditZone(zoneId) {
        const zone = zonesData.find((item) => String(item.id) === String(zoneId));
        if (!zone || !drawnItems) {
            return;
        }

        editingZoneId = String(zone.id);

        document.getElementById("alertZoneName").value = zone.name || "";
        document.getElementById("alertZoneMinMagnitude").value = zone.min_magnitude ?? "";
        document.getElementById("alertZoneMaxMagnitude").value = zone.max_magnitude ?? "";
        const channels = new Set(zone.notif_channels || []);
        document.querySelectorAll('input[name="alertZoneChannels"]').forEach((input) => {
            input.checked = channels.has(input.value);
        });
        document.getElementById("alertZoneIsStaff").checked = Boolean(zone.notif_is_staff);
        document.getElementById("alertZoneAudienceExternal").checked = !zone.notif_is_staff;
        document.getElementById("alertZoneEnabled").checked = Boolean(zone.enabled);

        drawnItems.clearLayers();
        const polygon = L.polygon(L.GeoJSON.coordsToLatLngs(zone.geometry.coordinates, 1), NEW_ZONE_STYLE);
        drawnItems.addLayer(polygon);
        map.fitBounds(polygon.getBounds(), { padding: [30, 30] });

        updatePolygonStatus();
        updateFormMode();
        renderZones();
        document.getElementById("alertZoneFormCard")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function showValidationError(message) {
        window.showAlert("alertPlaceholder", "danger", message);
    }

    async function submitZoneForm(event) {
        event.preventDefault();

        const polygon = getDrawnPolygon();
        const name = document.getElementById("alertZoneName").value.trim();
        const minRaw = document.getElementById("alertZoneMinMagnitude").value.trim();
        const maxRaw = document.getElementById("alertZoneMaxMagnitude").value.trim();
        const channels = Array.from(
            document.querySelectorAll('input[name="alertZoneChannels"]:checked')
        ).map((input) => input.value);
        const submitButton = document.getElementById("alertZoneSubmit");

        if (!polygon) {
            showValidationError(t("alertZones.error.polygon", "Please draw a polygon on the map."));
            return;
        }
        if (!name || minRaw === "") {
            showValidationError(t("notify.error.validation", "Please fill in all required fields."));
            return;
        }

        const minMagnitude = Number(minRaw);
        const maxMagnitude = maxRaw === "" ? null : Number(maxRaw);
        if (maxMagnitude !== null && maxMagnitude < minMagnitude) {
            showValidationError(
                t("alertZones.error.magnitude_range", "Max ML must be greater than or equal to Min ML.")
            );
            return;
        }
        if (!channels.length) {
            showValidationError(t("alertZones.error.channels", "Select at least one notification channel."));
            return;
        }

        submitButton.disabled = true;
        const isEditing = editingZoneId !== null;

        try {
            const url = isEditing ? `/api/alert_zones/${editingZoneId}` : "/api/alert_zones";
            const data = await window.makeApiRequest(url, {
                method: isEditing ? "PUT" : "POST",
                body: JSON.stringify({
                    name,
                    geometry: polygon.toGeoJSON().geometry,
                    min_magnitude: minMagnitude,
                    max_magnitude: maxMagnitude,
                    notif_channels: channels,
                    notif_is_staff: document.getElementById("alertZoneIsStaff").checked,
                    enabled: document.getElementById("alertZoneEnabled").checked,
                }),
            });

            if (data.alert_zone) {
                zonesData = isEditing
                    ? zonesData.map((zone) => (zone.id === data.alert_zone.id ? data.alert_zone : zone))
                    : [...zonesData, data.alert_zone];
            }
            resetForm();
            renderZones();
            window.showAlert(
                "alertPlaceholder",
                "success",
                isEditing
                    ? t("alertZones.update.success", "Alert zone updated successfully.")
                    : t("alertZones.create.success", "Alert zone created successfully.")
            );
        } catch (error) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                error.message ||
                    (isEditing
                        ? t("alertZones.error.update", "Failed to update alert zone.")
                        : t("alertZones.error.create", "Failed to create alert zone."))
            );
        } finally {
            submitButton.disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        initMap();
        updatePolygonStatus();

        document.getElementById("alertZoneForm")?.addEventListener("submit", submitZoneForm);
        document.getElementById("alertZoneReset")?.addEventListener("click", resetForm);

        document.getElementById("alertZonesList")?.addEventListener("change", (event) => {
            const toggle = event.target.closest("[data-toggle-zone-id]");
            if (toggle) {
                setZoneVisibility(toggle.dataset.toggleZoneId, toggle.checked);
            }
        });

        document.getElementById("alertZonesList")?.addEventListener("click", (event) => {
            const editButton = event.target.closest("[data-edit-zone-id]");
            if (editButton) {
                startEditZone(editButton.dataset.editZoneId);
                return;
            }
            const deleteButton = event.target.closest("[data-delete-zone-id]");
            if (deleteButton) {
                deleteZone(deleteButton.dataset.deleteZoneId);
            }
        });

        loadZones();
    });
})();
