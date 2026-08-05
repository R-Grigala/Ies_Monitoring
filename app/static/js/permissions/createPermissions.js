let createPermissionModal = null;

const CREATE_PERMISSION_ALERT_ID = "createPermissionAlertPlaceholder";

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function ensureCreatePermissionModal() {
    if (createPermissionModal) {
        return createPermissionModal;
    }

    const modalElement = document.getElementById("createPermissionModal");
    if (modalElement && window.bootstrap?.Modal) {
        createPermissionModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    return createPermissionModal;
}

function clearCreatePermissionAlert() {
    const container = document.getElementById(CREATE_PERMISSION_ALERT_ID);
    if (container) {
        container.innerHTML = "";
    }
}

function resetCreatePermissionForm() {
    document.getElementById("createPermissionForm")?.reset();
    clearCreatePermissionAlert();
}

function openCreatePermissionModal() {
    const modal = ensureCreatePermissionModal();
    if (!modal) {
        window.showAlert?.(
            "alertPlaceholder",
            "danger",
            t("permissions.error.create", "Failed to create permission.")
        );
        return;
    }

    resetCreatePermissionForm();
    modal.show();
}

async function submitCreatePermissionForm(event) {
    event.preventDefault();

    const code = document.getElementById("createPermissionCode")?.value.trim() || "";
    const name = document.getElementById("createPermissionName")?.value.trim() || "";
    const description =
        document.getElementById("createPermissionDescription")?.value.trim() || "";
    const submitButton = document.getElementById("createPermissionSubmit");

    if (!code || !name) {
        window.showAlert(
            CREATE_PERMISSION_ALERT_ID,
            "danger",
            t("permissions.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
    }
    clearCreatePermissionAlert();

    try {
        const data = await window.makeApiRequest("/api/permissions/", {
            method: "POST",
            body: JSON.stringify({
                code,
                name,
                description: description || null,
            }),
        });

        if (data.permission) {
            window.onPermissionCreated?.(data.permission);
        } else {
            window.reloadPermissionsList?.();
        }

        ensureCreatePermissionModal()?.hide();
        resetCreatePermissionForm();

        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("permissions.create.success", "Permission created successfully.")
        );
    } catch (error) {
        window.showAlert(
            CREATE_PERMISSION_ALERT_ID,
            "danger",
            error.message || t("permissions.error.create", "Failed to create permission.")
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

window.openCreatePermissionModal = openCreatePermissionModal;

document.addEventListener("DOMContentLoaded", () => {
    ensureCreatePermissionModal();

    document
        .getElementById("createPermissionForm")
        ?.addEventListener("submit", submitCreatePermissionForm);
    document.getElementById("addPermissionButton")?.addEventListener("click", (event) => {
        event.preventDefault();
        openCreatePermissionModal();
    });
});
