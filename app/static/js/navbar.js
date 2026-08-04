document.addEventListener("DOMContentLoaded", async function () {
    const navLinksStart = document.getElementById("navLinksStart");
    const navLinksEnd = document.getElementById("navLinksEnd");
    const offcanvasElement = document.getElementById("offcanvasNavbar");
    const i18n = window.I18n;
    const currentPath = window.location.pathname;

    function isActivePath(endpoint) {
        if (!endpoint) {
            return false;
        }
        if (currentPath === endpoint) {
            return true;
        }
        // Match localized routes like /en/accounts and /accounts
        const normalizedCurrent = currentPath.replace(/\/$/, "") || "/";
        const normalizedEndpoint = endpoint.replace(/\/$/, "") || "/";
        return (
            normalizedCurrent === normalizedEndpoint ||
            normalizedCurrent.endsWith(normalizedEndpoint) ||
            normalizedCurrent.endsWith(`/${normalizedEndpoint.replace(/^\//, "")}`)
        );
    }

    function appendNavLink(container, endpoint, text) {
        const link = document.createElement("a");
        link.href = endpoint;
        link.className = isActivePath(endpoint)
            ? "nav-link active text-primary fw-semibold px-2"
            : "nav-link px-2";
        link.textContent = text;

        const listItem = document.createElement("li");
        listItem.className = "nav-item";
        listItem.appendChild(link);
        container.appendChild(listItem);
    }

    // Static navigation
    appendNavLink(
        navLinksStart,
        i18n ? i18n.localizePath("/") : "/",
        i18n ? i18n.t("nav.home", "Home") : "Home"
    );

    const accessToken = localStorage.getItem("access_token");
    const hasValidAccessToken = accessToken && !window.isTokenExpired(accessToken);

    if (hasValidAccessToken) {
        try {
            const user = await window.makeApiRequest("/api/accounts/ourself", { method: "GET" });

            if (user?.can_users) {
                appendNavLink(
                    navLinksStart,
                    i18n ? i18n.localizePath("/accounts") : "/accounts",
                    i18n ? i18n.t("nav.accounts", "Accounts") : "Accounts"
                );
                appendNavLink(
                    navLinksStart,
                    i18n ? i18n.localizePath("/services") : "/services",
                    i18n ? i18n.t("nav.services", "Services") : "Services"
                );
            }

            if (user?.can_recips) {
                appendNavLink(
                    navLinksStart,
                    i18n ? i18n.localizePath("/notify") : "/notify",
                    i18n ? i18n.t("nav.notify", "Notify") : "Notify"
                );
            }
        } catch (error) {
            console.error("Failed to load navbar permissions:", error);
        }

        const logoutItem = document.createElement("li");
        logoutItem.className = "nav-item d-flex align-items-center gap-2 mt-2 mt-lg-0";

        const profileButton = document.createElement("button");
        profileButton.type = "button";
        profileButton.className =
            "btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center";
        profileButton.style.width = "34px";
        profileButton.style.height = "34px";

        const iconImg = document.createElement("img");
        iconImg.src = "/static/images/circle-user-solid.svg";
        iconImg.alt = "User Icon";
        iconImg.style.width = "18px";
        iconImg.style.height = "18px";
        iconImg.style.verticalAlign = "middle";
        profileButton.appendChild(iconImg);
        profileButton.onclick = function () {
            if (typeof window.openUserModal === "function") {
                window.openUserModal();
            } else {
                console.error("openUserModal is not available.");
            }
        };
        logoutItem.appendChild(profileButton);

        const logoutLink = document.createElement("a");
        logoutLink.className = "btn btn-sm btn-outline-danger";
        logoutLink.textContent = i18n ? i18n.t("nav.logout", "Logout") : "Logout";
        logoutLink.onclick = async function (event) {
            event.preventDefault();
            try {
                if (typeof window.makeApiRequest === "function") {
                    await window.makeApiRequest("/api/auth/logout", {
                        method: "POST",
                        skipAuthRefresh: true,
                    });
                } else {
                    await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include",
                        headers: { accept: "application/json" },
                    });
                }
            } catch (error) {
                console.error("Logout request failed:", error);
                if (typeof window.showAlert === "function") {
                    window.showAlert(
                        "alertPlaceholder",
                        "danger",
                        i18n ? i18n.t("alerts.logout_failed", "Logout request failed.") : "Logout request failed."
                    );
                }
            } finally {
                window.clearSessionData();
            }
        };

        logoutItem.appendChild(logoutLink);
        navLinksEnd.appendChild(logoutItem);
    } else {
        if (accessToken && window.isTokenExpired(accessToken)) {
            window.clearSessionData();
            return;
        }

        const authLinks = [
            {
                endpoint: i18n ? i18n.localizePath("/login") : "/login",
                text: i18n ? i18n.t("nav.login", "Login") : "Login",
            },
        ];

        authLinks.forEach((link) => {
            const authItem = document.createElement("li");
            authItem.className = "nav-item mt-2 mt-lg-0";

            const authLink = document.createElement("a");
            authLink.href = link.endpoint;
            authLink.className = isActivePath(link.endpoint)
                ? "btn btn-sm btn-primary"
                : "btn btn-sm btn-outline-primary";
            authLink.textContent = link.text;

            authItem.appendChild(authLink);
            navLinksEnd.appendChild(authItem);
        });
    }

    const langItem = document.createElement("li");
    langItem.className = "nav-item mt-2 mt-lg-0";
    langItem.innerHTML = `
        <div class="btn-group btn-group-sm language-switcher" role="group" aria-label="Language switcher">
            <button type="button" class="btn btn-sm btn-outline-secondary language-btn" id="langEn" aria-label="Switch language to English" title="${i18n ? i18n.t("nav.lang.en", "EN") : "EN"}">
                <img src="/static/images/flag_en.svg" alt="${i18n ? i18n.t("nav.lang.en", "EN") : "EN"} flag" class="language-flag">
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary language-btn" id="langKa" aria-label="Switch language to Georgian" title="${i18n ? i18n.t("nav.lang.ka", "KA") : "KA"}">
                <img src="/static/images/flag_ka.svg" alt="${i18n ? i18n.t("nav.lang.ka", "KA") : "KA"} flag" class="language-flag">
            </button>
        </div>
    `;
    navLinksEnd.appendChild(langItem);

    if (i18n) {
        const currentLang = i18n.getLanguage();
        const langEnButton = document.getElementById("langEn");
        const langKaButton = document.getElementById("langKa");
        if (currentLang === "en") {
            langEnButton.classList.add("active");
        } else {
            langKaButton.classList.add("active");
        }

        langEnButton.addEventListener("click", () => i18n.setLanguage("en"));
        langKaButton.addEventListener("click", () => i18n.setLanguage("ka"));
    }

    if (offcanvasElement && window.bootstrap?.Offcanvas) {
        const offcanvasInstance = bootstrap.Offcanvas.getOrCreateInstance(offcanvasElement);
        offcanvasElement.querySelectorAll("a").forEach((anchor) => {
            anchor.addEventListener("click", () => {
                if (window.innerWidth < 992) {
                    offcanvasInstance.hide();
                }
            });
        });
    }
});
