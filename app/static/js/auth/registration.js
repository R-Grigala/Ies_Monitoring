let registrationModal = null;
let registrationAvailablePermissions = [];
let registrationPermissionsLoadPromise = null;

const REGISTRATION_ALERT_ID = "registrationAlertPlaceholder";
const PAGE_ALERT_ID = "alertPlaceholder";

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

function clearRegistrationAlert() {
    const container = document.getElementById(REGISTRATION_ALERT_ID);
    if (container) {
        container.innerHTML = "";
    }
}

function showRegistrationAlert(type, message) {
    window.showAlert(REGISTRATION_ALERT_ID, type, message);
}

function ensureRegistrationModal() {
    if (registrationModal) {
        return registrationModal;
    }

    const modalElement = document.getElementById("registrationModal");
    if (modalElement && window.bootstrap?.Modal) {
        registrationModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    return registrationModal;
}

function renderRegistrationPermissions(isLoading = false) {
    const container = document.getElementById("registrationPermissions");
    if (!container) {
        return;
    }

    if (isLoading) {
        container.innerHTML = `<div class="text-muted small">${escapeHtml(
            t("registration.permissions_loading", "Loading permissions...")
        )}</div>`;
        return;
    }

    if (!registrationAvailablePermissions.length) {
        container.innerHTML = `<div class="text-muted small">${escapeHtml(
            t("registration.permissions_empty", "No permissions available.")
        )}</div>`;
        return;
    }

    container.innerHTML = registrationAvailablePermissions
        .map((permission) => {
            const code = permission.code;
            const label = permission.name
                ? `${permission.code} — ${permission.name}`
                : permission.code;
            return `
                <div class="form-check">
                    <input
                        class="form-check-input registration-permission"
                        type="checkbox"
                        value="${escapeHtml(code)}"
                        id="reg_perm_${escapeHtml(code)}"
                    >
                    <label class="form-check-label" for="reg_perm_${escapeHtml(code)}">
                        ${escapeHtml(label)}
                    </label>
                </div>
            `;
        })
        .join("");
}

function getSelectedRegistrationPermissionCodes() {
    return Array.from(document.querySelectorAll(".registration-permission:checked")).map(
        (input) => input.value
    );
}

async function loadRegistrationPermissions() {
    if (registrationAvailablePermissions.length) {
        renderRegistrationPermissions(false);
        return registrationAvailablePermissions;
    }

    if (registrationPermissionsLoadPromise) {
        return registrationPermissionsLoadPromise;
    }

    renderRegistrationPermissions(true);

    registrationPermissionsLoadPromise = (async () => {
        try {
            const data = await window.makeApiRequest("/api/permissions/", { method: "GET" });
            const items = Array.isArray(data.items) ? data.items : [];
            registrationAvailablePermissions = items.filter((permission) => permission.is_active !== false);
        } catch (_error) {
            registrationAvailablePermissions = [];
        } finally {
            registrationPermissionsLoadPromise = null;
        }

        renderRegistrationPermissions(false);
        return registrationAvailablePermissions;
    })();

    return registrationPermissionsLoadPromise;
}

function resetRegistrationForm() {
    const form = document.getElementById("registrationForm");
    form?.reset();
    clearRegistrationAlert();
    if (registrationAvailablePermissions.length) {
        renderRegistrationPermissions(false);
    } else {
        renderRegistrationPermissions(true);
    }
}

function openRegistrationModal() {
    const modal = ensureRegistrationModal();
    if (!modal) {
        window.showAlert?.(
            PAGE_ALERT_ID,
            "danger",
            t("registration.error.failed", "Failed to register user.")
        );
        return;
    }

    resetRegistrationForm();
    modal.show();
    void loadRegistrationPermissions();
}

function mapRegistrationError(error) {
    const code = error?.code;
    const message = (error?.message || "").toLowerCase();

    if (
        code === "email_already_registered" ||
        message.includes("already registered")
    ) {
        return t(
            "registration.error.email_exists",
            "Email address is already registered."
        );
    }

    if (message.includes("passwords do not match")) {
        return t("registration.error.password_mismatch", "Passwords do not match.");
    }

    if (
        message.includes("at least") ||
        message.includes("upper") ||
        message.includes("lower") ||
        message.includes("digit") ||
        message.includes("special")
    ) {
        return t(
            "registration.error.password_policy",
            "Password must be at least 12 characters with upper, lower, digit and special character."
        );
    }

    return (
        error?.message ||
        t("registration.error.failed", "Failed to register user.")
    );
}

async function submitRegistrationForm(event) {
    event.preventDefault();

    const firstName = document.getElementById("registrationFirstName").value.trim();
    const lastName = document.getElementById("registrationLastName").value.trim();
    const email = document.getElementById("registrationEmail").value.trim();
    const password = document.getElementById("registrationPassword").value;
    const passwordRepeat = document.getElementById("registrationPasswordRepeat").value;
    const permissionCodes = getSelectedRegistrationPermissionCodes();
    const submitButton = document.getElementById("registrationSubmit");

    if (!firstName || !lastName || !email || !password || !passwordRepeat) {
        showRegistrationAlert(
            "danger",
            t("registration.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (password !== passwordRepeat) {
        showRegistrationAlert(
            "danger",
            t("registration.error.password_mismatch", "Passwords do not match.")
        );
        return;
    }

    submitButton.disabled = true;
    clearRegistrationAlert();

    try {
        const payload = {
            first_name: firstName,
            last_name: lastName,
            email: email,
            password: password,
            passwordRepeat: passwordRepeat,
        };
        if (permissionCodes.length) {
            payload.permission_codes = permissionCodes;
        }

        const data = await window.makeApiRequest("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        const user = data.user || {};
        if (Array.isArray(data.permissions)) {
            user.permissions = data.permissions;
        }
        window.onAccountCreated?.(user);
        ensureRegistrationModal()?.hide();
        resetRegistrationForm();
        window.showAlert(
            PAGE_ALERT_ID,
            "success",
            t("registration.success", "User registered successfully.")
        );
    } catch (error) {
        showRegistrationAlert("danger", mapRegistrationError(error));
    } finally {
        submitButton.disabled = false;
    }
}

window.openRegistrationModal = openRegistrationModal;

document.addEventListener("DOMContentLoaded", () => {
    ensureRegistrationModal();

    document.getElementById("registrationForm")?.addEventListener("submit", submitRegistrationForm);
    document.getElementById("addAccountButton")?.addEventListener("click", (event) => {
        event.preventDefault();
        openRegistrationModal();
    });

    window.initPasswordToggle?.({
        fieldId: "registrationPassword",
        toggleId: "toggleRegistrationPassword",
        imageId: "toggleRegistrationPasswordImg",
    });
    window.initPasswordToggle?.({
        fieldId: "registrationPasswordRepeat",
        toggleId: "toggleRegistrationPasswordRepeat",
        imageId: "toggleRegistrationPasswordRepeatImg",
    });
});
