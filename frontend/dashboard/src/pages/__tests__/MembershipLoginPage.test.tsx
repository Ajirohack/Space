import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import MembershipLoginPage from '../MembershipLoginPage';

// Mock navigate function
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

const mockNavigate = vi.fn();

// Mock auth context
const mockLogin = vi.fn();
const mockLogout = vi.fn();

// Custom wrapper to provide mocked auth context
const customRender = (ui: React.ReactNode, { mockError = null } = {}) => {
    const mockAuthValue = {
        auth: {
            isAuthenticated: false,
            userName: null,
            error: mockError as string | null, // Type assertion to fix the error
            invitationValidated: true,
            invitedName: 'Test User',
            onboardingSubmitted: true,
            membershipValidated: false,
            login: mockLogin,
            logout: mockLogout
        },
        setAuth: vi.fn()
    };

    return render(
        <BrowserRouter>
            <AuthContext.Provider value={mockAuthValue}>
                {ui}
            </AuthContext.Provider>
        </BrowserRouter>
    );
};

describe('MembershipLoginPage', () => {
    beforeEach(() => {
        mockLogin.mockReset();
        mockNavigate.mockReset();
    });

    it('renders the login form', () => {
        customRender(<MembershipLoginPage />);

        expect(screen.getByText(/Membership Login/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Membership Key/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
    });

    it('disables the login button when input is empty', () => {
        customRender(<MembershipLoginPage />);

        const loginButton = screen.getByRole('button', { name: /Login/i });
        expect(loginButton).toBeDisabled();
    });

    it('enables the login button when input has value', async () => {
        customRender(<MembershipLoginPage />);

        const input = screen.getByLabelText(/Membership Key/i);
        const user = userEvent.setup();

        await user.type(input, 'test-key');

        const loginButton = screen.getByRole('button', { name: /Login/i });
        expect(loginButton).not.toBeDisabled();
    });

    it('calls login function and navigates on submit', async () => {
        mockLogin.mockResolvedValue(undefined);
        customRender(<MembershipLoginPage />);

        const input = screen.getByLabelText(/Membership Key/i);
        const loginButton = screen.getByRole('button', { name: /Login/i });
        const user = userEvent.setup();

        await user.type(input, 'test-key');
        await user.click(loginButton);

        expect(mockLogin).toHaveBeenCalledWith('test-key');

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });
    });

    it('displays error alert when login fails', async () => {
        const errorMessage = 'Invalid membership key';
        customRender(<MembershipLoginPage />, { mockError: errorMessage });

        expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('shows loading state during login', async () => {
        // Create a login promise we can control
        let resolveLoginPromise: () => void;
        const loginPromise = new Promise<void>((resolve) => {
            resolveLoginPromise = resolve;
        });

        mockLogin.mockReturnValue(loginPromise);

        customRender(<MembershipLoginPage />);

        const input = screen.getByLabelText(/Membership Key/i);
        const user = userEvent.setup();

        await user.type(input, 'test-key');
        await user.click(screen.getByRole('button', { name: /Login/i }));

        // Check for loading state
        expect(screen.getByRole('button', { name: /Logging in.../i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Logging in.../i })).toBeDisabled();

        // Resolve the login promise
        resolveLoginPromise!();

        // Wait for the loading state to be removed
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Logging in.../i })).not.toBeInTheDocument();
        });
    });
});