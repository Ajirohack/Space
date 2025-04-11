import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Alert, AlertDescription } from '../alert';

describe('Alert Component', () => {
    it('renders with default variant', () => {
        render(<Alert>Test Alert</Alert>);
        const alertElement = screen.getByRole('alert');
        expect(alertElement).toBeInTheDocument();
        expect(alertElement).toHaveTextContent('Test Alert');
        expect(alertElement).toHaveClass('bg-background');
    });

    it('renders with destructive variant', () => {
        render(<Alert variant="destructive">Warning Alert</Alert>);
        const alertElement = screen.getByRole('alert');
        expect(alertElement).toBeInTheDocument();
        expect(alertElement).toHaveTextContent('Warning Alert');
        expect(alertElement).toHaveClass('border-destructive/50');
    });

    it('renders with alert description', () => {
        render(
            <Alert>
                <AlertDescription>This is a description</AlertDescription>
            </Alert>
        );
        const description = screen.getByText('This is a description');
        expect(description).toBeInTheDocument();
        expect(description).toHaveClass('text-sm');
    });

    it('applies custom class name', () => {
        render(<Alert className="custom-class">Custom Alert</Alert>);
        const alertElement = screen.getByRole('alert');
        expect(alertElement).toHaveClass('custom-class');
    });
});