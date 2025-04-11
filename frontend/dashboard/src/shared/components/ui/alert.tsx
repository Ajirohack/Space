import React from 'react';

interface AlertProps {
    children: React.ReactNode;
    variant?: 'default' | 'destructive';
    className?: string;
}

export const Alert: React.FC<AlertProps> = ({
    children,
    variant = 'default',
    className = '',
}) => {
    const baseStyles = 'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground';
    const variantStyles = {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
    };

    return (
        <div
            role="alert"
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        >
            {children}
        </div>
    );
};

export const AlertDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = '',
}) => {
    return (
        <div className={`text-sm [&_p]:leading-relaxed ${className}`}>
            {children}
        </div>
    );
};
