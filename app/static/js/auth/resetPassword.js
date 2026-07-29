function submitResetPassword(event) {
    event.preventDefault();

    const password = document.getElementById('password').value;
    const retypePassword = document.getElementById('retypePassword').value;
    const hasToken = typeof token !== 'undefined' && token !== null && String(token).trim() !== '';

    if (!hasToken) {
        showAlert('alertPlaceholder', 'danger', 'Invalid or expired reset link.');
        return;
    }

    window.makeApiRequest('/api/auth/reset_password', {
        method: 'PUT',
        skipAuthRefresh: true,
        body: JSON.stringify({
            password: password,
            retype_password: retypePassword,
            token: token
        })
    })
    .then((data) => {
        showAlert('alertPlaceholder', 'success', data.message || 'Password reset successfully.');
        setTimeout(() => {
            clearSessionData();
        }, 1000);
    })
    .catch((error) => {
        showAlert('alertPlaceholder', 'danger', error.message || 'Failed to reset password.');
    });
}

document.getElementById('resetPasswordForm').onsubmit = submitResetPassword;
window.initPasswordToggle?.({
    fieldId: 'password',
    toggleId: 'toggleNewPassword',
    imageId: 'toggleNewPasswordImg'
});
window.initPasswordToggle?.({
    fieldId: 'retypePassword',
    toggleId: 'toggleRetypePassword',
    imageId: 'toggleRetypePasswordImg'
});
