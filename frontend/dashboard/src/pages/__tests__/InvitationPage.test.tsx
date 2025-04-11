import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import InvitationPage from '../InvitationPage';

// Mock Html5Qrcode
vi.mock('html5-qrcode', () => {
    return {
        Html5Qrcode: class MockHtml5Qrcode {
            start = vi.fn().mockResolvedValue(null);
            stop = vi.fn().mockResolvedValue(null);
        }
    };
});

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock auth context
const mockAuthContext = {
    auth: {
        isAuthenticated: false,
        userName: null,
        error: null,
        invitationValidated: false,
        invitedName: null,
        onboardingSubmitted: false,
        membershipValidated: false,
        login: vi.fn(),
        logout: vi.fn()
    },
    setAuth: vi.fn()
};

const mockSetAuth = vi.fn((updateFn) => {
    if (typeof updateFn === 'function') {
        mockAuthContext.auth = updateFn(mockAuthContext.auth);
    }
});
mockAuthContext.setAuth = mockSetAuth;

// Create import.meta.env mock
vi.mock('../../vite-env.d.ts', () => {
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

const renderWithContext = (ui: React.ReactNode) => {
    return render(
        <BrowserRouter>
            <AuthContext.Provider value={mockAuthContext}>
                {ui}
            </AuthContext.Provider>
        </BrowserRouter>
    );
};

describe('InvitationPage Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ valid: true, invited_name: 'Test User' })
        });
    });

    it('renders the invitation form correctly', () => {
        renderWithContext(<InvitationPage />);

        expect(screen.getByText('Membership Invitation')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Invitation Code')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('4-digit PIN')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Scan QR Code/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Validate/i })).toBeInTheDocument();
    });

    it('handles form input changes', async () => {
        const user = userEvent.setup();
        renderWithContext(<InvitationPage />);

        const codeInput = screen.getByPlaceholderText('Invitation Code');
        const pinInput = screen.getByPlaceholderText('4-digit PIN');

        await user.type(codeInput, 'TEST123');
        await user.type(pinInput, '5678');

        expect(codeInput).toHaveValue('TEST123');
        expect(pinInput).toHaveValue('5678');
    });

    it('toggles QR scanner display', async () => {
        const user = userEvent.setup();
        renderWithContext(<InvitationPage />);

        // Scanner should be hidden initially
        expect(screen.queryByTestId('qr-reader')).not.toBeInTheDocument();

        // Click scan button
        await user.click(screen.getByRole('button', { name: /Scan QR Code/i }));

        // Now the scanner element should be in the document
        await waitFor(() => {
            expect(screen.getByTestId('qr-reader')).toBeInTheDocument();
        });
    });

    it('submits the form and handles successful validation', async () => {
        const user = userEvent.setup();
        renderWithContext(<InvitationPage />);

        // Set up input values
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'VALID123');
        await user.type(screen.getByPlaceholderText('4-digit PIN'), '1234');

        // Submit form
        await user.click(screen.getByRole('button', { name: /Validate/i }));

        // Check fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3101/validate-invitation',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: 'VALID123', pin: '1234' })
            })
        );

        // Check auth context was updated
        expect(mockAuthContext.setAuth).toHaveBeenCalledWith(expect.any(Function));

        // Verify the function behavior
        const updateFn = mockAuthContext.setAuth.mock.calls[0][0];
        const updatedAuth = updateFn(mockAuthContext.auth);
        expect(updatedAuth).toEqual(
            expect.objectContaining({
                invitationValidated: true,
                invitedName: 'Test User'
            })
        );

        // Check success message
        await waitFor(() => {
            expect(screen.getByText(/Welcome, Test User/i)).toBeInTheDocument();
        });
    });

    it('handles validation errors', async () => {
        const user = userEvent.setup();

        // Set up mock to return invalid response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ valid: false })
        });

        renderWithContext(<InvitationPage />);

        // Set up input values
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'INVALID');
        await user.type(screen.getByPlaceholderText('4-digit PIN'), '9999');

        // Submit form
        await user.click(screen.getByRole('button', { name: /Validate/i }));

        // Check error message is displayed
        await waitFor(() => {
            expect(screen.getByText(/Invalid code or PIN/i)).toBeInTheDocument();
        });
    });

    it('handles network errors during validation', async () => {
        const user = userEvent.setup();

        // Set up mock to throw error
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        renderWithContext(<InvitationPage />);

        // Set up input values
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'TEST123');
        await user.type(screen.getByPlaceholderText('4-digit PIN'), '1234');

        // Submit form
        await user.click(screen.getByRole('button', { name: /Validate/i }));

        // Check error message is displayed
        await waitFor(() => {
            expect(screen.getByText(/Invalid code or PIN/i)).toBeInTheDocument();
        });
    });
});