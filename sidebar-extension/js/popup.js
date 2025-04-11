// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const apiStatus = document.getElementById('api-status');
const refreshStatusButton = document.getElementById('refresh-status');
const loggedOutView = document.getElementById('logged-out-view');
const loggedInView = document.getElementById('logged-in-view');
const openLoginButton = document.getElementById('open-login');
const openSidebarButton = document.getElementById('open-sidebar');
const logoutButton = document.getElementById('logout');
const userNameDisplay = document.getElementById('user-name');
const sidebarToggle = document.getElementById('sidebar-toggle');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    // Request initial data from background
    await Promise.all([
        checkApiStatus(),
        loadAuthState(),
        loadSettings()
    ]);

    // Set up event listeners
    refreshStatusButton.addEventListener('click', checkApiStatus);
    openLoginButton.addEventListener('click', openLogin);
    openSidebarButton.addEventListener('click', openSidebar);
    logoutButton.addEventListener('click', logout);
    sidebarToggle.addEventListener('change', toggleSidebarSetting);

    // Listen for auth state changes from background/storage
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.authState) {
            updateAuthUI(changes.authState.newValue);
        }
        if (areaName === 'local' && changes.sidebarSettings) {
            updateSettingsUI(changes.sidebarSettings.newValue);
        }
    });
});

// Check API status via background script
async function checkApiStatus() {
    try {
        statusIndicator.className = 'status-indicator';
        apiStatus.textContent = 'Checking...';
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_SERVICE' });
        updateStatusUI(response?.isHealthy);
    } catch (error) {
        updateStatusUI(false);
        console.error('Status check error:', error);
    }
}

// Update status UI
function updateStatusUI(isHealthy) {
    if (isHealthy) {
        statusIndicator.className = 'status-indicator online';
        apiStatus.textContent = 'API Online';
    } else {
        statusIndicator.className = 'status-indicator offline';
        apiStatus.textContent = 'API Offline';
    }
}

// Load authentication state from background/storage
async function loadAuthState() {
    try {
        // Request current state from background
        const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
        updateAuthUI(authState);
    } catch (error) {
        console.error('Error loading auth state:', error);
        updateAuthUI(null); // Assume logged out on error
    }
}

// Update authentication UI
function updateAuthUI(authState) {
    const isAuthenticated = authState?.isAuthenticated;
    loggedOutView.style.display = isAuthenticated ? 'none' : 'block';
    loggedInView.style.display = isAuthenticated ? 'block' : 'none';
    if (isAuthenticated) {
        userNameDisplay.textContent = authState.userName || 'User';
    }
}

// Load sidebar settings from background/storage
async function loadSettings() {
    try {
        const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        updateSettingsUI(settings);
    } catch (error) {
        console.error('Error loading settings:', error);
        updateSettingsUI({ isEnabled: true }); // Default on error
    }
}

// Update settings UI
function updateSettingsUI(settings) {
    sidebarToggle.checked = settings?.isEnabled ?? true; // Default to true if undefined
}


// Toggle sidebar visibility setting via background/storage
async function toggleSidebarSetting(event) {
    try {
        const isEnabled = event.target.checked;
        // Update storage directly (background listener will notify content scripts)
        const { sidebarSettings = {} } = await chrome.storage.local.get(['sidebarSettings']);
        sidebarSettings.isEnabled = isEnabled;
        await chrome.storage.local.set({ sidebarSettings });
        // UI updates via onChanged listener
    } catch (error) {
        console.error('Error saving settings:', error);
        // Revert UI on error?
        event.target.checked = !event.target.checked;
    }
}

// Open login page in a new tab
function openLogin() {
    chrome.tabs.create({ url: chrome.runtime.getURL('login.html') });
    window.close(); // Close popup
}

// Request sidebar opening in current tab
async function openSidebar() {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
            // Message content script directly (background script handles injection if needed)
            await chrome.tabs.sendMessage(activeTab.id, { type: 'SHOW_SIDEBAR' });
            window.close(); // Close popup after sending message
        } else {
            console.error("Could not find active tab to open sidebar.");
        }
    } catch (error) {
        console.error('Error opening sidebar:', error);
        // Handle error (e.g., show message to user)
        // If error is "Receiving end does not exist", background script's context menu handler
        // should have already injected the script. Retrying might be complex from popup.
    }
}

// Request logout via background script
async function logout() {
    try {
        await chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' });
        // UI update will happen via onChanged listener
    } catch (error) {
        console.error('Error during logout:', error);
    }
}