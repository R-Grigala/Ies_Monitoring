let registerServiceModal = null;
let apiKeyRevealModal = null;

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
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

function resetRegisterServiceForm() {
    const form = document.getElementById("registerServiceForm");
    form?.reset();
}

function openRegisterServiceModal() {
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
