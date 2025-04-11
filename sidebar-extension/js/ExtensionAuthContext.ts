import { createContext, useContext, useState, useEffect, useCallback } from 'react'; // Add useCallback

/**
 * Authentication context for the SpaceWH AI extension (TypeScript version)
 */

// Use the shared type if possible, otherwise redefine ensuring 'token' is used for the key
export interface AuthState {
    isAuthenticated: boolean;
    userName: string | null;
    error: string | null;
    token: string | null; // This holds the membership key in the extension context
    lastAttempt?: string; // Optional: track last login attempt time
}

// Default auth state
const DEFAULT_AUTH_STATE: AuthState = {
    isAuthenticated: false,
    userName: null,
    error: null,
    token: null
};

// API request wrapper with retry logic
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) { // Rate limited
                const retryAfterHeader = response.headers.get('Retry-After') || response.headers.get('X-Rate-Limit-Reset');
                const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, i);
                const delayMs = Math.min(retryAfterSeconds * 1000, 30000); // Max 30s delay
                console.warn(`Rate limited. Retrying after ${delayMs / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue; // Retry the request
            }
            return response; // Return successful or non-retriable error response
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Network error');
            if (i < maxRetries - 1) {
                const delayMs = Math.pow(2, i) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError ?? new Error('Max retries reached'); // Throw the last error encountered
}


/**
 * Get the current authentication state from Chrome storage
 * @returns {Promise<AuthState>} Authentication state
 */
export async function getAuthState(): Promise<AuthState> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['authState'], (result) => {
                resolve(result.authState || DEFAULT_AUTH_STATE);
            });
        } else {
            // Fallback for non-extension environment (testing/development)
            try {
                const storedState = localStorage.getItem('authState');
                resolve(storedState ? JSON.parse(storedState) : DEFAULT_AUTH_STATE);
            } catch (e) {
                console.error("Error reading authState from localStorage", e);
                resolve(DEFAULT_AUTH_STATE);
            }
        }
    });
}

/**
 * Set the authentication state in Chrome storage and notify listeners
 * @param {AuthState} state - Authentication state
 * @returns {Promise<void>}
 */
export async function setAuthState(state: AuthState): Promise<void> {
    return new Promise((resolve, reject) => {
        const newState = { ...state }; // Ensure we don't mutate the original state
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ authState: newState }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error setting authState:", chrome.runtime.lastError);
                    return reject(chrome.runtime.lastError);
                }
                // Notify background script about auth state change
                if (chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({
                        type: 'AUTH_STATE_CHANGED',
                        payload: {
                            isAuthenticated: newState.isAuthenticated,
                            userName: newState.userName,
                            token: newState.token // Ensure token is included
                        }
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Handle potential error if background script is unavailable
                            console.warn("Could not send auth state change message:", chrome.runtime.lastError.message);
                        }
                        // Resolve even if message sending fails
                        resolve();
                    });
                } else {
                    resolve(); // Resolve if runtime is not available
                }
            });
        } else {
            // Fallback for non-extension environment
            try {
                localStorage.setItem('authState', JSON.stringify(newState));
                resolve();
            } catch (e) {
                console.error("Error writing authState to localStorage", e);
                reject(e);
            }
        }
    });
}


/**
 * Attempt to login with membership key
 * @param {string} key - Membership key
 * @returns {Promise<boolean>} Success status
 */
export async function login(key: string): Promise<boolean> {
    try {
        // Get server URL from storage or use default
        let serverUrl = 'http://localhost:3101';
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const settings = await new Promise<any>(resolve => {
                chrome.storage.local.get(['sidebarSettings'], (result) => {
                    resolve(result.sidebarSettings || {});
                });
            });
            // Use apiUrl from settings if available
            serverUrl = settings.apiUrl || serverUrl;
        }

        // Validate the key with the backend using retry logic
        const response = await fetchWithRetry(`${serverUrl}/validate-key`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key })
        });

        // Handle HTTP errors after retries
        if (!response.ok) {
            let errorMsg = `HTTP error ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorData.message || errorData.detail?.message || errorMsg;
            } catch { /* Ignore JSON parsing errors */ }
            throw new Error(errorMsg);
        }

        // Parse response
        const data = await response.json();

        // Handle invalid key response from API
        if (!data.valid) {
            throw new Error(data.error || 'Invalid membership key');
        }

        // Set authentication state
        await setAuthState({
            isAuthenticated: true,
            userName: data.user_name,
            error: null,
            token: key // Store the key as 'token'
        });

        return true; // Indicate success
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown login error';
        // Set error in auth state
        await setAuthState({
            ...DEFAULT_AUTH_STATE, // Reset to default but keep error
            error: errorMessage,
            lastAttempt: new Date().toISOString() // Add timestamp for debugging
        });

        console.error("Login failed:", errorMessage); // Log the specific error
        throw error; // Re-throw the error for the caller
    }
}


/**
 * Logout user
 * @returns {Promise<void>}
 */
export async function logout(): Promise<void> {
    await setAuthState(DEFAULT_AUTH_STATE);
}

// --- React Context Part ---

// Create context with a default value that includes the functions
interface ExtensionAuthContextType extends AuthState {
    login: (key: string) => Promise<boolean>;
    logout: () => Promise<void>;
    reloadAuthState: () => Promise<void>; // Add a function to manually reload state
}

export const ExtensionAuthContext = createContext<ExtensionAuthContextType | null>(null);

export function ExtensionAuthProvider({ children }: { children: React.ReactNode }) {
    const [authState, setAuthStateInternal] = useState<AuthState>(DEFAULT_AUTH_STATE);

    // Function to load state from storage
    const reloadAuthState = useCallback(async () => {
        const state = await getAuthState();
        setAuthStateInternal(state);
    }, []);

    // Load initial state
    useEffect(() => {
        reloadAuthState();

        // Optional: Listen for storage changes from other parts of the extension
        const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'local' && changes.authState) {
                setAuthStateInternal(changes.authState.newValue || DEFAULT_AUTH_STATE);
            }
        };
        if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener(storageListener);
            return () => chrome.storage.onChanged.removeListener(storageListener);
        }
    }, [reloadAuthState]);

    // Memoize context value to prevent unnecessary re-renders
    const contextValue = React.useMemo(() => ({
        ...authState,
        // Wrap login/logout to update local state *after* storage update
        login: async (key: string) => {
            try {
                await login(key); // This already calls setAuthState which updates storage
                await reloadAuthState(); // Reload state from storage to ensure consistency
                return true;
            } catch (error) {
                await reloadAuthState(); // Reload state even on error
                return false; // Indicate failure
            }
        },
        logout: async () => {
            await logout(); // This already calls setAuthState
            await reloadAuthState();
        },
        reloadAuthState
    }), [authState, reloadAuthState]);


    return (
        <ExtensionAuthContext.Provider value= { contextValue } >
        { children }
        </ExtensionAuthContext.Provider>
    );
}

export function useExtensionAuth(): ExtensionAuthContextType {
    const context = useContext(ExtensionAuthContext);
    if (!context) {
        throw new Error('useExtensionAuth must be used within an ExtensionAuthProvider');
    }
    return context;
}