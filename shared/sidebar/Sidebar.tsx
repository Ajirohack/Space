import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import './Sidebar.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ApiError {
  status: number;
  message: string;
  retryAfter?: number;
}

// WebSocket manager for connection handling
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandler: ((message: any) => void) | null = null;
  private errorHandler: ((error: Event) => void) | null = null;

  constructor(private url: string) { }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      if (this.messageHandler) {
        try {
          const data = JSON.parse(event.data);
          this.messageHandler(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      }
    };

    this.ws.onerror = (error) => {
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    };

    this.ws.onclose = () => {
      this.handleDisconnect();
    };
  }

  private handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    }
  }

  setMessageHandler(handler: (message: any) => void) {
    this.messageHandler = handler;
  }

  setErrorHandler(handler: (error: Event) => void) {
    this.errorHandler = handler;
  }

  send(message: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
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

export function Sidebar() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Welcome to SpaceWH AI Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsManager = useRef<WebSocketManager | null>(null);
  const { auth } = useAuth();

  const wsUrl = auth.apiUrl.replace(/^http/, 'ws') + '/ws';

  useEffect(() => {
    // Initialize WebSocket connection
    if (auth.isAuthenticated && !wsManager.current) {
      wsManager.current = new WebSocketManager(wsUrl);
      wsManager.current.setMessageHandler((data) => {
        if (data.type === 'chat_response') {
          setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        }
      });
      wsManager.current.setErrorHandler((error) => {
        console.error('WebSocket error:', error);
        setError({
          status: 0,
          message: 'WebSocket connection error. Some features may be unavailable.'
        });
      });
      wsManager.current.connect();
    }

    // Cleanup WebSocket connection on unmount or auth change
    return () => {
      if (wsManager.current) {
        wsManager.current.disconnect();
        wsManager.current = null;
      }
    };
  }, [auth.isAuthenticated, wsUrl]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || !auth.isAuthenticated || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${auth.apiUrl}/gpt-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({ prompt: message })
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers.get('Retry-After') ||
            response.headers.get('X-Rate-Limit-Reset') ||
            '5'
          );
          throw new Error(`Rate limited. Please wait ${retryAfter} seconds.`);
        }
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.response) {
        throw new Error('Received empty response from server');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

      // Also send via WebSocket for real-time updates
      wsManager.current?.send(JSON.stringify({
        type: 'chat_message',
        content: message
      }));

    } catch (error) {
      console.error('Error sending message:', error);
      setError({
        status: error.status || 500,
        message: error.message || 'Failed to send message'
      });
    } finally {
      setLoading(false);
    }
  }, [input, auth, loading]);

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700'
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center">
            <div className="max-w-[80%] p-3 rounded-lg bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-100">
              {error.message}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4 dark:border-gray-700">
        <div className="flex space-x-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            disabled={!auth.isAuthenticated || loading}
          />
          <button
            onClick={sendMessage}
            disabled={!auth.isAuthenticated || !input.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}