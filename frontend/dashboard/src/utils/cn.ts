import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * A utility function that merges multiple class names and
 * allows for conditional classes with Tailwind CSS.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}