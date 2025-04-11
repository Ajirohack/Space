import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../AuthContext';
import DashboardPage from '../DashboardPage'; // Removed explicit .tsx extension

// Mock auth context
const mockAuthContext = {
    auth: {
        isAuthenticated: true,
        userName: 'Test User',
        error: null,
        invitationValidated: true,
        invitedName: 'Test User',
        onboardingSubmitted: true,
        membershipValidated: true,
        login: vi.fn(),
        logout: vi.fn()
    },
    setAuth: vi.fn()
};

const renderWithContext = (ui: React.ReactNode) => {
    return render(
        <BrowserRouter>
            <AuthContext.Provider value={mockAuthContext}>
                {ui}
            </AuthContext.Provider>
        </BrowserRouter>
    );
};

describe('DashboardPage Component', () => {
    it('renders the dashboard header correctly', () => {
        renderWithContext(<DashboardPage />);

        expect(screen.getByText('SpaceWH Member Dashboard')).toBeInTheDocument();
    });

    it('renders navigation buttons', () => {
        renderWithContext(<DashboardPage />);

        expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Persona/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument();
    });

    it('renders iframe for chat interface', () => {
        renderWithContext(<DashboardPage />);

        const iframe = screen.getByTitle('Chat');
        expect(iframe).toBeInTheDocument();
        expect(iframe.tagName).toBe('IFRAME');
        expect(iframe).toHaveAttribute('src', 'http://localhost:8080');
    });
});