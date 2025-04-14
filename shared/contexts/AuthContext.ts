import { createContext, useContext } from 'react';

export interface AuthState {
    isAuthenticated: boolean;
    userName: string | null;
    error: string | null;
    token: string | null;
    apiUrl: string;
    invitationValidated?: boolean;
    invitedName?: string | null;
    onboardingSubmitted?: boolean;
    membershipValidated?: boolean;
}

export interface AuthContextType extends AuthState {
    login: (key: string) => Promise<void>;
    logout: () => void;
}

// Default state that can be used by providers
export const DEFAULT_AUTH_STATE: AuthState = {
    isAuthenticated: false,
    userName: null,
    error: null,
    token: null,
    apiUrl: typeof window !== 'undefined' ?
        (import.meta.env?.VITE_API_URL || 'http://localhost:3000') :
        'http://localhost:3000',
    invitationValidated: false,
    invitedName: null,
    onboardingSubmitted: false,
    membershipValidated: false
};

// Create context with default implementation to avoid null checks
export const AuthContext = createContext<AuthContextType>({
    ...DEFAULT_AUTH_STATE,
    login: async () => {
        console.warn('AuthContext.login called before provider was initialized');
    },
    logout: () => {
        console.warn('AuthContext.logout called before provider was initialized');
    }
});

export function useAuth() {
    const context = useContext(AuthContext);
    return context;
}