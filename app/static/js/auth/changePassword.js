async function submitChangePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById("currentPassword").value;
    const password = document.getElementById("password").value;
    const retypePassword = document.getElementById("retypePassword").value;
    const accessToken = localStorage.getItem("access_token");
    const i18n = window.I18n;

    if (!accessToken || window.isTokenExpired?.(accessToken)) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            i18n
                ? i18n.t("alerts.session_expired", "Session has expired. Please sign in again.")
                : "Please sign in first."
        );
        window.clearSessionData?.();
        return;
    }

    if (password !== retypePassword) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            i18n
                ? i18n.t("auth.password_mismatch", "Passwords do not match.")
                : "Passwords do not match."
        );
        return;
    }

    try {
        const data = await window.makeApiRequest("/api/auth/change_password", {
            method: "PUT",
            body: JSON.stringify({
                current_password: currentPassword,
                password: password,
                retype_password: retypePassword,
            }),
        });

        window.showAlert(
            "alertPlaceholder",
            "success",
            data.message ||
                (i18n
                    ? i18n.t("auth.change_password.success", "Password changed successfully.")
                    : "Password changed successfully.")
        );

        setTimeout(() => {
            window.clearSessionData?.();
            const loginPath = window.I18n?.localizePath?.("/login") || "/login";
            window.location.href = loginPath;
        }, 1000);
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message ||
                (i18n
                    ? i18n.t(
                          "auth.change_password.error",
                          "Request failed while changing password."
                      )
                    : "Request failed while changing password.")
        );
    }
}

document.getElementById("changePasswordForm").onsubmit = submitChangePassword;
window.initPasswordToggle?.({
    fieldId: "currentPassword",
    toggleId: "toggleCurrentPassword",
    imageId: "toggleCurrentPasswordImg",
});
window.initPasswordToggle?.({
    fieldId: "password",
    toggleId: "toggleNewPassword",
    imageId: "toggleNewPasswordImg",
});
window.initPasswordToggle?.({
    fieldId: "retypePassword",
    toggleId: "toggleRetypePassword",
    imageId: "toggleRetypePasswordImg",
});
