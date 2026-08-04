let accountsData = [];
let currentSearchQuery = "";
let currentUserUuid = null;

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

function getCurrentUserUuidFromToken() {
    const token = localStorage.getItem("access_token");
    if (!token) {
        return null;
    }

    try {
        const payloadBase64 = token.split(".")[1];
        if (!payloadBase64) {
            return null;
        }
        const payload = JSON.parse(atob(payloadBase64));
        return payload.sub || null;
    } catch (error) {
        return null;
    }
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

function getInitials(firstName, lastName) {
    const first = (firstName || "").trim().charAt(0);
    const last = (lastName || "").trim().charAt(0);
    return (first + last).toUpperCase() || "?";
}

function getFullName(user) {
    return `${user.first_name || ""} ${user.last_name || ""}`.trim() || "—";
}

function setVisibleState(state) {
    document.getElementById("accountsLoading").classList.toggle("d-none", state !== "loading");
    document.getElementById("accountsEmpty").classList.toggle("d-none", state !== "empty");
    document.getElementById("accountsTableWrap").classList.toggle("d-none", state !== "table");
}

function renderAccountsTable(items) {
    const tbody = document.getElementById("accountsTableBody");
    const totalBadge = document.getElementById("accountsTotal");
    tbody.innerHTML = "";

    totalBadge.textContent = `${items.length} / ${accountsData.length}`;

    if (!items.length) {
        setVisibleState("empty");
        return;
    }

    items.forEach((user) => {
        const row = document.createElement("tr");
        const statusClass = user.is_active ? "text-bg-success" : "text-bg-secondary";
        const statusLabel = user.is_active
            ? t("accounts.status.active", "Active")
            : t("accounts.status.inactive", "Inactive");
        const isCurrentUser = currentUserUuid && user.uuid === currentUserUuid;
        const deleteButton = isCurrentUser
            ? ""
            : `
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    data-delete-uuid="${escapeHtml(user.uuid)}"
                >
                    ${t("accounts.table.delete", "Delete")}
                </button>
            `;

        row.innerHTML = `
            <td>
                <div class="d-flex align-items-center gap-3">
                    <div class="accounts-avatar">${escapeHtml(getInitials(user.first_name, user.last_name))}</div>
                    <div>
                        <div class="fw-semibold">${escapeHtml(getFullName(user))}</div>
                        <div class="small text-muted">${escapeHtml(user.uuid)}</div>
                    </div>
                </div>
            </td>
            <td class="text-break">${escapeHtml(user.email || "—")}</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td class="text-nowrap">${formatDate(user.created_at)}</td>
            <td class="text-nowrap">${formatDate(user.updated_at)}</td>
            <td class="text-end">
                <div class="d-inline-flex gap-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-primary"
                        data-edit-uuid="${escapeHtml(user.uuid)}"
                    >
                        ${t("accounts.table.edit", "Edit")}
                    </button>
                    ${deleteButton}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    setVisibleState("table");
}

function filterAccounts(query) {
    currentSearchQuery = query;
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        renderAccountsTable(accountsData);
        return;
    }

    const filtered = accountsData.filter((user) => {
        const haystack = [
            user.first_name,
            user.last_name,
            user.email,
            user.uuid,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(normalized);
    });

    renderAccountsTable(filtered);
}

function onAccountUpdated(updatedUser) {
    if (!updatedUser?.uuid) {
        return;
    }

    accountsData = accountsData.map((user) =>
        user.uuid === updatedUser.uuid ? { ...user, ...updatedUser } : user
    );
    filterAccounts(currentSearchQuery);
}

function onAccountDeleted(userUuid) {
    accountsData = accountsData.filter((user) => user.uuid !== userUuid);
    filterAccounts(currentSearchQuery);
}

function onAccountCreated(createdUser) {
    if (createdUser?.uuid) {
        accountsData = [...accountsData, createdUser];
        filterAccounts(currentSearchQuery);
        return;
    }
    loadAccounts();
}

async function deleteAccount(userUuid) {
    if (currentUserUuid && userUuid === currentUserUuid) {
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

    try {
        const data = await window.makeApiRequest(`/api/accounts/${userUuid}`, {
            method: "DELETE",
        });
        onAccountDeleted(userUuid);
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
    }
}

async function loadAccounts() {
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

    currentUserUuid = getCurrentUserUuidFromToken();
    setVisibleState("loading");

    try {
        const data = await window.makeApiRequest("/api/accounts/", { method: "GET" });
        accountsData = Array.isArray(data.items) ? data.items : [];
        filterAccounts(currentSearchQuery);
    } catch (error) {
        setVisibleState("empty");
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("accounts.error.load", "Failed to load accounts.")
        );
    }
}

window.onAccountUpdated = onAccountUpdated;
window.onAccountDeleted = onAccountDeleted;
window.onAccountCreated = onAccountCreated;
window.getCurrentAccountsUserUuid = () => currentUserUuid;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("accountsSearch")?.addEventListener("input", (event) => {
        filterAccounts(event.target.value);
    });

    document.getElementById("accountsTableBody")?.addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-uuid]");
        if (editButton) {
            window.openEditAccountModal?.(editButton.dataset.editUuid);
            return;
        }

        const deleteButton = event.target.closest("[data-delete-uuid]");
        if (deleteButton) {
            deleteAccount(deleteButton.dataset.deleteUuid);
        }
    });

    loadAccounts();
});
