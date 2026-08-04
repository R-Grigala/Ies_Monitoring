let servicesData = [];
let currentSearchQuery = "";
let registerServiceModal = null;
let apiKeyRevealModal = null;

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

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    const lang = window.I18n?.getLanguage?.() || "en";
    return date.toLocaleString(lang === "ka" ? "ka-GE" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function setVisibleState(state) {
    document.getElementById("servicesLoading")?.classList.toggle("d-none", state !== "loading");
    document.getElementById("servicesEmpty")?.classList.toggle("d-none", state !== "empty");
    document.getElementById("servicesTableWrap")?.classList.toggle("d-none", state !== "table");
}

function renderPermissions(permissions) {
    const list = Array.isArray(permissions) ? permissions : [];
    if (!list.length) {
        return `<span class="text-muted">—</span>`;
    }
    return list
        .map((code) => `<span class="badge text-bg-light border me-1 mb-1">${escapeHtml(code)}</span>`)
        .join("");
}

function renderServicesTable(items) {
    const tbody = document.getElementById("servicesTableBody");
    const totalBadge = document.getElementById("servicesTotal");
    if (!tbody || !totalBadge) {
        return;
    }

    tbody.innerHTML = "";
    totalBadge.textContent = `${items.length} / ${servicesData.length}`;

    if (!items.length) {
        setVisibleState("empty");
        return;
    }

    items.forEach((service) => {
        const row = document.createElement("tr");
        const statusClass = service.is_active ? "text-bg-success" : "text-bg-secondary";
        const statusLabel = service.is_active
            ? t("services.status.active", "Active")
            : t("services.status.inactive", "Inactive");

        row.innerHTML = `
            <td>
                <div class="fw-semibold">${escapeHtml(service.name || "—")}</div>
                <div class="small text-muted text-break">${escapeHtml(service.uuid || "")}</div>
                <div class="small text-muted">${escapeHtml(service.description || "")}</div>
            </td>
            <td class="font-monospace">${escapeHtml(service.api_key_prefix || "—")}</td>
            <td>${renderPermissions(service.permissions)}</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td class="text-nowrap">${formatDate(service.last_used_at)}</td>
            <td class="text-nowrap">${formatDate(service.created_at)}</td>
            <td class="text-end">
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    data-delete-uuid="${escapeHtml(service.uuid)}"
                >
                    ${t("services.table.delete", "Delete")}
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    setVisibleState("table");
}

function filterServices(query) {
    currentSearchQuery = query;
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        renderServicesTable(servicesData);
        return;
    }

    const filtered = servicesData.filter((service) => {
        const haystack = [
            service.name,
            service.description,
            service.uuid,
            service.api_key_prefix,
            ...(Array.isArray(service.permissions) ? service.permissions : []),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(normalized);
    });

    renderServicesTable(filtered);
}

function resetRegisterServiceForm() {
    const form = document.getElementById("registerServiceForm");
    form?.reset();
}

function openRegisterServiceModal() {
    resetRegisterServiceForm();
    registerServiceModal?.show();
}

function showApiKeyReveal(apiKey) {
    const input = document.getElementById("apiKeyRevealValue");
    if (input) {
        input.value = apiKey || "";
    }
    apiKeyRevealModal?.show();
}

async function copyApiKey() {
    const value = document.getElementById("apiKeyRevealValue")?.value || "";
    if (!value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        window.showAlert(
            "alertPlaceholder",
            "success",
            t("services.apikey.copied", "API key copied to clipboard.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("services.apikey.copy_failed", "Could not copy API key.")
        );
    }
}

async function submitRegisterServiceForm(event) {
    event.preventDefault();

    const name = document.getElementById("registerServiceName")?.value.trim() || "";
    const description = document.getElementById("registerServiceDescription")?.value.trim() || "";
    const permissions = Array.from(document.querySelectorAll(".service-permission-check:checked")).map(
        (input) => input.value
    );
    const submitButton = document.getElementById("registerServiceSubmit");

    if (!name) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("services.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (!permissions.length) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("services.error.permissions", "Select at least one permission.")
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const data = await window.makeApiRequest("/api/services/", {
            method: "POST",
            body: JSON.stringify({
                name,
                description: description || null,
                permissions,
            }),
        });

        if (data.service?.uuid) {
            servicesData = [data.service, ...servicesData];
            filterServices(currentSearchQuery);
        } else {
            await loadServices();
        }

        registerServiceModal?.hide();
        resetRegisterServiceForm();

        if (data.api_key) {
            showApiKeyReveal(data.api_key);
        }

        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("services.register.success", "Service registered successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("services.error.register", "Failed to register service.")
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function deleteService(serviceUuid) {
    const confirmed = await window.confirmDelete({
        message: t("services.delete.confirm", "Are you sure you want to delete this service?"),
    });
    if (!confirmed) {
        return;
    }

    try {
        const data = await window.makeApiRequest(`/api/services/${serviceUuid}`, {
            method: "DELETE",
        });
        servicesData = servicesData.filter((service) => service.uuid !== serviceUuid);
        filterServices(currentSearchQuery);
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("services.delete.success", "Service deleted successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("services.error.delete", "Failed to delete service.")
        );
    }
}

async function loadServices() {
    const token = localStorage.getItem("access_token");
    if (!token || window.isTokenExpired(token)) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("alerts.session_expired", "Session has expired. Please sign in again.")
        );
        window.clearSessionData();
        return;
    }

    setVisibleState("loading");

    try {
        const data = await window.makeApiRequest("/api/services/", { method: "GET" });
        servicesData = Array.isArray(data.items) ? data.items : [];
        filterServices(currentSearchQuery);
    } catch (error) {
        setVisibleState("empty");
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("services.error.load", "Failed to load services.")
        );
    }
}

window.openRegisterServiceModal = openRegisterServiceModal;

document.addEventListener("DOMContentLoaded", () => {
    const registerModalElement = document.getElementById("registerServiceModal");
    if (registerModalElement && window.bootstrap?.Modal) {
        registerServiceModal = bootstrap.Modal.getOrCreateInstance(registerModalElement);
    }

    const apiKeyModalElement = document.getElementById("apiKeyRevealModal");
    if (apiKeyModalElement && window.bootstrap?.Modal) {
        apiKeyRevealModal = bootstrap.Modal.getOrCreateInstance(apiKeyModalElement);
    }

    document.getElementById("registerServiceForm")?.addEventListener("submit", submitRegisterServiceForm);
    document.getElementById("apiKeyCopyButton")?.addEventListener("click", copyApiKey);

    document.getElementById("servicesSearch")?.addEventListener("input", (event) => {
        filterServices(event.target.value);
    });

    document.getElementById("servicesTableBody")?.addEventListener("click", (event) => {
        const deleteButton = event.target.closest("[data-delete-uuid]");
        if (deleteButton) {
            deleteService(deleteButton.dataset.deleteUuid);
        }
    });

    loadServices();
});
