let registerServiceModal = null;
let apiKeyRevealModal = null;
let serviceAvailablePermissions = [];
let servicePermissionsLoadPromise = null;

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

function ensureRegisterServiceModal() {
    if (registerServiceModal) {
        return registerServiceModal;
    }

    const modalElement = document.getElementById("registerServiceModal");
    if (modalElement && window.bootstrap?.Modal) {
        registerServiceModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    return registerServiceModal;
}

function ensureApiKeyRevealModal() {
    if (apiKeyRevealModal) {
        return apiKeyRevealModal;
    }

    const modalElement = document.getElementById("apiKeyRevealModal");
    if (modalElement && window.bootstrap?.Modal) {
        apiKeyRevealModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    return apiKeyRevealModal;
}

function renderServicePermissions(isLoading = false) {
    const container = document.getElementById("registerServicePermissions");
    if (!container) {
        return;
    }

    if (isLoading) {
        container.innerHTML = `<div class="text-muted small py-2 px-1">${escapeHtml(
            t("services.register.permissions_loading", "Loading permissions...")
        )}</div>`;
        return;
    }

    if (!serviceAvailablePermissions.length) {
        container.innerHTML = `<div class="text-muted small py-2 px-1">${escapeHtml(
            t("services.register.permissions_empty", "No permissions available.")
        )}</div>`;
        return;
    }

    container.innerHTML = serviceAvailablePermissions
        .map((permission) => {
            const code = permission.code;
            const name = permission.name || permission.code;
            const description = permission.description
                ? `<div class="registration-permission-desc text-muted">${escapeHtml(
                      permission.description
                  )}</div>`
                : "";
            return `
                <label class="registration-permission-item" for="svc_perm_${escapeHtml(code)}">
                    <input
                        class="form-check-input service-permission-check"
                        type="checkbox"
                        value="${escapeHtml(code)}"
                        id="svc_perm_${escapeHtml(code)}"
                    >
                    <span class="registration-permission-copy">
                        <span class="registration-permission-code">${escapeHtml(code)}</span>
                        <span class="registration-permission-name">${escapeHtml(name)}</span>
                        ${description}
                    </span>
                </label>
            `;
        })
        .join("");
}

async function loadServicePermissions({ force = false } = {}) {
    if (!force && serviceAvailablePermissions.length) {
        renderServicePermissions(false);
        return serviceAvailablePermissions;
    }

    if (servicePermissionsLoadPromise) {
        return servicePermissionsLoadPromise;
    }

    renderServicePermissions(true);

    servicePermissionsLoadPromise = (async () => {
        try {
            const data = await window.makeApiRequest("/api/permissions/", { method: "GET" });
            const items = Array.isArray(data.items) ? data.items : [];
            serviceAvailablePermissions = items.filter(
                (permission) => permission.is_active !== false
            );
        } catch (_error) {
            serviceAvailablePermissions = [];
            window.showAlert?.(
                "alertPlaceholder",
                "danger",
                t(
                    "services.register.permissions_load_error",
                    "Failed to load permissions."
                )
            );
        } finally {
            servicePermissionsLoadPromise = null;
        }

        renderServicePermissions(false);
        return serviceAvailablePermissions;
    })();

    return servicePermissionsLoadPromise;
}

function resetRegisterServiceForm() {
    const form = document.getElementById("registerServiceForm");
    form?.reset();
    document.querySelectorAll(".service-permission-check").forEach((input) => {
        input.checked = false;
    });
}

async function openRegisterServiceModal() {
    const modal = ensureRegisterServiceModal();
    if (!modal) {
        window.showAlert?.(
            "alertPlaceholder",
            "danger",
            t("services.error.register", "Failed to register service.")
        );
        return;
    }

    resetRegisterServiceForm();
    modal.show();
    await loadServicePermissions({ force: true });
    window.I18n?.applyTranslations?.();
}

function showApiKeyReveal(apiKey) {
    const input = document.getElementById("apiKeyRevealValue");
    if (input) {
        input.value = apiKey || "";
    }
    ensureApiKeyRevealModal()?.show();
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
    } catch (_error) {
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

        if (data.service) {
            window.onServiceCreated?.(data.service);
        } else {
            window.reloadServicesList?.();
        }

        ensureRegisterServiceModal()?.hide();
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

window.openRegisterServiceModal = openRegisterServiceModal;

document.addEventListener("DOMContentLoaded", () => {
    ensureRegisterServiceModal();
    ensureApiKeyRevealModal();

    document
        .getElementById("registerServiceForm")
        ?.addEventListener("submit", submitRegisterServiceForm);
    document.getElementById("apiKeyCopyButton")?.addEventListener("click", copyApiKey);
    document.getElementById("addServiceButton")?.addEventListener("click", (event) => {
        event.preventDefault();
        openRegisterServiceModal();
    });
});
