/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'src/setupTests.ts',
                '**/*.d.ts',
                'dist/**',
                'public/**',
            ],
            include: ['src/**/*.{ts,tsx}'],
            all: true,
            lines: 80,
            functions: 80,
            branches: 80,
            statements: 80
        },
        exclude: [...configDefaults.exclude, 'e2e/*'],
        include: ['src/**/*.{test,spec}.{ts,tsx}']
    },
    resolve: {
        alias: {
            '@': '/src',
            '@shared': '/shared'
        }
    }
});