(function () {
    const GEORGIA_CENTER = [41.72, 44.78];
    const DEFAULT_ZOOM = 7;

    let map = null;
    let markersLayer = null;
    const markersById = new Map();

    function ensureMap() {
        if (map || typeof L === "undefined") {
            return map;
        }

        const mapElement = document.getElementById("map");
        if (!mapElement) {
            return null;
        }

        map = L.map(mapElement, {
            zoomControl: true,
            attributionControl: true,
        }).setView(GEORGIA_CENTER, DEFAULT_ZOOM);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap",
        }).addTo(map);

        markersLayer = L.layerGroup().addTo(map);

        // Leaflet needs a size recalculation after flex layout settles.
        setTimeout(() => map.invalidateSize(), 100);
        window.addEventListener("resize", () => map?.invalidateSize());

        return map;
    }

    function formatPopup(event) {
        const location =
            event.location_en || event.location_ge || event.area || "—";
        const mag = window.getEventMl?.(event);
        const magText = mag === null || mag === undefined ? "—" : mag;
        const time = event.origin_time || "—";
        return `
            <div class="small">
                <div><strong>#${event.id ?? ""}</strong></div>
                <div>${time}</div>
                <div>ML ${magText}</div>
                <div>${location}</div>
            </div>
        `;
    }

    function updateMapMarkers(events) {
        ensureMap();
        if (!map || !markersLayer) {
            return;
        }

        markersLayer.clearLayers();
        markersById.clear();

        const latLngs = [];
        (Array.isArray(events) ? events : []).forEach((event) => {
            const lat = Number(event.latitude);
            const lon = Number(event.longitude);
            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                return;
            }

            const marker = L.circleMarker([lat, lon], {
                radius: 7,
                color: "#0d6efd",
                weight: 1,
                fillColor: "#0d6efd",
                fillOpacity: 0.75,
            });
            marker.bindPopup(formatPopup(event));
            marker.addTo(markersLayer);
            markersById.set(String(event.id), marker);
            latLngs.push([lat, lon]);
        });

        if (latLngs.length === 1) {
            map.setView(latLngs[0], 9);
        } else if (latLngs.length > 1) {
            map.fitBounds(latLngs, { padding: [30, 30], maxZoom: 10 });
        } else {
            map.setView(GEORGIA_CENTER, DEFAULT_ZOOM);
        }
    }

    function focusEventOnMap(eventId) {
        ensureMap();
        const marker = markersById.get(String(eventId));
        if (!marker || !map) {
            return false;
        }
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 9));
        marker.openPopup();
        return true;
    }

    window.updateMapMarkers = updateMapMarkers;
    window.focusEventOnMap = focusEventOnMap;
    window.ensureEventsMap = ensureMap;

    document.addEventListener("DOMContentLoaded", () => {
        ensureMap();
    });
})();
