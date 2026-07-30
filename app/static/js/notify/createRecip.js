let createRecipModal = null;

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function openCreateRecipModal() {
    document.getElementById("createRecipForm")?.reset();
    document.getElementById("createRecipIsActive").checked = true;
    createRecipModal?.show();
}

async function submitCreateRecipForm(event) {
    event.preventDefault();

    const username = document.getElementById("createRecipUsername").value.trim();
    const isStaff = document.getElementById("createRecipIsStaff").checked;
    const isActive = document.getElementById("createRecipIsActive").checked;
    const submitButton = document.getElementById("createRecipSubmit");

    if (!username) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("notify.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    submitButton.disabled = true;

    try {
        const data = await window.makeApiRequest("/api/recips/", {
            method: "POST",
            body: JSON.stringify({
                username,
                is_staff: isStaff,
                is_active: isActive,
            }),
        });

        window.onRecipUpserted?.(data.recip);
        window.closeModal("createRecipModal");
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("notify.create.success", "Recipient created successfully.")
        );

        if (data.recip?.id) {
            window.openEditRecipModal?.(data.recip.id);
        }
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.create", "Failed to create recipient.")
        );
    } finally {
        submitButton.disabled = false;
    }
}

window.openCreateRecipModal = openCreateRecipModal;

document.addEventListener("DOMContentLoaded", () => {
    const modalElement = document.getElementById("createRecipModal");
    if (modalElement && window.bootstrap?.Modal) {
        createRecipModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    document.getElementById("createRecipForm")?.addEventListener("submit", submitCreateRecipForm);
});
