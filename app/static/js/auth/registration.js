let registrationModal = null;

function t(key, fallback) {
    const i18n = window.I18n;
    return i18n ? i18n.t(key, fallback) : fallback;
}

function resetRegistrationForm() {
    const form = document.getElementById("registrationForm");
    form?.reset();
}

function openRegistrationModal() {
    resetRegistrationForm();
    registrationModal?.show();
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
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("registration.error.validation", "Please fill in all required fields.")
        );
        return;
    }

    if (password !== passwordRepeat) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            t("registration.error.password_mismatch", "Passwords do not match.")
        );
        return;
    }

    submitButton.disabled = true;

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
            "alertPlaceholder",
            "success",
            data.message || t("registration.success", "User registered successfully.")
        );
    } catch (error) {
        window.showAlert(
            "alertPlaceholder",
            "danger",
            error.message || t("registration.error.failed", "Failed to register user.")
        );
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
