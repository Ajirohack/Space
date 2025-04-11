import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '../button';
import { Input } from '../input';
import { Toast } from '../toast';
import { Dialog } from '../dialog';
import { Alert } from '../alert';

describe('UI Components Smoke Tests', () => {
    it('Button component renders without crashing', () => {
        const { getByRole } = render(<Button>Test Button</Button>);
        expect(getByRole('button')).toBeInTheDocument();
    });

    it('Input component renders without crashing', () => {
        const { getByRole } = render(<Input />);
        expect(getByRole('textbox')).toBeInTheDocument();
    });

    it('Toast component renders without crashing', () => {
        const { getByText } = render(<Toast message="Test message" onClose={() => { }} />);
        expect(getByText('Test message')).toBeInTheDocument();
    });

    it('Dialog component renders without crashing when open', () => {
        const { getByRole } = render(
            <Dialog isOpen={true} onClose={() => { }} title="Test Dialog">
                Dialog content
            </Dialog>
        );
        expect(getByRole('heading')).toHaveTextContent('Test Dialog');
    });

    it('Alert component renders without crashing', () => {
        const { getByRole } = render(
            <Alert>Test alert message</Alert>
        );
        expect(getByRole('alert')).toBeInTheDocument();
    });
});