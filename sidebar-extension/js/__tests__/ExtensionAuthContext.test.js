import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthState, setAuthState, login, logout } from '../ExtensionAuthContext';

// Mock Chrome API more accurately for async operations
global.chrome = {
    storage: {
        local: {
            get: vi.fn((keys, callback) => {
                // Simulate async retrieval
                setTimeout(() => callback({ authState: global.mockStorage.authState }), 0);
            }),
            set: vi.fn((items, callback) => {
                // Simulate async storage
                global.mockStorage = { ...global.mockStorage, ...items };
                setTimeout(() => {
                    if (chrome.runtime.lastError) {
                        console.error("Simulated storage error:", chrome.runtime.lastError);
                    } else if (callback) {
                        callback();
                    }
                }, 0);
            })
        }
    },
    runtime: {
        sendMessage: vi.fn((message, callback) => {
            if (callback) {
                setTimeout(() => callback({ success: true }), 0);
            }
        }),
        lastError: null
    }
};

// Mock fetch API
global.fetch = vi.fn();

// Mock storage state
global.mockStorage = { authState: null };

describe('ExtensionAuthContext Logic', () => {
    beforeEach(() => {
        // Clear mocks and reset storage/lastError
        vi.clearAllMocks();
        global.mockStorage = { authState: null };
        chrome.runtime.lastError = null;

        // Reset default mock implementations
        chrome.storage.local.get.mockImplementation((keys, callback) => {
            setTimeout(() => callback({ authState: global.mockStorage.authState }), 0);
        });
        chrome.storage.local.set.mockImplementation((items, callback) => {
            global.mockStorage = { ...global.mockStorage, ...items };
            setTimeout(() => {
                if (chrome.runtime.lastError) {
                    console.error("Simulated storage error:", chrome.runtime.lastError);
                } else if (callback) {
                    callback();
                }
            }, 0);
        });
        chrome.runtime.sendMessage.mockImplementation((message, callback) => {
            if (callback) {
                setTimeout(() => callback({ success: true }), 0);
            }
        });
        fetch.mockClear();
    });

    describe('getAuthState', () => {
        it('returns default state when nothing in storage', async () => {
            const state = await getAuthState();
            expect(state).toEqual({
                isAuthenticated: false,
                userName: null,
                error: null,
                token: null
            });
            expect(chrome.storage.local.get).toHaveBeenCalledWith(['authState'], expect.any(Function));
        });

        it('returns stored state when available', async () => {
            const mockState = { isAuthenticated: true, userName: 'Test', error: null, token: 'abc' };
            global.mockStorage.authState = mockState;
            const state = await getAuthState();
            expect(state).toEqual(mockState);
        });
    });

    describe('setAuthState', () => {
        it('stores auth state and sends message with token', async () => {
            const newState = { isAuthenticated: true, userName: 'New', error: null, token: 'xyz' };
            await setAuthState(newState);

            expect(chrome.storage.local.set).toHaveBeenCalledWith({ authState: newState }, expect.any(Function));
            expect(global.mockStorage.authState).toEqual(newState);

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                {
                    type: 'AUTH_STATE_CHANGED',
                    payload: {
                        isAuthenticated: true,
                        userName: 'New',
                        token: 'xyz'
                    }
                },
                expect.any(Function)
            );
        });

        it('handles potential storage errors during set', async () => {
            const newState = { isAuthenticated: false, userName: null, error: 'test error', token: null };
            const storageError = new Error("Failed to set item in storage");
            chrome.runtime.lastError = storageError;

            await expect(setAuthState(newState)).rejects.toThrow("Failed to set item in storage");

            expect(chrome.storage.local.set).toHaveBeenCalledWith({ authState: newState }, expect.any(Function));
        });
    });

    describe('login', () => {
        it('handles successful login', async () => {
            fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, user_name: 'Tester' }) });
            const success = await login('valid-key');

            expect(success).toBe(true);
            expect(fetch).toHaveBeenCalledWith('http://localhost:3101/validate-key', expect.objectContaining({ body: JSON.stringify({ key: 'valid-key' }) }));
            expect(global.mockStorage.authState).toEqual({ isAuthenticated: true, userName: 'Tester', error: null, token: 'valid-key' });
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTH_STATE_CHANGED' }), expect.any(Function));
        });

        it('handles invalid key response from API', async () => {
            fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false, error: 'Key expired' }) });

            await expect(login('expired-key')).rejects.toThrow('Key expired');
            expect(global.mockStorage.authState).toEqual(expect.objectContaining({ isAuthenticated: false, error: 'Key expired', token: null }));
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTH_STATE_CHANGED' }), expect.any(Function));
        });

        it('handles fetch network errors', async () => {
            fetch.mockRejectedValueOnce(new Error('Network connection failed'));

            await expect(login('any-key')).rejects.toThrow('Network connection failed');
            expect(global.mockStorage.authState).toEqual(expect.objectContaining({ isAuthenticated: false, error: 'Network connection failed', token: null }));
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTH_STATE_CHANGED' }), expect.any(Function));
        });

        it('handles non-ok fetch responses', async () => {
            fetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({ detail: 'Internal issue' }) });

            await expect(login('any-key')).rejects.toThrow('HTTP error 500');
            expect(global.mockStorage.authState).toEqual(expect.objectContaining({ isAuthenticated: false, error: 'HTTP error 500', token: null }));
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'AUTH_STATE_CHANGED' }), expect.any(Function));
        });
    });

    describe('logout', () => {
        it('clears auth state and sends message', async () => {
            global.mockStorage.authState = { isAuthenticated: true, userName: 'Tester', error: null, token: 'abc' };

            await logout();

            expect(global.mockStorage.authState).toEqual({ isAuthenticated: false, userName: null, error: null, token: null });

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                {
                    type: 'AUTH_STATE_CHANGED',
                    payload: {
                        isAuthenticated: false,
                        userName: null,
                        token: null
                    }
                },
                expect.any(Function)
            );
        });
    });
});