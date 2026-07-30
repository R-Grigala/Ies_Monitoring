let editRecipModal = null;
let currentEditRecip = null;

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

function renderEmailsList(emails) {
    const container = document.getElementById("editRecipEmailsList");
    container.innerHTML = "";

    if (!emails?.length) {
        container.innerHTML = `<div class="text-muted small">${t("notify.emails.empty", "No emails yet.")}</div>`;
        return;
    }

    emails.forEach((email) => {
        const row = document.createElement("div");
        row.className = "d-flex align-items-center justify-content-between gap-2 border rounded px-3 py-2";
        row.innerHTML = `
            <div class="text-break">
                <div>${escapeHtml(email.email)}</div>
                <div class="small text-muted">${email.is_active ? t("notify.status.active", "Active") : t("notify.status.inactive", "Inactive")}</div>
            </div>
            <div class="d-flex gap-2 flex-shrink-0">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-email-id="${email.id}">
                    ${email.is_active ? t("notify.channel.deactivate", "Deactivate") : t("notify.channel.activate", "Activate")}
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-delete-email-id="${email.id}">
                    ${t("notify.channel.delete", "Remove")}
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

function renderNumbersList(numbers) {
    const container = document.getElementById("editRecipNumbersList");
    container.innerHTML = "";

    if (!numbers?.length) {
        container.innerHTML = `<div class="text-muted small">${t("notify.numbers.empty", "No phone numbers yet.")}</div>`;
        return;
    }

    numbers.forEach((number) => {
        const row = document.createElement("div");
        row.className = "d-flex align-items-center justify-content-between gap-2 border rounded px-3 py-2";
        row.innerHTML = `
            <div class="text-break">
                <div>${escapeHtml(number.phone_number)}</div>
                <div class="small text-muted">${number.is_active ? t("notify.status.active", "Active") : t("notify.status.inactive", "Inactive")}</div>
            </div>
            <div class="d-flex gap-2 flex-shrink-0">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-toggle-number-id="${number.id}">
                    ${number.is_active ? t("notify.channel.deactivate", "Deactivate") : t("notify.channel.activate", "Activate")}
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-delete-number-id="${number.id}">
                    ${t("notify.channel.delete", "Remove")}
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

function fillEditRecipForm(recip) {
    currentEditRecip = recip;
    document.getElementById("editRecipId").value = recip.id;
    document.getElementById("editRecipUsername").value = recip.username || "";
    document.getElementById("editRecipIsStaff").checked = Boolean(recip.is_staff);
    document.getElementById("editRecipIsActive").checked = Boolean(recip.is_active);
    document.getElementById("editRecipNewEmail").value = "";
    document.getElementById("editRecipNewNumber").value = "";
    renderEmailsList(recip.emails || []);
    renderNumbersList(recip.numbers || []);
}

async function openEditRecipModal(recipId) {
    try {
        const recip = await window.makeApiRequest(`/api/recips/${recipId}`, { method: "GET" });
        fillEditRecipForm(recip);
        editRecipModal?.show();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.load_one", "Failed to load recipient.")
        );
    }
}

async function refreshEditRecip() {
    const recipId = document.getElementById("editRecipId").value;
    if (!recipId) {
        return;
    }
    const recip = await window.makeApiRequest(`/api/recips/${recipId}`, { method: "GET" });
    fillEditRecipForm(recip);
    window.onRecipUpserted?.(recip);
}

async function submitEditRecipForm(event) {
    event.preventDefault();

    const recipId = document.getElementById("editRecipId").value;
    const username = document.getElementById("editRecipUsername").value.trim();
    const isStaff = document.getElementById("editRecipIsStaff").checked;
    const isActive = document.getElementById("editRecipIsActive").checked;
    const submitButton = document.getElementById("editRecipSubmit");

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
        const data = await window.makeApiRequest(`/api/recips/${recipId}`, {
            method: "PUT",
            body: JSON.stringify({
                username,
                is_staff: isStaff,
                is_active: isActive,
            }),
        });

        window.onRecipUpserted?.(data.recip || data);
        window.closeModal("editRecipModal");
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("notify.edit.success", "Recipient updated successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.update", "Failed to update recipient.")
        );
    } finally {
        submitButton.disabled = false;
    }
}

async function addRecipEmail() {
    const recipId = document.getElementById("editRecipId").value;
    const email = document.getElementById("editRecipNewEmail").value.trim();
    if (!email) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("notify.emails.required", "Please enter an email address.")
        );
        return;
    }

    try {
        await window.makeApiRequest(`/api/recips/${recipId}/emails`, {
            method: "POST",
            body: JSON.stringify({ email, is_active: true }),
        });
        await refreshEditRecip();
        window.showAlert(
            "alertPlaceholder",
            "success",
            t("notify.emails.added", "Email added successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.email", "Failed to manage email.")
        );
    }
}

async function addRecipNumber() {
    const recipId = document.getElementById("editRecipId").value;
    const phoneNumber = document.getElementById("editRecipNewNumber").value.trim();
    if (!phoneNumber) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("notify.numbers.required", "Please enter a phone number.")
        );
        return;
    }

    try {
        await window.makeApiRequest(`/api/recips/${recipId}/numbers`, {
            method: "POST",
            body: JSON.stringify({ phone_number: phoneNumber, is_active: true }),
        });
        await refreshEditRecip();
        window.showAlert(
            "alertPlaceholder",
            "success",
            t("notify.numbers.added", "Phone number added successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.number", "Failed to manage phone number.")
        );
    }
}

async function toggleRecipEmail(emailId) {
    const email = (currentEditRecip?.emails || []).find((item) => item.id === Number(emailId));
    if (!email) {
        return;
    }

    try {
        await window.makeApiRequest(`/api/recips/emails/${emailId}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: !email.is_active }),
        });
        await refreshEditRecip();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.email", "Failed to manage email.")
        );
    }
}

async function toggleRecipNumber(numberId) {
    const number = (currentEditRecip?.numbers || []).find((item) => item.id === Number(numberId));
    if (!number) {
        return;
    }

    try {
        await window.makeApiRequest(`/api/recips/numbers/${numberId}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: !number.is_active }),
        });
        await refreshEditRecip();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.number", "Failed to manage phone number.")
        );
    }
}

async function deleteRecipEmail(emailId) {
    try {
        await window.makeApiRequest(`/api/recips/emails/${emailId}`, { method: "DELETE" });
        await refreshEditRecip();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.email", "Failed to manage email.")
        );
    }
}

async function deleteRecipNumber(numberId) {
    try {
        await window.makeApiRequest(`/api/recips/numbers/${numberId}`, { method: "DELETE" });
        await refreshEditRecip();
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.number", "Failed to manage phone number.")
        );
    }
}

async function deleteRecipFromModal() {
    const recipId = document.getElementById("editRecipId").value;
    const confirmed = await window.confirmDelete({
        message: t("notify.delete.confirm", "Are you sure you want to delete this recipient?"),
    });
    if (!confirmed) {
        return;
    }

    try {
        const data = await window.makeApiRequest(`/api/recips/${recipId}`, { method: "DELETE" });
        window.onRecipDeleted?.(recipId);
        window.closeModal("editRecipModal");
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("notify.delete.success", "Recipient deleted successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.delete", "Failed to delete recipient.")
        );
    }
}

window.openEditRecipModal = openEditRecipModal;

document.addEventListener("DOMContentLoaded", () => {
    const modalElement = document.getElementById("editRecipModal");
    if (modalElement && window.bootstrap?.Modal) {
        editRecipModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    document.getElementById("editRecipForm")?.addEventListener("submit", submitEditRecipForm);
    document.getElementById("editRecipAddEmail")?.addEventListener("click", addRecipEmail);
    document.getElementById("editRecipAddNumber")?.addEventListener("click", addRecipNumber);
    document.getElementById("editRecipDelete")?.addEventListener("click", deleteRecipFromModal);

    document.getElementById("editRecipEmailsList")?.addEventListener("click", (event) => {
        const toggleButton = event.target.closest("[data-toggle-email-id]");
        if (toggleButton) {
            toggleRecipEmail(toggleButton.dataset.toggleEmailId);
            return;
        }
        const deleteButton = event.target.closest("[data-delete-email-id]");
        if (deleteButton) {
            deleteRecipEmail(deleteButton.dataset.deleteEmailId);
        }
    });

    document.getElementById("editRecipNumbersList")?.addEventListener("click", (event) => {
        const toggleButton = event.target.closest("[data-toggle-number-id]");
        if (toggleButton) {
            toggleRecipNumber(toggleButton.dataset.toggleNumberId);
            return;
        }
        const deleteButton = event.target.closest("[data-delete-number-id]");
        if (deleteButton) {
            deleteRecipNumber(deleteButton.dataset.deleteNumberId);
        }
    });
});
