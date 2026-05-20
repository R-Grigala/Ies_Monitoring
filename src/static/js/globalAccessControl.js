function clearSessionData(redirect = true) {
    // Remove all session-related data
    localStorage.removeItem('access_token');
    
    // Optionally redirect the user to the login page or another page
    if (redirect) {
        window.location.href = '/login'; // Redirect to the login page
    }
}

function isTokenExpired(token) {
    if (!token) return true;
    try {
        const payload = decodeJwtPayload(token);
        if (!payload) return true;
        const currentTime = Date.now() / 1000; // Current time in seconds
        return currentTime > payload.exp;
    } catch (error) {
        return true;
    }
}

function decodeJwtPayload(token) {
    if (!token) return null;
    try {
        const payloadPart = token.split('.')[1];
        if (!payloadPart) return null;

        // JWT payload არის base64url ფორმატში და პირდაპირ atob() ყოველთვის ვერ კითხულობს.
        const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch (error) {
        return null;
    }
}

function getAccessTokenClaims() {
    const token = localStorage.getItem('access_token');
    return decodeJwtPayload(token);
}

function hasPermission(permissionName) {
    const claims = getAccessTokenClaims();
    const permissions = claims?.permissions;
    if (!permissions) return false;
    return Boolean(permissions.is_admin || permissions[permissionName]);
}

// Define the refreshToken function globally
function refreshToken() {
    return fetch('/api/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (response.status === 401) {
            // alert("გთხოვთ ხელახლა გაიაროთ ავტორიზაცია.");
            showAlert('alertPlaceholder', 'danger', ' გთხოვთ ხელახლა გაიაროთ ავტორიზაცია.');
            clearSessionData(); // Clear session data and redirect to login
            return Promise.reject('Unauthorized');
        }
        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }
        return response.json();
    })
    .then(data => {
        if (data.access_token) {
            localStorage.setItem('access_token', data.access_token); // Save new access token
            return data.access_token;
        } else {
            throw new Error('Failed to refresh token');
        }
    })
    .catch(error => {
        console.error('Error refreshing token:', error);
        clearSessionData(); // Clear session data and redirect to login
    });
}

function makeApiRequest(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.credentials = 'include';

    const token = localStorage.getItem('access_token');

    if (!token) {
        return fetch(url, options)
            .then(async (response) => {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                return data;
            });
    }

    // Check if the token is expired
    if (isTokenExpired(token)) {
        return refreshToken().then(newToken => {
            options.headers['Authorization'] = `Bearer ${newToken}`;
            return fetch(url, options);
        }).then(async (response) => {
            let data = null;
            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }
            return data;
        });
    }

    // Ensure the Authorization header is set
    options.headers['Authorization'] = `Bearer ${token}`;

    return fetch(url, options)
        .then(response => {
            if (response.status === 401) {
                // Unauthorized - token might be expired
                return refreshToken()
                    .then(newToken => {
                        // Retry the original request with new token
                        options.headers['Authorization'] = `Bearer ${newToken}`;
                        return fetch(url, options);
                    });
            }
            return response;
        })
        .then(async response => {
            let data = null;
            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }
            return data;
        })
        .catch(error => {
            console.error('API Request Error:', error);
            // Handle errors appropriately
        });
}

function showAlert(divID, category, message) {
    const alertPlaceholder = document.getElementById(divID);
    
    // Create a new alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${category} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add the alert to the placeholder
    alertPlaceholder.appendChild(alertDiv);
    
    // Optional: Auto-close the alert after a timeout
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000); // 5000 milliseconds = 5 seconds
}

function closeModal(modalName) {
    const modalElement = document.getElementById(modalName);
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
        modalInstance.hide();
    }
    
    // Manually remove backdrop
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) {
        backdrop.remove();
    }
}

function showConfirmModal({
    title = 'დადასტურება',
    message = 'ნამდვილად გსურთ მოქმედების შესრულება?',
    confirmText = 'დადასტურება',
    cancelText = 'გაუქმება',
    confirmClass = 'btn-danger'
} = {}) {
    return new Promise((resolve) => {
        const modalElement = document.getElementById('globalConfirmModal');
        const titleElement = document.getElementById('globalConfirmModalLabel');
        const messageElement = document.getElementById('globalConfirmModalMessage');
        const confirmButton = document.getElementById('globalConfirmModalConfirmBtn');
        const cancelButton = document.getElementById('globalConfirmModalCancelBtn');

        if (!modalElement || !titleElement || !messageElement || !confirmButton || !cancelButton || typeof bootstrap === 'undefined') {
            resolve(window.confirm(message));
            return;
        }

        titleElement.textContent = title;
        messageElement.textContent = message;
        confirmButton.textContent = confirmText;
        cancelButton.textContent = cancelText;
        confirmButton.className = `btn ${confirmClass}`;

        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
        let isResolved = false;

        const onConfirm = () => {
            if (isResolved) return;
            isResolved = true;
            confirmButton.removeEventListener('click', onConfirm);
            modalElement.removeEventListener('hidden.bs.modal', onHidden);
            modalInstance.hide();
            resolve(true);
        };

        const onHidden = () => {
            if (isResolved) return;
            isResolved = true;
            confirmButton.removeEventListener('click', onConfirm);
            modalElement.removeEventListener('hidden.bs.modal', onHidden);
            resolve(false);
        };

        confirmButton.addEventListener('click', onConfirm, { once: true });
        modalElement.addEventListener('hidden.bs.modal', onHidden, { once: true });
        modalInstance.show();
    });
}

function getPermissions(){
    return getAccessTokenClaims()?.permissions || null;
}

function initPasswordToggle({
    fieldIds = [],
    toggleSelector = '.togglePassword',
    imgSelector = '.togglePasswordImg',
    eyeViewPath = '/static/img/eye-view.svg',
    eyeHidePath = '/static/img/eye-hide.svg'
} = {}) {
    const toggleButtons = document.querySelectorAll(toggleSelector);
    const toggleImages = document.querySelectorAll(imgSelector);
    const passwordFields = fieldIds
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (!toggleButtons.length || !passwordFields.length) {
        return;
    }

    const setVisibility = (isVisible) => {
        const targetType = isVisible ? 'text' : 'password';
        passwordFields.forEach((field) => field.setAttribute('type', targetType));
        toggleImages.forEach((img) => {
            img.src = isVisible ? eyeViewPath : eyeHidePath;
        });
    };

    const onToggle = () => {
        const isCurrentlyHidden = passwordFields[0].getAttribute('type') === 'password';
        setVisibility(isCurrentlyHidden);
    };

    toggleButtons.forEach((button) => {
        button.addEventListener('click', onToggle);
    });
}

window.showConfirmModal = showConfirmModal;
window.initPasswordToggle = initPasswordToggle;
window.hasPermission = hasPermission;


// The DOMContentLoaded event listener
document.addEventListener("DOMContentLoaded", function() {
    const loginPage = '/login';
    const homePage = '/';
    const resetPasswordPage = '/reset_password';
    const currentPage = window.location.pathname;
    const token = localStorage.getItem('access_token');
    const isPublicPage =
        currentPage === '/' ||
        currentPage === '/shakemap' ||
        currentPage.startsWith('/shakemap/') ||
        currentPage === '/events' ||
        currentPage.startsWith('/events/');


    if (!token && currentPage !== loginPage && !isPublicPage && !currentPage.startsWith(resetPasswordPage)) {
        window.location.href = loginPage;
    }

    // Check if the token is expired and redirect to login if necessary
    if (token && isTokenExpired(token) && !isPublicPage) {
        refreshToken(); // Clear session data and redirect to login
    }

    // Redirect to home page if token exists and user is on the login or registration page
    if (token && (currentPage === loginPage)) {
        window.location.href = homePage;
    }
});