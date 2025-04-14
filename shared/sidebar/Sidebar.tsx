import React, { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketManager } from '../utils/WebSocketManager';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Error {
  status: number;
  message: string;
}

export function Sidebar() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsManager = useRef<WebSocketManager | null>(null);
  const auth = useAuth();

  useEffect(() => {
    if (!auth?.isAuthenticated || !auth?.apiUrl) {
      setError({
        status: 401,
        message: 'Authentication required. Please log in.'
      });
      return;
    }

    const wsUrl = auth.apiUrl.replace(/^http/, 'ws') + '/ws';
    wsManager.current = new WebSocketManager(wsUrl);

    // Set up WebSocket event handlers
    wsManager.current?.on('message', (data) => {
      if (data.type === 'chat_response') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.payload.content }]);
        setLoading(false);
      } else if (data.type === 'auth_success') {
        setError(null);
      } else if (data.type === 'auth_failed') {
        setError({
          status: 401,
          message: data.payload?.error || 'Authentication failed'
        });
      }
    });

    wsManager.current?.on('error', (error) => {
      console.error('WebSocket error:', error);
      setError({
        status: 0,
        message: 'WebSocket connection error. Some features may be unavailable.'
      });
    });

    wsManager.current?.on('statusChange', (status) => {
      setConnectionStatus(status);
      if (status === 'connected' && auth.token) {
        wsManager.current.setAuthToken(auth.token);
      }
    });

    wsManager.current?.connect();

    return () => {
      if (wsManager.current) {
        wsManager.current.disconnect();
        wsManager.current = null;
      }
    };
  }, [auth?.isAuthenticated, auth?.apiUrl, auth?.token]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || !auth?.isAuthenticated || loading) return;

    // Append the user's message immediately
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      if (!auth.apiUrl || !auth.token) {
        throw new Error('Missing authentication details');
      }

      if (wsManager.current?.isConnected()) {
        const sent = wsManager.current.send({
          type: 'chat_message',
          payload: { content: message }
        });

        if (!sent) {
          throw new Error('Failed to send message via WebSocket');
        }
      } else {
        const response = await fetch(`${auth.apiUrl}/gpt-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`
          },
          body: JSON.stringify({ prompt: message })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      }
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      setError({
        status: error instanceof Error ? 500 :
          (typeof error === 'object' && error !== null && 'status' in error) ?
            (error as { status: number }).status : 500,
        message: error instanceof Error ? error.message : 'Failed to send message'
      });
    } finally {
      setLoading(false);
    }
  }, [input, auth, loading]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      <div className="px-4 py-2 border-b dark:border-gray-700">
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? 'Connected' :
            connectionStatus === 'connecting' ? 'Connecting...' :
              connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                connectionStatus === 'failed' ? 'Connection Failed' :
                  'Disconnected'}
        </div>
      </div>
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!auth?.isAuthenticated || !input.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
