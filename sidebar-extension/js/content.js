// Add debounce utility at the top
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// Debounced error logger
const logError = debounce((message) => {
    console.error(message);
}, 1000);

// Rate limiter utility
class RateLimiter {
    constructor(maxRequests = 60, timeWindow = 60000) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async checkLimit() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);

        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const timeToWait = this.timeWindow - (now - oldestRequest);
            throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(timeToWait / 1000)} seconds.`);
        }

        this.requests.push(now);
        return true;
    }
}

// Initialize rate limiter
const apiRateLimiter = new RateLimiter(60, 60000); // 60 requests per minute

// WebSocket manager with reconnection logic
class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.onMessageCallback = null;
        this.onErrorCallback = null;
        this.onStatusChangeCallback = null;
    }

    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            this.handleError(error);
        }
    }

    setupEventHandlers() {
        if (!this.ws) return;

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.updateStatus('connected');
        };

        this.ws.onclose = () => {
            this.updateStatus('disconnected');
            this.handleReconnect();
        };

        this.ws.onerror = (error) => {
            this.handleError(error);
        };

        this.ws.onmessage = (event) => {
            if (this.onMessageCallback) {
                try {
                    const data = JSON.parse(event.data);
                    this.onMessageCallback(data);
                } catch (error) {
                    logError('Error parsing WebSocket message: ' + error.message);
                }
            }
        };
    }

    handleError(error) {
        logError('WebSocket error: ' + error.message);
        if (this.onErrorCallback) {
            this.onErrorCallback(error);
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            this.updateStatus('reconnecting');
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectAttempts++;
                this.connect();
            }, delay);
        } else {
            this.updateStatus('failed');
        }
    }

    updateStatus(status) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(status);
        }
    }

    async sendMessage(message) {
        try {
            await apiRateLimiter.checkLimit();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(message));
            }
        } catch (error) {
            console.error('Rate limit or WebSocket error:', error);
            throw error;
        }
    }

    send(message) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(message);
            return true;
        }
        return false;
    }

    setCallbacks({ onMessage, onError, onStatusChange }) {
        this.onMessageCallback = onMessage;
        this.onErrorCallback = onError;
        this.onStatusChangeCallback = onStatusChange;
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Global state for sidebar visibility and API URL
let sidebarVisible = false;
let sidebarInjected = false;
let apiUrl = 'http://localhost:3101'; // Default API URL
let sidebarEnabled = true; // Default to enabled
let wsManager = null;

// Function to get settings from storage
async function loadSettings() {
    try {
        const { sidebarSettings } = await chrome.storage.local.get(['sidebarSettings']);
        apiUrl = sidebarSettings?.apiUrl || apiUrl;
        sidebarEnabled = sidebarSettings?.isEnabled !== false; // Default to true if not set

        // Initialize WebSocket if enabled
        if (sidebarEnabled && !wsManager) {
            const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws';
            wsManager = new WebSocketManager(wsUrl);
            wsManager.setCallbacks({
                onMessage: handleWebSocketMessage,
                onError: handleWebSocketError,
                onStatusChange: handleConnectionStatus
            });
            wsManager.connect();
        }
    } catch (error) {
        logError('Error loading settings: ' + error.message);
    }
}

// WebSocket message handler
function handleWebSocketMessage(data) {
    const sidebarContainer = document.getElementById('spacewh-ai-sidebar');
    if (!sidebarContainer) return;

    const iframe = sidebarContainer.querySelector('iframe');
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'WS_MESSAGE',
            payload: data
        }, '*');
    }
}

// WebSocket error handler
function handleWebSocketError(error) {
    const sidebarContainer = document.getElementById('spacewh-ai-sidebar');
    if (!sidebarContainer) return;

    const iframe = sidebarContainer.querySelector('iframe');
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'WS_ERROR',
            payload: { message: error.message }
        }, '*');
    }
}

// Connection status handler
function handleConnectionStatus(status) {
    const sidebarContainer = document.getElementById('spacewh-ai-sidebar');
    if (!sidebarContainer) return;

    const iframe = sidebarContainer.querySelector('iframe');
    if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'WS_STATUS',
            payload: { status }
        }, '*');
    }
}

// Function to check service health using the correct API URL
async function checkServiceHealth() {
    try {
        const response = await fetch(`${apiUrl}/health`);
        return response.ok;
    } catch (error) {
        console.error('SpaceWH AI: Service health check failed:', error);
        return false;
    }
}

// Function to inject the sidebar iframe and toggle button
function ensureSidebarInjected() {
    if (sidebarInjected || !sidebarEnabled) return;

    // Skip sidebar injection on invitation page
    if (window.location.pathname.includes('/invitation') ||
        document.title.toLowerCase().includes('invitation')) {
        return;
    }

    // Create sidebar container
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'spacewh-ai-sidebar';

    // Inject CSS file
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('css/sidebar.css');
    document.head.appendChild(link);

    document.body.appendChild(sidebarContainer);

    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.id = 'spacewh-ai-sidebar-toggle';
    toggleButton.innerHTML = '&#128172;'; // Speech bubble emoji
    document.body.appendChild(toggleButton);

    // Add toggle functionality
    toggleButton.addEventListener('click', () => {
        toggleSidebar(sidebarContainer);
    });

    sidebarInjected = true;
    console.log('SpaceWH AI: Sidebar injected.');
}

// Function to toggle sidebar visibility
function toggleSidebar(container, show = !sidebarVisible, prompt = null) {
    // Don't show sidebar on invitation page
    if (window.location.pathname.includes('/invitation') ||
        document.title.toLowerCase().includes('invitation')) {
        return;
    }

    sidebarVisible = show;
    container.classList.toggle('open', show);

    if (sidebarVisible && !container.hasAttribute('data-loaded')) {
        loadSidebarContent(container, prompt);
    } else if (sidebarVisible && prompt) {
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'SHOW_WITH_PROMPT', payload: { prompt } }, '*');
        }
    }
}

// Load content into the sidebar iframe
async function loadSidebarContent(container, initialPrompt = null) {
    try {
        // Ensure rate-limit check passes before proceeding
        await apiRateLimiter.checkLimit();
    } catch (error) {
        logError('Too many requests. Please wait before trying again.');
        return;
    }

    try {
        container.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';
        container.setAttribute('data-loaded', 'true');

        const { authState } = await chrome.storage.local.get(['authState']);
        const isAuthenticated = authState?.isAuthenticated || false;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';

        // Always load sidebar.html, handle auth state inside the iframe app
        let sidebarUrl = chrome.runtime.getURL('sidebar.html');
        if (initialPrompt) {
            sidebarUrl += `?prompt=${encodeURIComponent(initialPrompt)}`;
        }
        iframe.src = sidebarUrl;

        container.innerHTML = '';
        container.appendChild(iframe);

        // Handle messages from iframe
        window.addEventListener('message', (event) => {
            if (event.source === iframe.contentWindow) {
                if (event.data.type === 'SIDEBAR_CLOSE') {
                    toggleSidebar(container, false);
                }
                // No need to reload on AUTH_SUCCESS, sidebar handles internal state
            }
        });

        // Pass initial auth state to iframe
        iframe.onload = () => {
            iframe.contentWindow.postMessage({
                type: 'AUTH_STATE',
                payload: authState || { isAuthenticated: false }
            }, '*');
        };

    } catch (error) {
        console.error('SpaceWH AI: Failed to load sidebar content:', error);
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Failed to load sidebar.</div>';
        container.removeAttribute('data-loaded'); // Allow retry
    }
}

// Listen for messages from background or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const sidebarContainer = document.getElementById('spacewh-ai-sidebar');

    if (message.type === 'SHOW_SIDEBAR') {
        if (sidebarContainer && sidebarEnabled) {
            toggleSidebar(sidebarContainer, true);
        } else if (sidebarEnabled) {
            ensureSidebarInjected();
            // Use timeout to allow injection to complete
            setTimeout(() => {
                const newContainer = document.getElementById('spacewh-ai-sidebar');
                if (newContainer) toggleSidebar(newContainer, true);
            }, 100);
        }
        sendResponse({ success: true });
    } else if (message.type === 'SHOW_SIDEBAR_WITH_PROMPT') {
        if (sidebarContainer && sidebarEnabled) {
            toggleSidebar(sidebarContainer, true, message.payload.prompt);
        } else if (sidebarEnabled) {
            ensureSidebarInjected();
            // Use timeout to allow injection to complete
            setTimeout(() => {
                const newContainer = document.getElementById('spacewh-ai-sidebar');
                if (newContainer) toggleSidebar(newContainer, true, message.payload.prompt);
            }, 100);
        }
        sendResponse({ success: true });
    } else if (message.type === 'TOGGLE_SIDEBAR_VISIBILITY') {
        sidebarEnabled = message.payload.isEnabled;
        const toggleButton = document.getElementById('spacewh-ai-sidebar-toggle');
        if (toggleButton) toggleButton.style.display = sidebarEnabled ? 'flex' : 'none';
        if (!sidebarEnabled && sidebarContainer) {
            toggleSidebar(sidebarContainer, false); // Hide if disabled
        } else if (sidebarEnabled && !sidebarInjected) {
            ensureSidebarInjected(); // Inject if enabled and not already present
        }
        sendResponse({ success: true });
    } else if (message.type === 'AUTH_STATE_CHANGED') {
        // Forward auth state changes to the iframe if it exists
        const iframe = sidebarContainer?.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'AUTH_STATE',
                payload: message.payload
            }, '*');
        }
        sendResponse({ success: true });
    }
    // Indicate async response if needed, though most are sync here
    // return true;
});

// Initial setup
(async () => {
    await loadSettings();
    if (sidebarEnabled) {
        ensureSidebarInjected();
    }
})();

// Cleanup on window unload
window.addEventListener('unload', () => {
    if (wsManager) {
        wsManager.disconnect();
    }
});