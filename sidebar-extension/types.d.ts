/// <reference types="chrome"/>
/// <reference types="react"/>
/// <reference types="react-dom"/>

interface Chrome {
    runtime: typeof chrome.runtime;
    storage: typeof chrome.storage;
}

declare global {
    interface Window {
        chrome: Chrome;
    }
}

declare module "*.css" {
    const content: { [className: string]: string };
    export default content;
}

declare module "react" {
    interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
        [key: string]: any;
    }
}

declare namespace SpaceWHAI {
    interface AuthState {
        isAuthenticated: boolean;
        userName: string | null;
        error: string | null;
        token: string | null;
        lastAttempt?: string;
    }

    interface SidebarSettings {
        isEnabled: boolean;
        apiUrl: string;
        serverUrl?: string;
    }

    interface Message {
        role: 'user' | 'assistant';
        content: string;
    }

    interface ApiError {
        status: number;
        message: string;
        retryAfter?: number;
    }

    interface ApiResponse<T = any> {
        success: boolean;
        data?: T;
        error?: string;
    }

    interface ValidationResponse {
        valid: boolean;
        user_name?: string;
        error?: string;
    }
}

interface AuthState {
    isAuthenticated: boolean;
    membershipKey: string | null;
    userName: string | null;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    response: string;
}

interface WebSocketMessage {
    type: 'auth' | 'chat_message' | 'auth_success' | 'auth_failed' | 'chat_response' | 'error';
    payload: any;
}

interface ValidateKeyResponse {
    valid: boolean;
    user_name?: string;
    error?: string;
}

// Make chrome.runtime available
declare namespace chrome {
    export namespace runtime {
        export const getManifest: () => any;
        export const onMessage: any;
        export const sendMessage: any;
    }
    export namespace tabs {
        export const query: any;
        export const sendMessage: any;
    }
    export namespace storage {
        export const local: any;
    }
}

export = SpaceWHAI;
export as namespace SpaceWHAI;