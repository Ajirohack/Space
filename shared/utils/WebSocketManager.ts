import { EventEmitter } from 'events';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'failed';

interface WebSocketMessage {
    type: string;
    payload?: any;
}

interface WebSocketEvents {
    message: (data: any) => void;
    error: (error: Error) => void;
    statusChange: (status: ConnectionStatus) => void;
}

export class WebSocketManager extends EventEmitter {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private status: ConnectionStatus = 'disconnected';
    private authToken: string | null = null;

    constructor(private readonly url: string) {
        super();
    }

    setAuthToken(token: string | null): void {
        this.authToken = token;
        if (this.isConnected() && token) {
            this.authenticate();
        }
    }

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        this.updateStatus('connecting');
        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error('Failed to create WebSocket'));
        }
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.updateStatus('connected');
            if (this.authToken) {
                this.authenticate();
            }
        };

        this.ws.onclose = () => {
            this.updateStatus('disconnected');
            this.handleReconnect();
        };

        this.ws.onerror = (event) => {
            this.handleError(new Error('WebSocket connection error'));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit('message', data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
                this.handleError(new Error('Invalid message format'));
            }
        };
    }

    private handleError(error: Error): void {
        console.error('WebSocket error:', error);
        this.emit('error', error);
    }

    private handleReconnect(): void {
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

    private updateStatus(status: ConnectionStatus): void {
        this.status = status;
        this.emit('statusChange', status);
    }

    private authenticate(): void {
        if (this.isConnected() && this.authToken) {
            this.send({
                type: 'auth',
                payload: { token: this.authToken }
            });
        }
    }

    send(message: WebSocketMessage): boolean {
        if (!this.isConnected()) {
            console.warn('WebSocket not connected, cannot send message');
            return false;
        }

        try {
            this.ws!.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    getStatus(): ConnectionStatus {
        return this.status;
    }

    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.updateStatus('disconnected');
    }
}