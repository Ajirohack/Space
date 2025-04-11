import React from 'react';

interface AlertProps {
    title?: string;
    description?: string;
    variant?: 'default' | 'destructive';
    className?: string;
    children?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
    title,
    description,
    variant = 'default',
    className = '',
    children
}) => {
    const baseStyles = 'relative w-full rounded-lg border p-4';
    const variantStyles = {
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
    };

    return (
        <div
            role="alert"
            className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        >
            {/* Optional: Add an icon based on variant */}
            {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
            {description && <div className="text-sm [&_p]:leading-relaxed">{description}</div>}
            {children}
        </div>
    );
};

export const AlertTitle: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
    <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`}>{children}</h5>
);

export const AlertDescription: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
    <div className={`text-sm [&_p]:leading-relaxed ${className}`}>{children}</div>
);
