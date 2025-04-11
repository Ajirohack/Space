import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        length: 0,
        key: vi.fn(),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
});

// Mock import.meta.env
vi.mock('../vite-env.d.ts', () => {
    return {
        import: {
            meta: {
                env: {
                    VITE_API_URL: 'http://localhost:3101'
                }
            }
        }
    };
});

// Test component that uses the auth context
function TestComponent() {
    const { auth } = useAuth();

    return (
        <div>
            <div data-testid="auth-status">
                {auth.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
            </div>
            <div data-testid="auth-username">
                {auth.userName || 'No Username'}
            </div>
            <button
                data-testid="login-button"
                onClick={() => auth.login('test-key')}
            >
                Login
            </button>
            <button
                data-testid="logout-button"
                onClick={() => auth.logout()}
            >
                Logout
            </button>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage.clear();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ valid: true, user_name: 'Test User' })
        });
    });

    it('provides default auth state initially', () => {
        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        const authStateEl = screen.getByTestId('auth-status');
        const authState = authStateEl.textContent;

        expect(authState).toBe('Not Authenticated');
    });

    it('checks localStorage for existing membership key on mount', async () => {
        mockLocalStorage.getItem.mockReturnValueOnce('stored-key');

        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // Check that login was called with the stored key
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3101/validate-key',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'stored-key' })
            })
        );

        // Wait for auth state to update
        await waitFor(() => {
            const authStateEl = screen.getByTestId('auth-status');
            const authState = authStateEl.textContent;
            expect(authState).toBe('Authenticated');
        });
    });

    it('updates auth state on successful login', async () => {
        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // Initial state should be unauthenticated
        let authState = getByTestId('auth-status').textContent;
        expect(authState).toBe('Not Authenticated');

        // Click login button
        await act(async () => {
            getByTestId('login-button').click();
        });

        // Verify fetch was called with the right arguments
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3101/validate-key',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'test-key' })
            })
        );

        // Verify auth state was updated properly
        await waitFor(() => {
            authState = getByTestId('auth-status').textContent;
            const authUserName = getByTestId('auth-username').textContent;
            expect(authState).toBe('Authenticated');
            expect(authUserName).toBe('Test User');
        });

        // Verify key was stored in localStorage
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('membershipKey', 'test-key');
    });

    it('handles login failures correctly', async () => {
        // Mock a failed response
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ valid: false })
        });

        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // Click login button
        await act(async () => {
            getByTestId('login-button').click();
        });

        // Verify auth state contains error and user is not authenticated
        await waitFor(() => {
            const authState = getByTestId('auth-status').textContent;
            expect(authState).toBe('Not Authenticated');
        });

        // Verify key was not stored in localStorage
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('membershipKey');
    });

    it('handles logout correctly', async () => {
        // Set initial state to authenticated
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ valid: true, user_name: 'Test User' })
        });

        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // First login
        await act(async () => {
            getByTestId('login-button').click();
        });

        // Wait for authenticated state
        await waitFor(() => {
            const authState = getByTestId('auth-status').textContent;
            expect(authState).toBe('Authenticated');
        });

        // Now logout
        await act(async () => {
            getByTestId('logout-button').click();
        });

        // Verify auth state was reset
        const authState = getByTestId('auth-status').textContent;
        const authUserName = getByTestId('auth-username').textContent;
        expect(authState).toBe('Not Authenticated');
        expect(authUserName).toBe('No Username');

        // Verify localStorage was cleared
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('membershipKey');
    });
});