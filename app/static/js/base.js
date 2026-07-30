function showAlert(targetId, type, message) {
    const container = document.getElementById(targetId);
    if (!container) {
        window.alert(message);
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.role = "alert";
    wrapper.innerHTML = `
        <span>${message}</span>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    container.innerHTML = "";
    container.appendChild(wrapper);
}

function getLoginPath() {
    const i18n = window.I18n;
    return i18n ? i18n.localizePath("/login") : "/login";
}

function isTokenExpired(token) {
    try {
        const payloadBase64 = token.split(".")[1];
        if (!payloadBase64) return true;
        const payload = JSON.parse(atob(payloadBase64));
        if (!payload.exp) return true;
        const nowInSeconds = Math.floor(Date.now() / 1000);
        return payload.exp <= nowInSeconds;
    } catch (error) {
        return true;
    }
}

function clearSessionData() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = getLoginPath();
}

function closeModal(modalId) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !window.bootstrap?.Modal) {
        return;
    }

    const instance = window.bootstrap.Modal.getInstance(modalElement);
    if (instance) {
        instance.hide();
        return;
    }

    const created = new window.bootstrap.Modal(modalElement);
    created.hide();
}

function confirmDelete(options = {}) {
    const i18n = window.I18n;
    const modalElement = document.getElementById("confirmDeleteModal");
    const titleElement = document.getElementById("confirmDeleteModalLabel");
    const messageElement = document.getElementById("confirmDeleteMessage");
    const confirmButton = document.getElementById("confirmDeleteConfirm");
    const cancelButton = document.getElementById("confirmDeleteCancel");

    if (!modalElement || !window.bootstrap?.Modal) {
        const fallbackMessage =
            options.message ||
            (i18n
                ? i18n.t("confirm.delete.message", "Are you sure you want to delete this item?")
                : "Are you sure you want to delete this item?");
        return Promise.resolve(window.confirm(fallbackMessage));
    }

    const title =
        options.title ||
        (i18n ? i18n.t("confirm.delete.title", "Confirm delete") : "Confirm delete");
    const message =
        options.message ||
        (i18n
            ? i18n.t(
                  "confirm.delete.message",
                  "Are you sure you want to delete this item? This action cannot be undone."
              )
            : "Are you sure you want to delete this item? This action cannot be undone.");
    const confirmText =
        options.confirmText ||
        (i18n ? i18n.t("confirm.delete.confirm", "Delete") : "Delete");
    const cancelText =
        options.cancelText ||
        (i18n ? i18n.t("confirm.delete.cancel", "Cancel") : "Cancel");

    if (titleElement) {
        titleElement.textContent = title;
    }
    if (messageElement) {
        messageElement.textContent = message;
    }
    if (confirmButton) {
        confirmButton.textContent = confirmText;
    }
    if (cancelButton) {
        cancelButton.textContent = cancelText;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);

    return new Promise((resolve) => {
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            confirmButton?.removeEventListener("click", onConfirm);
            modalElement.removeEventListener("hidden.bs.modal", onHidden);
            resolve(result);
        };

        const onConfirm = () => {
            finish(true);
            modal.hide();
        };

        const onHidden = () => {
            finish(false);
        };

        confirmButton?.addEventListener("click", onConfirm);
        modalElement.addEventListener("hidden.bs.modal", onHidden);
        modal.show();
    });
}

function initPasswordToggle(options = {}) {
    const eyeViewPath = options.eyeViewPath || "/static/images/eye-view.svg";
    const eyeHidePath = options.eyeHidePath || "/static/images/eye-hide.svg";

    function bindToggle(input, toggleElement, imageElement) {
        if (!input || !toggleElement || toggleElement.dataset.toggleBound === "true") {
            return;
        }

        const icon = imageElement || toggleElement.querySelector("img");
        const toggleVisibility = () => {
            const isPassword = input.getAttribute("type") === "password";
            input.setAttribute("type", isPassword ? "text" : "password");
            if (icon) {
                icon.src = isPassword ? eyeViewPath : eyeHidePath;
            }
        };

        toggleElement.addEventListener("click", (event) => {
            event.preventDefault();
            toggleVisibility();
        });

        // Non-button elements (e.g. <i>) also become keyboard-accessible.
        if (toggleElement.tagName !== "BUTTON") {
            toggleElement.setAttribute("role", "button");
            toggleElement.setAttribute("tabindex", "0");
            toggleElement.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleVisibility();
                }
            });
        }

        toggleElement.dataset.toggleBound = "true";
    }

    if (options.fieldId && options.toggleId) {
        bindToggle(
            document.getElementById(options.fieldId),
            document.getElementById(options.toggleId),
            options.imageId ? document.getElementById(options.imageId) : null
        );
        return;
    }

    if (Array.isArray(options.fieldIds)) {
        options.fieldIds.forEach((fieldId) => {
            const input = document.getElementById(fieldId);
            if (!input) return;

            const adjacentToggle = input.parentElement?.querySelector(".togglePassword") || input.nextElementSibling;
            if (!adjacentToggle) return;

            bindToggle(input, adjacentToggle, adjacentToggle.querySelector(".togglePasswordImg"));
        });
    }
}

async function refreshAccessToken() {
    const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: {
            Accept: "application/json",
        },
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok || !data?.access_token) {
        return null;
    }

    localStorage.setItem("access_token", data.access_token);
    return data.access_token;
}

async function makeApiRequest(path, options = {}) {
    const accessToken = localStorage.getItem("access_token");
    const headers = {
        Accept: "application/json",
        ...(options.headers || {}),
    };

    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const requestInit = {
        credentials: "include",
        ...options,
        headers,
    };

    let response = await fetch(path, requestInit);

    // One automatic refresh retry on auth failures.
    if (response.status === 401 && options.skipAuthRefresh !== true) {
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
            clearSessionData();
            throw new Error("Unauthorized");
        }

        const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${newAccessToken}`,
        };

        response = await fetch(path, {
            ...requestInit,
            headers: retryHeaders,
        });
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;

    if (!response.ok) {
        const errorMessage = data?.message || data?.error || "Request failed.";
        const error = new Error(errorMessage);
        error.code = data?.error || null;
        error.status = response.status;
        throw error;
    }

    return data;
}

window.showAlert = showAlert;
window.isTokenExpired = isTokenExpired;
window.clearSessionData = clearSessionData;
window.closeModal = closeModal;
window.confirmDelete = confirmDelete;
window.initPasswordToggle = initPasswordToggle;
window.makeApiRequest = makeApiRequest;
