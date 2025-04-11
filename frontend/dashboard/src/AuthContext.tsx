import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AuthContextType {
  auth: {
    isAuthenticated: boolean;
    userName: string | null;
    error: string | null;
    invitationValidated: boolean;
    invitedName: string | null;
    onboardingSubmitted: boolean;
    membershipValidated: boolean;
    login: (key: string) => Promise<void>;
    logout: () => void;
  };
  setAuth: React.Dispatch<React.SetStateAction<AuthContextType['auth']>>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [auth, setAuth] = useState<AuthContextType['auth']>({
    isAuthenticated: false,
    userName: null,
    error: null,
    invitationValidated: false,
    invitedName: null,
    onboardingSubmitted: false,
    membershipValidated: false,
    login: async (key: string) => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/validate-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ key }),
        });

        const data = await response.json();

        if (data.valid) {
          setAuth(prev => ({
            ...prev,
            isAuthenticated: true,
            userName: data.user_name,
            error: null,
            membershipValidated: true,
          }));
          localStorage.setItem('membershipKey', key);
        } else {
          setAuth(prev => ({
            ...prev,
            isAuthenticated: false,
            userName: null,
            error: data.error || 'Authentication failed',
            membershipValidated: false,
          }));
          localStorage.removeItem('membershipKey');
        }
      } catch (error) {
        setAuth(prev => ({
          ...prev,
          isAuthenticated: false,
          userName: null,
          error: 'Authentication failed',
          membershipValidated: false,
        }));
        localStorage.removeItem('membershipKey');
      }
    },
    logout: () => {
      setAuth(prev => ({
        ...prev,
        isAuthenticated: false,
        userName: null,
        error: null,
        membershipValidated: false,
      }));
      localStorage.removeItem('membershipKey');
    },
  });

  // Check for existing membership key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('membershipKey');
    if (storedKey) {
      auth.login(storedKey);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ auth, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}