import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary Component', () => {
    it('renders children when no error occurs', () => {
        render(
            <ErrorBoundary fallback={<div>Fallback</div>}>
                <div data-testid="child">Hello World</div>
            </ErrorBoundary>
        );
        // ...existing assertions...
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('renders fallback UI when an error is thrown', () => {
        // Component that always throws an error
        const ProblemChild = () => {
            throw new Error('Test error');
        };

        render(
            <ErrorBoundary fallback={<div>Fallback UI</div>}>
                <ProblemChild />
            </ErrorBoundary>
        );
        // ...existing assertions...
        expect(screen.getByText('Fallback UI')).toBeInTheDocument();
    });
});
