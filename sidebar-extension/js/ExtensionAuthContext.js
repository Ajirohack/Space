/**
 * Authentication context for the SpaceWH AI extension
 */

// Default auth state
const DEFAULT_AUTH_STATE = {
    isAuthenticated: false,
    userName: null,
    error: null,
    token: null
};

/**
 * Get the current authentication state from Chrome storage
 * @returns {Promise<Object>} Authentication state
 */
export async function getAuthState() {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['authState'], (result) => {
                resolve(result.authState || DEFAULT_AUTH_STATE);
            });
        } else {
            // Fallback for development environment
            const storedState = localStorage.getItem('authState');
            resolve(storedState ? JSON.parse(storedState) : DEFAULT_AUTH_STATE);
        }
    });
}

/**
 * Set the authentication state in Chrome storage
 * @param {Object} state - Authentication state
 * @returns {Promise<void>}
 */
export async function setAuthState(state) {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({ authState: state }, resolve);
            // Notify background script about auth state change
            if (chrome.runtime) {
                chrome.runtime.sendMessage({
                    type: 'AUTH_STATE_CHANGED',
                    payload: {
                        isAuthenticated: state.isAuthenticated,
                        userName: state.userName,
                        token: state.token
                    }
                });
            }
        } else {
            // Fallback for development environment
            localStorage.setItem('authState', JSON.stringify(state));
            resolve();
        }
    });
}

/**
 * API request wrapper with retry logic
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') ||
                    response.headers.get('X-Rate-Limit-Reset') ||
                    Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                await new Promise(resolve =>
                    setTimeout(resolve, Math.pow(2, i) * 1000)
                );
            }
        }
    }
    throw lastError;
}

/**
 * Attempt to login with membership key
 * @param {string} key - Membership key
 * @returns {Promise<boolean>} Success status
 */
export async function login(key) {
    try {
        // Get server URL from storage or use default
        let serverUrl = 'http://localhost:3101';
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const settings = await new Promise(resolve => {
                chrome.storage.local.get(['sidebarSettings'], (result) => {
                    resolve(result.sidebarSettings || {});
                });
            });
            if (settings.serverUrl) {
                serverUrl = settings.serverUrl;
            }
        }

        // Validate the key with the backend
        const response = await fetchWithRetry(
            `${serverUrl}/validate-key`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key })
            }
        );

        // Handle HTTP errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail?.message || `HTTP error ${response.status}`);
        }

        // Parse response
        const data = await response.json();

        // Handle invalid key
        if (!data.valid) {
            throw new Error('Invalid membership key');
        }

        // Set authentication state
        await setAuthState({
            isAuthenticated: true,
            userName: data.user_name,
            error: null,
            token: key
        });

        return true;
    } catch (error) {
        // Set error in auth state with more detail
        await setAuthState({
            isAuthenticated: false,
            userName: null,
            error: error.message,
            token: null,
            lastAttempt: new Date().toISOString()
        });

        throw error;
    }
}

/**
 * Logout user
 * @returns {Promise<void>}
 */
export async function logout() {
    await setAuthState(DEFAULT_AUTH_STATE);
}