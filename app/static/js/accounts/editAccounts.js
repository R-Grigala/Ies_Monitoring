let editAccountModal = null;

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
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
}

async function openEditAccountModal(userUuid) {
    try {
        const user = await window.makeApiRequest(`/api/accounts/accounts/${userUuid}`, {
            method: "GET",
        });

        document.getElementById("editAccountUuid").value = user.uuid;
        document.getElementById("editAccountFirstName").value = user.first_name || "";
        document.getElementById("editAccountLastName").value = user.last_name || "";
        document.getElementById("editAccountEmail").value = user.email || "";
        document.getElementById("editAccountIsActive").checked = Boolean(user.is_active);
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
        const data = await window.makeApiRequest(`/api/accounts/accounts/${userUuid}`, {
            method: "PUT",
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email: email,
                is_active: isActive,
            }),
        });

        const updatedUser = data.user || data;
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
        const data = await window.makeApiRequest(`/api/accounts/accounts/${userUuid}`, {
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
