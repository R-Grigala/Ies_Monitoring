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

function accountsPath() {
    const i18n = window.I18n;
    return i18n ? i18n.localizePath("/accounts") : "/accounts";
}

function loginPath() {
    const i18n = window.I18n;
    return i18n ? i18n.localizePath("/login") : "/login";
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

function renderRegistrationPermissions(isLoading = false) {
    const container = document.getElementById("registrationPermissions");
    if (!container) {
        return;
    }

    if (isLoading) {
        container.innerHTML = `<div class="text-muted small py-2 px-1">${escapeHtml(
            t("registration.permissions_loading", "Loading permissions...")
        )}</div>`;
        return;
    }

    if (!registrationAvailablePermissions.length) {
        container.innerHTML = `<div class="text-muted small py-2 px-1">${escapeHtml(
            t("registration.permissions_empty", "No permissions available.")
        )}</div>`;
        return;
    }

    container.innerHTML = registrationAvailablePermissions
        .map((permission) => {
            const code = permission.code;
            const name = permission.name || permission.code;
            const description = permission.description
                ? `<div class="registration-permission-desc text-muted">${escapeHtml(
                      permission.description
                  )}</div>`
                : "";
            return `
                <label class="registration-permission-item" for="reg_perm_${escapeHtml(code)}">
                    <input
                        class="form-check-input registration-permission"
                        type="checkbox"
                        value="${escapeHtml(code)}"
                        id="reg_perm_${escapeHtml(code)}"
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
            registrationAvailablePermissions = items.filter(
                (permission) => permission.is_active !== false
            );
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

    if (error?.status === 403 || code === "forbidden") {
        return t(
            "registration.error.forbidden",
            "You do not have permission to register users."
        );
    }

    return (
        error?.message ||
        t("registration.error.failed", "Failed to register user.")
    );
}

async function ensureCanRegisterUsers() {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken || window.isTokenExpired?.(accessToken)) {
        window.location.href = loginPath();
        return null;
    }

    try {
        const user = await window.makeApiRequest("/api/accounts/ourself", { method: "GET" });
        if (!user?.can_users) {
            window.showAlert(
                PAGE_ALERT_ID,
                "danger",
                t(
                    "registration.error.forbidden",
                    "You do not have permission to register users."
                )
            );
            window.location.href = accountsPath();
            return null;
        }
        return user;
    } catch (_error) {
        window.location.href = loginPath();
        return null;
    }
}

function setRegistrationPermissionsVisible(visible) {
    document
        .getElementById("registrationPermissionsSection")
        ?.classList.toggle("d-none", !visible);
}

async function submitRegistrationForm(event) {
    event.preventDefault();

    const firstName = document.getElementById("registrationFirstName").value.trim();
    const lastName = document.getElementById("registrationLastName").value.trim();
    const email = document.getElementById("registrationEmail").value.trim();
    const password = document.getElementById("registrationPassword").value;
    const passwordRepeat = document.getElementById("registrationPasswordRepeat").value;
    const canAssignPermissions = !document
        .getElementById("registrationPermissionsSection")
        ?.classList.contains("d-none");
    const permissionCodes = canAssignPermissions
        ? getSelectedRegistrationPermissionCodes()
        : [];
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

        await window.makeApiRequest("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        // Surface success on accounts list after redirect.
        sessionStorage.setItem(
            "accountsFlash",
            JSON.stringify({
                type: "success",
                message: t("registration.success", "User registered successfully."),
            })
        );
        window.location.href = accountsPath();
    } catch (error) {
        showRegistrationAlert("danger", mapRegistrationError(error));
        submitButton.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("registrationForm");
    if (!form) {
        return;
    }

    const profile = await ensureCanRegisterUsers();
    if (!profile) {
        return;
    }

    const canAssignPermissions = Boolean(profile.can_permissions);
    setRegistrationPermissionsVisible(canAssignPermissions);

    form.addEventListener("submit", submitRegistrationForm);
    if (canAssignPermissions) {
        void loadRegistrationPermissions();
    }

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
