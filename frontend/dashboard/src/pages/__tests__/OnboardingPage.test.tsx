import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import OnboardingPage from '../OnboardingPage';

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock SpeechRecognition API
const mockSpeechRecognition = {
    start: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn()
};

// Mock auth context
const mockAuthContext = {
    auth: {
        isAuthenticated: true,
        userName: 'Test User',
        error: null,
        invitationValidated: true,
        invitedName: 'Test User',
        onboardingSubmitted: false,
        membershipValidated: true,
        login: vi.fn(),
        logout: vi.fn()
    },
    setAuth: vi.fn()
};

// Mock import.meta.env correctly
vi.stubGlobal('import', {
    meta: {
        env: {
            VITE_API_URL: 'http://localhost:3101'
        }
    }
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

describe('OnboardingPage Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });

        // Mock the SpeechRecognition API
        Object.defineProperty(window, 'webkitSpeechRecognition', {
            value: vi.fn(() => mockSpeechRecognition),
            writable: true
        });
    });

    it('renders the onboarding form correctly', () => {
        renderWithContext(<OnboardingPage />);

        expect(screen.getByText('AI Onboarding Interview')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Invitation Code')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Your responses...')).toBeInTheDocument();
        expect(screen.getByText('Record Speech')).toBeInTheDocument();
        expect(screen.getByText('I consent to voice recording & AI verification')).toBeInTheDocument();
        expect(screen.getByText('Submit Onboarding')).toBeInTheDocument();
    });

    it('handles form input changes', async () => {
        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        const codeInput = screen.getByPlaceholderText('Invitation Code');
        const responsesInput = screen.getByPlaceholderText('Your responses...');
        const consentCheckbox = screen.getByRole('checkbox');

        await user.type(codeInput, 'INV123');
        await user.type(responsesInput, 'This is my response');
        await user.click(consentCheckbox);

        expect(codeInput).toHaveValue('INV123');
        expect(responsesInput).toHaveValue('This is my response');
        expect(consentCheckbox).toBeChecked();
    });

    it('submits the form successfully', async () => {
        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        // Fill out the form
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'INV123');
        await user.type(screen.getByPlaceholderText('Your responses...'), 'My responses');
        await user.click(screen.getByRole('checkbox'));

        // Submit form
        await user.click(screen.getByText('Submit Onboarding'));

        // Check fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3101/submit-onboarding',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: 'INV123',
                    responses: 'My responses',
                    voice_consent: true
                })
            })
        );

        // Check auth context was updated more specifically
        await waitFor(() => {
            expect(mockAuthContext.setAuth).toHaveBeenCalledWith(expect.any(Function));
        });

        // Check success message
        await waitFor(() => {
            expect(screen.getByText(/Onboarding submitted! Await admin approval./i)).toBeInTheDocument();
        });
    });

    it('handles submission errors', async () => {
        // Mock a failed response
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: false })
        });

        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        // Fill out the form
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'INV123');
        await user.type(screen.getByPlaceholderText('Your responses...'), 'My responses');

        // Submit form
        await user.click(screen.getByText('Submit Onboarding'));

        // Check error message is displayed
        await waitFor(() => {
            expect(screen.getByText(/Submission failed/i)).toBeInTheDocument();
        });
    });

    it('handles network errors during submission', async () => {
        // Mock a network error
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        // Fill out the form
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'INV123');
        await user.type(screen.getByPlaceholderText('Your responses...'), 'My responses');

        // Submit form
        await user.click(screen.getByText('Submit Onboarding'));

        // Check error message is displayed
        await waitFor(() => {
            expect(screen.getByText(/Submission failed/i)).toBeInTheDocument();
        });
    });

    it('triggers speech recognition when record button is clicked', async () => {
        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        // Click record button
        await user.click(screen.getByText('Record Speech'));

        // Verify speech recognition was started
        expect(mockSpeechRecognition.start).toHaveBeenCalled();
    });

    it('shows loading state during submission', async () => {
        // Create a fetch promise that we can control
        let resolveFetchPromise: (value: any) => void;
        const fetchPromise = new Promise<any>((resolve) => {
            resolveFetchPromise = resolve;
        });

        mockFetch.mockReturnValueOnce(fetchPromise);

        const user = userEvent.setup();
        renderWithContext(<OnboardingPage />);

        // Fill out the form
        await user.type(screen.getByPlaceholderText('Invitation Code'), 'INV123');

        // Submit form
        await user.click(screen.getByText('Submit Onboarding'));

        // Check for loading state
        expect(screen.getByText(/Submitting.../i)).toBeInTheDocument();

        // Resolve the fetch promise with success
        resolveFetchPromise!({
            ok: true,
            json: async () => ({ success: true })
        });

        // Check that loading state is removed and success message is shown
        await waitFor(() => {
            expect(screen.queryByText(/Submitting.../i)).not.toBeInTheDocument();
            expect(screen.getByText(/Onboarding submitted! Await admin approval./i)).toBeInTheDocument();
        });
    });
});