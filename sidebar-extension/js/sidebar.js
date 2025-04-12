// DOM elements
const messagesContainer = document.getElementById('messages');
const inputField = document.getElementById('input-field');
const sendButton = document.getElementById('send-button');
const closeButton = document.getElementById('close-button');
const userNameDisplay = document.getElementById('user-name');

// State
let currentAuthState = {
    isAuthenticated: false,
    userName: null,
    token: null // Store the token (membershipKey)
};
let currentApiUrl = 'http://localhost:3101'; // Default API URL
let wsConnection = null; // WebSocket connection

// WebSocket manager
class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.status = 'disconnected';
        this.connectionStatusElement = document.getElementById('connection-status');
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

        this.updateStatus('connecting');
        try {
            this.socket = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.handleConnectionError(error);
        }
    }

    setupEventHandlers() {
        if (!this.socket) return;

        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateStatus('connected');

            // Send authentication if available
            if (currentAuthState.isAuthenticated && currentAuthState.token) {
                this.authenticate();
            }
        };

        this.socket.onclose = (event) => {
            console.log('WebSocket disconnected, code:', event.code);
            this.updateStatus('disconnected');
            this.handleReconnect();
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleConnectionError(error);
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
    }

    updateStatus(status) {
        this.status = status;
        if (this.connectionStatusElement) {
            this.connectionStatusElement.className = `connection-status ${status}`;

            let statusText = 'Disconnected';
            switch (status) {
                case 'connected':
                    statusText = 'Connected';
                    break;
                case 'connecting':
                case 'reconnecting':
                    statusText = 'Connecting...';
                    break;
                case 'failed':
                    statusText = 'Connection Failed';
                    break;
            }

            this.connectionStatusElement.textContent = statusText;
        }
    }

    handleConnectionError(error) {
        if (this.connectionStatusElement) {
            this.updateStatus('failed');
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
            addMessage('assistant', 'Connection to server lost. Please reload the sidebar.');
        }
    }

    handleMessage(data) {
        // Handle different message types
        if (data.type === 'notification') {
            addMessage('assistant', data.message);
        } else if (data.type === 'update') {
            // Handle updates to UI or state
            console.log('Received update:', data);
        }
    }

    authenticate() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'auth',
                token: currentAuthState.token
            }));
        }
    }

    send(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket not connected, can\'t send message');
            return false;
        }

        try {
            this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.updateStatus('disconnected');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Request initial state from background
        const [authState, settings] = await Promise.all([
            chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }),
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
        ]);

        currentAuthState = authState || currentAuthState;
        currentApiUrl = settings?.apiUrl || currentApiUrl;

        updateAuthUI();
        initializeWebSocket();

        // Handle initial prompt if passed via URL
        const urlParams = new URLSearchParams(window.location.search);
        const initialPrompt = urlParams.get('prompt');
        if (initialPrompt && currentAuthState.isAuthenticated) {
            inputField.value = initialPrompt;
            sendMessage(); // Automatically send if prompt exists and authenticated
        }
    } catch (error) {
        console.error('Error initializing sidebar:', error);
        addMessage('assistant', 'Error loading sidebar configuration.');
        updateAuthUI(); // Update UI even on error (likely shows logged out)
    }

    // Listen for auth state changes pushed from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'AUTH_STATE_CHANGED') {
            console.log("Sidebar received AUTH_STATE_CHANGED:", message.payload);
            currentAuthState = message.payload; // Update local state
            updateAuthUI();

            // Reconnect WebSocket with new auth if needed
            if (wsConnection && currentAuthState.isAuthenticated) {
                wsConnection.authenticate();
            }
        }
        // Handle prompt pushed after sidebar load
        if (message.type === 'SHOW_WITH_PROMPT' && currentAuthState.isAuthenticated) {
            const { prompt } = message.payload;
            if (prompt) {
                inputField.value = prompt;
                sendMessage();
            }
        }
    });
});

function initializeWebSocket() {
    if (!currentAuthState.isAuthenticated) return;

    // Create WebSocket URL from API URL (replace http with ws)
    const wsUrl = currentApiUrl.replace(/^http/, 'ws') + '/ws';

    // Initialize WebSocket connection
    wsConnection = new WebSocketManager(wsUrl);
    wsConnection.connect();

    // Setup reconnection on network status change
    window.addEventListener('online', () => {
        if (wsConnection && currentAuthState.isAuthenticated) {
            wsConnection.connect();
        }
    });

    window.addEventListener('beforeunload', () => {
        if (wsConnection) {
            wsConnection.disconnect();
        }
    });
}

// Update UI based on auth state
function updateAuthUI() {
    const isAuth = currentAuthState?.isAuthenticated;
    userNameDisplay.textContent = isAuth ? (currentAuthState.userName || 'User') : '';
    inputField.disabled = !isAuth;
    sendButton.disabled = !isAuth || !inputField.value.trim(); // Also disable if input is empty

    inputField.placeholder = isAuth ? "Type a message..." : "Please login via the extension popup.";

    // Add/remove auth notice
    const container = document.querySelector('.sidebar-container');
    let notice = container.querySelector('.auth-notice');
    if (!isAuth && !notice) {
        notice = document.createElement('div');
        notice.className = 'auth-notice';
        notice.textContent = 'Please login to use the AI assistant.';
        container.appendChild(notice);
    } else if (isAuth && notice) {
        notice.remove();
    }
}

// Send message to AI assistant
async function sendMessage() {
    const message = inputField.value.trim();
    if (!message || !currentAuthState.isAuthenticated || !currentAuthState.token) {
        updateAuthUI(); // Ensure UI reflects auth state if trying to send while logged out
        return;
    }

    addMessage('user', message);
    inputField.value = '';
    updateAuthUI(); // Update button disabled state

    const loadingId = addLoading();
    setLoadingState(true);

    try {
        const response = await fetch(`${currentApiUrl}/gpt-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAuthState.token}` // Use token from state
            },
            body: JSON.stringify({ prompt: message })
        });

        removeLoading(loadingId); // Remove loading indicator immediately

        if (!response.ok) {
            let errorDetail = `API Error: ${response.statusText} (${response.status})`;
            try {
                const errorJson = await response.json();
                errorDetail = errorJson.detail?.message || errorJson.detail || errorDetail;
            } catch { /* Ignore if response body is not JSON */ }
            throw new Error(errorDetail);
        }

        const data = await response.json();
        if (!data.response) {
            throw new Error("Received empty response from AI.");
        }
        addMessage('assistant', data.response);

    } catch (error) {
        console.error('Error sending message:', error);
        removeLoading(loadingId); // Ensure loading is removed on error
        addMessage('assistant', `Sorry, there was an error: ${error.message}`);
    } finally {
        setLoadingState(false);
    }
}

// Add a message to the UI
function addMessage(role, content) {
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.textContent = content; // Use textContent for security unless HTML is intended
    messageContainer.appendChild(messageDiv);
    messagesContainer.appendChild(messageContainer);
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to bottom
}

// Add loading indicator
function addLoading() {
    const id = `loading-${Date.now()}`; // Use a more unique ID
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    messageContainer.dataset.loadingId = id;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant loading';
    messageDiv.innerHTML = `<span>Thinking</span>`; // Use innerHTML for the animation span

    messageContainer.appendChild(messageDiv);
    messagesContainer.appendChild(messageContainer);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return id;
}

// Remove loading indicator by ID
function removeLoading(id) {
    const loadingElement = messagesContainer.querySelector(`[data-loading-id="${id}"]`);
    if (loadingElement) {
        loadingElement.remove();
    }
}

// Set loading state for input/button
function setLoadingState(isLoading) {
    inputField.disabled = isLoading || !currentAuthState.isAuthenticated;
    sendButton.disabled = isLoading || !currentAuthState.isAuthenticated || !inputField.value.trim();
    // Optionally change button text/style during loading
}

// Toggle sidebar visibility
function toggleSidebar(show) {
    const sidebar = document.getElementById('spacewh-ai-sidebar');
    if (show === undefined) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList[show ? 'add' : 'remove']('open');
    }
}

// Event listeners
inputField.addEventListener('input', updateAuthUI); // Update send button state on input
inputField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { // Allow Shift+Enter for newlines if using textarea later
        event.preventDefault(); // Prevent default newline in input
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);

closeButton.addEventListener('click', () => {
    toggleSidebar(false);
    window.parent.postMessage({ type: 'SIDEBAR_CLOSE' }, '*');
});

// Listen for toggle messages from the parent window
window.addEventListener('message', (event) => {
    if (event.data.type === 'TOGGLE_SIDEBAR') {
        toggleSidebar(event.data.show);
    }
});