import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthState, AuthContextType, DEFAULT_AUTH_STATE } from '../../shared/contexts/AuthContext';

// API request wrapper with retry logic
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) {
                const retryAfterHeader = response.headers.get('Retry-After');
                const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, i);
                const delayMs = Math.min(retryAfterSeconds * 1000, 30000);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Network error');
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
        }
    }
    throw lastError ?? new Error('Max retries reached');
}

async function getAuthState(): Promise<AuthState> {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(['authState'], (result) => {
                resolve(result.authState || DEFAULT_AUTH_STATE);
            });
        } else {
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

async function setAuthState(state: AuthState): Promise<void> {
    return new Promise((resolve, reject) => {
        const newState = { ...state };
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ authState: newState }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error setting authState:", chrome.runtime.lastError);
                    return reject(chrome.runtime.lastError);
                }
                if (chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({
                        type: 'AUTH_STATE_CHANGED',
                        payload: {
                            isAuthenticated: newState.isAuthenticated,
                            userName: newState.userName,
                            token: newState.token
                        }
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn("Could not send auth state change message:", chrome.runtime.lastError.message);
                        }
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        } else {
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

export const ExtensionAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [authState, setAuthStateInternal] = useState<AuthState>(DEFAULT_AUTH_STATE);

    const reloadAuthState = useCallback(async () => {
        const state = await getAuthState();
        setAuthStateInternal(state);
    }, []);

    useEffect(() => {
        reloadAuthState();

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

    const login = async (key: string) => {
        try {
            const response = await fetchWithRetry(`${DEFAULT_AUTH_STATE.apiUrl}/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const data = await response.json();
            if (!data.valid) {
                throw new Error(data.error || 'Invalid membership key');
            }

            await setAuthState({
                ...DEFAULT_AUTH_STATE,
                isAuthenticated: true,
                userName: data.user_name,
                token: key
            });

            await reloadAuthState();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown login error';
            await setAuthState({
                ...DEFAULT_AUTH_STATE,
                error: errorMessage
            });
            await reloadAuthState();
            throw error;
        }
    };

    const logout = async () => {
        await setAuthState(DEFAULT_AUTH_STATE);
        await reloadAuthState();
    };

    const value: AuthContextType = {
        ...authState,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};