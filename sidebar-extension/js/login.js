// DOM elements
const membershipKeyInput = document.getElementById('membership-key');
const loginButton = document.getElementById('login-button');
const keyError = document.getElementById('key-error');
const statusMessage = document.getElementById('status-message');

// Initialize: Check if already logged in (optional, background might handle this better)
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
        if (authState?.isAuthenticated) {
            showSuccessMessage(`Already logged in as ${authState.userName}. Redirecting...`);
            // Optionally close this tab after a delay if login is successful elsewhere
            setTimeout(() => window.close(), 2000);
        }
    } catch (error) {
        console.error('Error checking initial auth state:', error);
    }
});

// Handle login button click
loginButton.addEventListener('click', async () => {
    const key = membershipKeyInput.value.trim();
    if (!key) {
        showKeyError('Please enter your membership key.');
        return;
    }
    hideKeyError();
    hideStatusMessage();
    setButtonLoading(true);

    try {
        // Send login request to background script
        const response = await chrome.runtime.sendMessage({
            type: 'AUTH_LOGIN',
            payload: { key }
        });

        if (response?.success) {
            showSuccessMessage(`Login successful! Welcome, ${response.userName}.`);
            membershipKeyInput.value = ''; // Clear input on success
            // Optionally close this tab after a delay
            setTimeout(() => window.close(), 1500);
        } else {
            showErrorMessage(response?.error || 'Login failed. Please check your key.');
        }
    } catch (error) {
        showErrorMessage(`Login error: ${error.message || 'Cannot connect to background service.'}`);
        console.error('Login error:', error);
    } finally {
        setButtonLoading(false);
    }
});

// Handle Enter key press
membershipKeyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        loginButton.click();
    }
    // Clear error on input change
    if (keyError.style.display === 'block') {
        hideKeyError();
    }
});

// Helper functions
function showKeyError(message) {
    keyError.textContent = message;
    keyError.style.display = 'block';
    membershipKeyInput.classList.add('error');
}

function hideKeyError() {
    keyError.style.display = 'none';
    membershipKeyInput.classList.remove('error');
}

function showSuccessMessage(message) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message success';
    statusMessage.style.display = 'block';
}

function showErrorMessage(message) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message error';
    statusMessage.style.display = 'block';
}

function hideStatusMessage() {
    statusMessage.style.display = 'none';
}

function setButtonLoading(isLoading) {
    loginButton.disabled = isLoading;
    if (isLoading) {
        loginButton.dataset.originalText = loginButton.textContent;
        loginButton.innerHTML = `<span class="loading-spinner"></span> Logging in...`;
    } else {
        loginButton.innerHTML = loginButton.dataset.originalText || 'Login';
    }
}