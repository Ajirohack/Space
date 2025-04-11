import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Alert variant="destructive">
                    <AlertDescription>
                        Something went wrong. Please try refreshing the page.
                        {this.state.error && (
                            <details className="mt-2 text-sm">
                                <summary>Error details</summary>
                                <pre className="mt-2 bg-black/10 p-2 rounded">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}
                    </AlertDescription>
                </Alert>
            );
        }

        return this.props.children;
    }
}