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

function clearSessionData() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = getLoginPath();
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
        throw new Error(errorMessage);
    }

    return data;
}

window.showAlert = showAlert;
window.clearSessionData = clearSessionData;
window.makeApiRequest = makeApiRequest;
