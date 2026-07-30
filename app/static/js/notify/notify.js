let recipsData = [];
let currentSearchQuery = "";

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

function setVisibleState(state) {
    document.getElementById("recipsLoading").classList.toggle("d-none", state !== "loading");
    document.getElementById("recipsEmpty").classList.toggle("d-none", state !== "empty");
    document.getElementById("recipsTableWrap").classList.toggle("d-none", state !== "table");
}

function channelSummary(recip) {
    const emails = Array.isArray(recip.emails) ? recip.emails.length : 0;
    const numbers = Array.isArray(recip.numbers) ? recip.numbers.length : 0;
    return `${emails} email / ${numbers} phone`;
}

function renderRecipsTable(items) {
    const tbody = document.getElementById("recipsTableBody");
    const totalBadge = document.getElementById("recipsTotal");
    tbody.innerHTML = "";

    totalBadge.textContent = `${items.length} / ${recipsData.length}`;

    if (!items.length) {
        setVisibleState("empty");
        return;
    }

    items.forEach((recip) => {
        const row = document.createElement("tr");
        const statusClass = recip.is_active ? "text-bg-success" : "text-bg-secondary";
        const statusLabel = recip.is_active
            ? t("notify.status.active", "Active")
            : t("notify.status.inactive", "Inactive");
        const staffLabel = recip.is_staff
            ? t("notify.staff.yes", "Staff")
            : t("notify.staff.no", "External");
        const staffClass = recip.is_staff ? "text-bg-info" : "text-bg-light text-dark border";

        row.innerHTML = `
            <td>
                <div class="fw-semibold">${escapeHtml(recip.username || "—")}</div>
                <div class="small text-muted">#${escapeHtml(recip.id)}</div>
            </td>
            <td class="text-nowrap">${escapeHtml(channelSummary(recip))}</td>
            <td><span class="badge ${staffClass}">${staffLabel}</span></td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td class="text-nowrap">${formatDate(recip.updated_at)}</td>
            <td class="text-end">
                <div class="d-inline-flex gap-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-primary"
                        data-edit-recip-id="${escapeHtml(recip.id)}"
                    >
                        ${t("notify.table.edit", "Edit")}
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-danger"
                        data-delete-recip-id="${escapeHtml(recip.id)}"
                    >
                        ${t("notify.table.delete", "Delete")}
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    setVisibleState("table");
}

function filterRecips(query) {
    currentSearchQuery = query;
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        renderRecipsTable(recipsData);
        return;
    }

    const filtered = recipsData.filter((recip) => {
        const emails = (recip.emails || []).map((item) => item.email).join(" ");
        const numbers = (recip.numbers || []).map((item) => item.phone_number).join(" ");
        const haystack = [recip.username, emails, numbers, String(recip.id)]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(normalized);
    });

    renderRecipsTable(filtered);
}

function onRecipUpserted(recip) {
    if (!recip?.id) {
        loadRecips();
        return;
    }

    const index = recipsData.findIndex((item) => item.id === recip.id);
    if (index >= 0) {
        recipsData[index] = recip;
    } else {
        recipsData = [...recipsData, recip];
    }
    filterRecips(currentSearchQuery);
}

function onRecipDeleted(recipId) {
    recipsData = recipsData.filter((item) => item.id !== Number(recipId));
    filterRecips(currentSearchQuery);
}

async function deleteRecip(recipId) {
    const confirmed = await window.confirmDelete({
        message: t("notify.delete.confirm", "Are you sure you want to delete this recipient?"),
    });
    if (!confirmed) {
        return;
    }

    try {
        const data = await window.makeApiRequest(`/api/recips/${recipId}`, {
            method: "DELETE",
        });
        onRecipDeleted(recipId);
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

async function loadRecips() {
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

    setVisibleState("loading");

    try {
        const data = await window.makeApiRequest("/api/recips/", { method: "GET" });
        recipsData = Array.isArray(data.items) ? data.items : [];
        filterRecips(currentSearchQuery);
    } catch (error) {
        setVisibleState("empty");
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("notify.error.load", "Failed to load recipients.")
        );
    }
}

window.onRecipUpserted = onRecipUpserted;
window.onRecipDeleted = onRecipDeleted;
window.loadRecips = loadRecips;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("recipsSearch")?.addEventListener("input", (event) => {
        filterRecips(event.target.value);
    });

    document.getElementById("recipsTableBody")?.addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-recip-id]");
        if (editButton) {
            window.openEditRecipModal?.(editButton.dataset.editRecipId);
            return;
        }

        const deleteButton = event.target.closest("[data-delete-recip-id]");
        if (deleteButton) {
            deleteRecip(deleteButton.dataset.deleteRecipId);
        }
    });

    loadRecips();
});
