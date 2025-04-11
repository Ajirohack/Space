// --- Mocked Auth Logic (Replace with actual import/logic) ---
const DEFAULT_AUTH_STATE = { isAuthenticated: false, userName: null, token: null, error: null };

async function getStorageAuthState() {
    try {
        const { authState } = await chrome.storage.local.get(['authState']);
        return authState || DEFAULT_AUTH_STATE;
    } catch (e) {
        console.error("Error getting auth state:", e);
        return DEFAULT_AUTH_STATE;
    }
}

async function setStorageAuthState(state) {
    try {
        await chrome.storage.local.set({ authState: state });
        notifyAuthStateChanged(state); // Notify listeners after successful set
    } catch (e) {
        console.error("Error setting auth state:", e);
    }
}

async function performLogin(key) {
    try {
        let serverUrl = 'http://localhost:3101';
        const { sidebarSettings } = await chrome.storage.local.get(['sidebarSettings']);
        serverUrl = sidebarSettings?.apiUrl || serverUrl;

        const response = await fetch(`${serverUrl}/validate-key`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key })
        });

        if (!response.ok) {
            let errorMsg = `HTTP error ${response.status}`;
            try { const errorData = await response.json(); errorMsg = errorData.error || errorData.message || errorData.detail?.message || errorMsg; } catch { /* Ignore */ }
            throw new Error(errorMsg);
        }
        const data = await response.json();
        if (!data.valid) throw new Error(data.error || 'Invalid membership key');

        const newState = { isAuthenticated: true, userName: data.user_name, error: null, token: key };
        await setStorageAuthState(newState);
        return { success: true, userName: data.user_name };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown login error';
        await setStorageAuthState({ ...DEFAULT_AUTH_STATE, error: errorMessage });
        console.error("Login failed in background:", errorMessage);
        throw error;
    }
}

async function performLogout() {
    await setStorageAuthState(DEFAULT_AUTH_STATE);
}
// --- End Mocked Auth Logic ---

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.local.set({
            sidebarSettings: {
                isEnabled: true,
                apiUrl: 'http://localhost:3101'
            },
            authState: DEFAULT_AUTH_STATE
        });
        console.log('Default settings and auth state initialized.');
    }
    initializeContextMenus();
});

// Function to initialize or update context menus
function initializeContextMenus() {
    chrome.contextMenus.create({
        id: 'spacewh-ai-selection',
        title: 'Ask SpaceWH AI about "%s"',
        contexts: ['selection']
    });
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let isAsync = false;

    switch (message.type) {
        case 'AUTH_LOGIN':
            isAsync = true;
            performLogin(message.payload.key)
                .then(result => sendResponse({ success: true, userName: result.userName }))
                .catch(error => sendResponse({ success: false, error: error.message || 'Login failed' }));
            break;

        case 'AUTH_LOGOUT':
            isAsync = true;
            performLogout()
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message || 'Logout failed' }));
            break;

        case 'CHECK_SERVICE':
            isAsync = true;
            checkServiceHealth()
                .then(isHealthy => sendResponse({ isHealthy }))
                .catch(() => sendResponse({ isHealthy: false }));
            break;

        case 'GET_AUTH_STATE':
            isAsync = true;
            getStorageAuthState().then(state => sendResponse(state));
            break;

        case 'GET_SETTINGS':
            isAsync = true;
            chrome.storage.local.get(['sidebarSettings'])
                .then(result => sendResponse(result.sidebarSettings || { isEnabled: true, apiUrl: 'http://localhost:3101' }))
                .catch(() => sendResponse({ isEnabled: true, apiUrl: 'http://localhost:3101' }));
            break;
    }

    return isAsync;
});

// Notify all content scripts about auth state changes
function notifyAuthStateChanged(authState) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            if (tab.id && !tab.url?.startsWith('chrome://')) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'AUTH_STATE_CHANGED',
                    payload: {
                        isAuthenticated: authState.isAuthenticated,
                        userName: authState.userName,
                        token: authState.token
                    }
                }).catch((error) => {
                    if (!error.message?.includes('Receiving end does not exist')) {
                        console.warn(`Could not send auth state to tab ${tab.id}: ${error.message}`);
                    }
                });
            }
        });
    });
}

// Check API health
async function checkServiceHealth() {
    try {
        const { sidebarSettings } = await chrome.storage.local.get(['sidebarSettings']);
        const apiUrl = sidebarSettings?.apiUrl || 'http://localhost:3101';
        const response = await fetch(`${apiUrl}/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
        return response.ok;
    } catch (error) {
        console.error("API health check failed:", error);
        return false;
    }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'spacewh-ai-selection' && tab?.id && info.selectionText) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['js/content.js']
            });
            await chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_SIDEBAR_WITH_PROMPT',
                payload: { prompt: info.selectionText }
            });
        } catch (error) {
            console.error(`Error handling context menu click for tab ${tab.id}:`, error);
        }
    }
});

// Listen for storage changes to keep background state potentially in sync (optional)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.authState) {
        console.log('Auth state changed in storage:', changes.authState.newValue);
    }
    if (areaName === 'local' && changes.sidebarSettings) {
        console.log('Sidebar settings changed:', changes.sidebarSettings.newValue);
    }
});