let editAccountModal = null;
let editAccountAvailablePermissions = [];
let currentUserPermissionCodes = new Set();
let canManagePermissions = false;

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

function setPermissionsSectionVisible(visible) {
    document.getElementById("editAccountPermissionsSection")?.classList.toggle("d-none", !visible);
}

function applySelfAccountRestrictions(userUuid) {
    const isCurrentUser = userUuid && userUuid === window.getCurrentAccountsUserUuid?.();
    const activeSwitch = document.getElementById("editAccountIsActive");
    const activeHint = document.getElementById("editAccountActiveHint");
    const deleteButton = document.getElementById("editAccountDelete");

    if (activeSwitch) {
        activeSwitch.disabled = Boolean(isCurrentUser);
        if (isCurrentUser) {
            activeSwitch.checked = true;
        }
    }

    activeHint?.classList.toggle("d-none", !isCurrentUser);
    if (deleteButton) {
        deleteButton.classList.toggle("d-none", Boolean(isCurrentUser));
    }

    // Disallow unchecking admin self can_users / can_permissions
    document.querySelectorAll(".edit-account-permission").forEach((input) => {
        const code = input.value;
        const isProtected =
            isCurrentUser && (code === "can_users" || code === "can_permissions") && input.checked;
        input.disabled = Boolean(isProtected);
    });
}

function renderPermissionCheckboxes(selectedCodes) {
    const container = document.getElementById("editAccountPermissions");
    if (!container) {
        return;
    }

    const selected = new Set(selectedCodes || []);
    if (!editAccountAvailablePermissions.length) {
        container.innerHTML = `<div class="text-muted small">${escapeHtml(
            t("accounts.edit.permissions_empty", "No permissions available.")
        )}</div>`;
        return;
    }

    container.innerHTML = editAccountAvailablePermissions
        .map((permission) => {
            const code = permission.code;
            const checked = selected.has(code) ? "checked" : "";
            const label = permission.name
                ? `${permission.code} — ${permission.name}`
                : permission.code;
            return `
                <div class="form-check">
                    <input
                        class="form-check-input edit-account-permission"
                        type="checkbox"
                        value="${escapeHtml(code)}"
                        id="perm_${escapeHtml(code)}"
                        ${checked}
                    >
                    <label class="form-check-label" for="perm_${escapeHtml(code)}">
                        ${escapeHtml(label)}
                    </label>
                </div>
            `;
        })
        .join("");
}

function getSelectedPermissionCodes() {
    return Array.from(document.querySelectorAll(".edit-account-permission:checked")).map(
        (input) => input.value
    );
}

async function loadAvailablePermissions() {
    if (editAccountAvailablePermissions.length) {
        return editAccountAvailablePermissions;
    }
    const data = await window.makeApiRequest("/api/permissions/", { method: "GET" });
    const items = Array.isArray(data.items) ? data.items : [];
    editAccountAvailablePermissions = items.filter((permission) => permission.is_active !== false);
    return editAccountAvailablePermissions;
}

async function resolveCanManagePermissions() {
    try {
        const profile = await window.makeApiRequest("/api/accounts/ourself", { method: "GET" });
        canManagePermissions = Boolean(profile?.can_permissions);
    } catch (_error) {
        canManagePermissions = false;
    }
    return canManagePermissions;
}

async function syncUserPermissions(userUuid) {
    if (!canManagePermissions) {
        return { granted: [], revoked: [] };
    }

    const desired = new Set(getSelectedPermissionCodes());
    const current = new Set(currentUserPermissionCodes);
    const toGrant = [...desired].filter((code) => !current.has(code));
    const toRevoke = [...current].filter((code) => !desired.has(code));

    if (toGrant.length) {
        await window.makeApiRequest(`/api/accounts/${userUuid}/permissions`, {
            method: "POST",
            body: JSON.stringify({ permission_codes: toGrant }),
        });
    }

    for (const code of toRevoke) {
        await window.makeApiRequest(`/api/accounts/${userUuid}/permissions/${code}`, {
            method: "DELETE",
        });
    }

    currentUserPermissionCodes = desired;
    return { granted: toGrant, revoked: toRevoke };
}

async function openEditAccountModal(userUuid) {
    try {
        await resolveCanManagePermissions();
        setPermissionsSectionVisible(canManagePermissions);

        const loadCatalog = canManagePermissions
            ? loadAvailablePermissions()
            : Promise.resolve([]);

        const [user] = await Promise.all([
            window.makeApiRequest(`/api/accounts/${userUuid}`, { method: "GET" }),
            loadCatalog,
        ]);

        let permissionCodes = Array.isArray(user.permissions) ? user.permissions : [];
        currentUserPermissionCodes = new Set(permissionCodes);

        document.getElementById("editAccountUuid").value = user.uuid;
        document.getElementById("editAccountFirstName").value = user.first_name || "";
        document.getElementById("editAccountLastName").value = user.last_name || "";
        document.getElementById("editAccountEmail").value = user.email || "";
        document.getElementById("editAccountIsActive").checked = Boolean(user.is_active);

        if (canManagePermissions) {
            renderPermissionCheckboxes(permissionCodes);
        }
        applySelfAccountRestrictions(user.uuid);

        editAccountModal?.show();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("accounts.error.load_user", "Failed to load account details.")
        );
    }
}

async function submitEditAccountForm(event) {
    event.preventDefault();

    const userUuid = document.getElementById("editAccountUuid").value;
    const firstName = document.getElementById("editAccountFirstName").value.trim();
    const lastName = document.getElementById("editAccountLastName").value.trim();
    const email = document.getElementById("editAccountEmail").value.trim();
    const activeSwitch = document.getElementById("editAccountIsActive");
    const isCurrentUser = userUuid && userUuid === window.getCurrentAccountsUserUuid?.();
    const isActive = isCurrentUser ? true : activeSwitch.checked;
    const submitButton = document.getElementById("editAccountSubmit");

    if (!firstName || !lastName || !email) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("accounts.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    submitButton.disabled = true;

    try {
        const data = await window.makeApiRequest(`/api/accounts/${userUuid}`, {
            method: "PUT",
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email: email,
                is_active: isActive,
            }),
        });

        await syncUserPermissions(userUuid);

        const updatedUser = data.user || data;
        if (canManagePermissions) {
            updatedUser.permissions = getSelectedPermissionCodes();
        }
        window.onAccountUpdated?.(updatedUser);
        editAccountModal?.hide();
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("accounts.edit.success", "Account updated successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("accounts.error.update", "Failed to update account.")
        );
    } finally {
        submitButton.disabled = false;
    }
}

async function deleteAccountFromModal() {
    const userUuid = document.getElementById("editAccountUuid").value;
    if (!userUuid) {
        return;
    }

    if (userUuid === window.getCurrentAccountsUserUuid?.()) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("accounts.error.delete_self", "You cannot delete your own account.")
        );
        return;
    }

    const confirmed = await window.confirmDelete({
        message: t("accounts.delete.confirm", "Are you sure you want to delete this account?"),
    });
    if (!confirmed) {
        return;
    }

    const deleteButton = document.getElementById("editAccountDelete");
    deleteButton.disabled = true;

    try {
        const data = await window.makeApiRequest(`/api/accounts/${userUuid}`, {
            method: "DELETE",
        });
        window.onAccountDeleted?.(userUuid);
        window.closeModal("editAccountModal");
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("accounts.delete.success", "Account deleted successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("accounts.error.delete", "Failed to delete account.")
        );
    } finally {
        deleteButton.disabled = false;
    }
}

window.openEditAccountModal = openEditAccountModal;

document.addEventListener("DOMContentLoaded", () => {
    const modalElement = document.getElementById("editAccountModal");
    if (modalElement && window.bootstrap?.Modal) {
        editAccountModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    document.getElementById("editAccountForm")?.addEventListener("submit", submitEditAccountForm);
    document.getElementById("editAccountDelete")?.addEventListener("click", deleteAccountFromModal);
});
