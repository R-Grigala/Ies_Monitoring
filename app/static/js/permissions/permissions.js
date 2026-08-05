let permissionsData = [];
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
    document.getElementById("permissionsLoading")?.classList.toggle("d-none", state !== "loading");
    document.getElementById("permissionsEmpty")?.classList.toggle("d-none", state !== "empty");
    document.getElementById("permissionsTableWrap")?.classList.toggle("d-none", state !== "table");
}

function renderPermissionsTable(items) {
    const tbody = document.getElementById("permissionsTableBody");
    const totalBadge = document.getElementById("permissionsTotal");
    if (!tbody || !totalBadge) {
        return;
    }

    tbody.innerHTML = "";
    totalBadge.textContent = `${items.length} / ${permissionsData.length}`;

    if (!items.length) {
        setVisibleState("empty");
        return;
    }

    items.forEach((permission) => {
        const row = document.createElement("tr");
        const statusClass = permission.is_active ? "text-bg-success" : "text-bg-secondary";
        const statusLabel = permission.is_active
            ? t("permissions.status.active", "Active")
            : t("permissions.status.inactive", "Inactive");
        const code = permission.code || "";

        row.innerHTML = `
            <td class="font-monospace fw-semibold">${escapeHtml(code)}</td>
            <td>${escapeHtml(permission.name || "—")}</td>
            <td class="text-muted small">${escapeHtml(permission.description || "—")}</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td class="text-nowrap">${formatDate(permission.updated_at || permission.created_at)}</td>
            <td class="text-end">
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    data-delete-code="${escapeHtml(code)}"
                    ${permission.is_active ? "" : "disabled"}
                >
                    ${t("permissions.table.delete", "Delete")}
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    setVisibleState("table");
}

function filterPermissions(query) {
    currentSearchQuery = query;
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        renderPermissionsTable(permissionsData);
        return;
    }

    const filtered = permissionsData.filter((permission) => {
        const haystack = [permission.code, permission.name, permission.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(normalized);
    });

    renderPermissionsTable(filtered);
}

function onPermissionCreated(permission) {
    if (!permission?.code) {
        return;
    }
    const without = permissionsData.filter((item) => item.code !== permission.code);
    permissionsData = [permission, ...without].sort((a, b) =>
        String(a.code || "").localeCompare(String(b.code || ""))
    );
    filterPermissions(currentSearchQuery);
}

async function deletePermission(code) {
    if (!code) {
        return;
    }

    const confirmed = await window.confirmDelete({
        message: t(
            "permissions.delete.confirm",
            "Are you sure you want to delete this permission?"
        ),
    });
    if (!confirmed) {
        return;
    }

    try {
        const data = await window.makeApiRequest(`/api/permissions/${encodeURIComponent(code)}`, {
            method: "DELETE",
        });
        await loadPermissions();
        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message || t("permissions.delete.success", "Permission deleted successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("permissions.error.delete", "Failed to delete permission.")
        );
    }
}

async function loadPermissions() {
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
        const data = await window.makeApiRequest("/api/permissions/", { method: "GET" });
        permissionsData = Array.isArray(data.items) ? data.items : [];
        filterPermissions(currentSearchQuery);
    } catch (error) {
        setVisibleState("empty");
        if (error?.status === 403 || error?.code === "forbidden") {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t(
                    "permissions.error.forbidden",
                    "You do not have permission to manage the catalog."
                )
            );
            const i18n = window.I18n;
            window.location.href = i18n ? i18n.localizePath("/accounts") : "/accounts";
            return;
        }
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("permissions.error.load", "Failed to load permissions.")
        );
    }
}

function accountsPath() {
    const i18n = window.I18n;
    return i18n ? i18n.localizePath("/accounts") : "/accounts";
}

function loginPath() {
    const i18n = window.I18n;
    return i18n ? i18n.localizePath("/login") : "/login";
}

async function ensureCanPermissions() {
    const token = localStorage.getItem("access_token");
    if (!token || window.isTokenExpired?.(token)) {
        window.location.href = loginPath();
        return false;
    }

    try {
        const user = await window.makeApiRequest("/api/accounts/ourself", { method: "GET" });
        if (!user?.can_permissions) {
            window.showAlert(
                "alertPlaceholder",
                "danger",
                t(
                    "permissions.error.forbidden",
                    "You do not have permission to manage the catalog."
                )
            );
            window.location.href = accountsPath();
            return false;
        }
        return true;
    } catch (_error) {
        window.location.href = loginPath();
        return false;
    }
}

window.onPermissionCreated = onPermissionCreated;
window.reloadPermissionsList = loadPermissions;

document.addEventListener("DOMContentLoaded", async () => {
    const allowed = await ensureCanPermissions();
    if (!allowed) {
        return;
    }

    document.getElementById("permissionsSearch")?.addEventListener("input", (event) => {
        filterPermissions(event.target.value);
    });

    document.getElementById("permissionsTableBody")?.addEventListener("click", (event) => {
        const deleteButton = event.target.closest("[data-delete-code]");
        if (deleteButton && !deleteButton.disabled) {
            deletePermission(deleteButton.dataset.deleteCode);
        }
    });

    loadPermissions();
});
