import { createContext } from 'react';

interface ExtensionAuthContextType {
  token: string | null;
  setToken?: (token: string | null) => void;
}

export const ExtensionAuthContext = createContext<ExtensionAuthContextType>({
  token: null,
});