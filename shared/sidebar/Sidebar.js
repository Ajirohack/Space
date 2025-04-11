// Simple sidebar component for the Chrome extension
export default class Sidebar {
  constructor({ target, props }) {
    this.target = target;
    this.title = props?.title || 'SpaceWH GPT Sidebar';
    this.rateLimitRetryDelay = 0;
    this.render();
    this.setupEventListeners();
  }

  render() {
    const isExtension = typeof window !== 'undefined' && window.chrome?.runtime?.id;

    this.target.innerHTML = `
      <div class="sidebar-container">
        <div class="sidebar-header">
          ${this.title}
        </div>
        <div class="sidebar-content" id="messages">
          <div class="message-container">
            <div class="message assistant">
              Welcome to SpaceWH AI Assistant. How can I help you today?
            </div>
          </div>
        </div>
        <div class="input-container">
          <input
            class="input-field"
            id="message-input"
            placeholder="Type a message..."
          />
          <button
            class="send-button"
            id="send-button"
          >
            Send
          </button>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    const input = this.target.querySelector('#message-input');
    const sendButton = this.target.querySelector('#send-button');
    const messagesContainer = this.target.querySelector('#messages');

    const sendMessage = async () => {
      const content = input.value.trim();
      if (!content) return;

      try {
        if (this.rateLimitRetryDelay > 0) {
          const waitTime = Math.ceil(this.rateLimitRetryDelay / 1000);
          throw new Error(`Please wait ${waitTime} seconds before sending another message.`);
        }

        // Add user message
        this.addMessage('user', content);
        input.value = '';

        // Show loading state
        sendButton.textContent = '...';
        sendButton.disabled = true;

        // Fetch response from API
        const response = await fetch('http://localhost:3101/gpt-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: content }),
        });

        if (!response.ok) {
          const error = new Error('Failed to get response');
          error.status = response.status;
          error.headers = response.headers;
          throw error;
        }

        const data = await response.json();

        // Add assistant message
        this.addMessage('assistant', data.response || 'Sorry, I couldn\'t process that request.');
      } catch (error) {
        const isRateLimit = await this.handleApiError(error);
        if (!isRateLimit) {
          console.error('Error:', error);
          this.addMessage('assistant', 'Sorry, there was an error processing your request.');
        }
      } finally {
        sendButton.textContent = 'Send';
        sendButton.disabled = false;
      }
    };

    // Set up event listeners
    if (sendButton && input) {
      sendButton.addEventListener('click', sendMessage);

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          sendMessage();
        }
      });
    }
  }

  addMessage(role, content) {
    const messagesContainer = this.target.querySelector('#messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message-container';
    messageElement.innerHTML = `
      <div class="message ${role}">
        ${this.escapeHtml(content)}
      </div>
    `;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async handleApiError(error) {
    if (error.status === 429) { // Rate limit error
      const retryAfter = error.headers?.get('Retry-After') || 60;
      this.rateLimitRetryDelay = retryAfter * 1000;
      this.addMessage('system', `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
      return true;
    }
    return false;
  }
}