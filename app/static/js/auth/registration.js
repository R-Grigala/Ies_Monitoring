let registrationModal = null;

const REGISTRATION_ALERT_ID = "registrationAlertPlaceholder";
const PAGE_ALERT_ID = "alertPlaceholder";

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function clearRegistrationAlert() {
    const container = document.getElementById(REGISTRATION_ALERT_ID);
    if (container) {
        container.innerHTML = "";
    }
}

function showRegistrationAlert(type, message) {
    window.showAlert(REGISTRATION_ALERT_ID, type, message);
}

function resetRegistrationForm() {
    const form = document.getElementById("registrationForm");
    form?.reset();
    clearRegistrationAlert();
}

function openRegistrationModal() {
    resetRegistrationForm();
    registrationModal?.show();
}

function mapRegistrationError(error) {
    const code = error?.code;
    const message = (error?.message || "").toLowerCase();

    if (
        code === "email_already_registered" ||
        message.includes("already registered")
    ) {
        return t(
            "registration.error.email_exists",
            "Email address is already registered."
        );
    }

    if (message.includes("passwords do not match")) {
        return t("registration.error.password_mismatch", "Passwords do not match.");
    }

    if (
        message.includes("at least") ||
        message.includes("upper") ||
        message.includes("lower") ||
        message.includes("digit") ||
        message.includes("special")
    ) {
        return t(
            "registration.error.password_policy",
            "Password must be at least 12 characters with upper, lower, digit and special character."
        );
    }

    return (
        error?.message ||
        t("registration.error.failed", "Failed to register user.")
    );
}

async function submitRegistrationForm(event) {
    event.preventDefault();

    const firstName = document.getElementById("registrationFirstName").value.trim();
    const lastName = document.getElementById("registrationLastName").value.trim();
    const email = document.getElementById("registrationEmail").value.trim();
    const password = document.getElementById("registrationPassword").value;
    const passwordRepeat = document.getElementById("registrationPasswordRepeat").value;
    const submitButton = document.getElementById("registrationSubmit");

    if (!firstName || !lastName || !email || !password || !passwordRepeat) {
        showRegistrationAlert(
            "danger",
            t("registration.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (password !== passwordRepeat) {
        showRegistrationAlert(
            "danger",
            t("registration.error.password_mismatch", "Passwords do not match.")
        );
        return;
    }

    submitButton.disabled = true;
    clearRegistrationAlert();

    try {
        const data = await window.makeApiRequest("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email: email,
                password: password,
                passwordRepeat: passwordRepeat,
            }),
        });

        window.onAccountCreated?.(data.user);
        registrationModal?.hide();
        resetRegistrationForm();
        window.showAlert(
            PAGE_ALERT_ID,
            "success",
            t("registration.success", "User registered successfully.")
        );
    } catch (error) {
        showRegistrationAlert("danger", mapRegistrationError(error));
    } finally {
        submitButton.disabled = false;
    }
}

window.openRegistrationModal = openRegistrationModal;

document.addEventListener("DOMContentLoaded", () => {
    const modalElement = document.getElementById("registrationModal");
    if (modalElement && window.bootstrap?.Modal) {
        registrationModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    }

    document.getElementById("registrationForm")?.addEventListener("submit", submitRegistrationForm);

    window.initPasswordToggle?.({
        fieldId: "registrationPassword",
        toggleId: "toggleRegistrationPassword",
        imageId: "toggleRegistrationPasswordImg",
    });
    window.initPasswordToggle?.({
        fieldId: "registrationPasswordRepeat",
        toggleId: "toggleRegistrationPasswordRepeat",
        imageId: "toggleRegistrationPasswordRepeatImg",
    });
});
