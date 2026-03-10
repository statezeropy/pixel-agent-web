import type { ClientMessage, ServerMessage } from './types.js'

type MessageHandler = (msg: ServerMessage) => void
type ConnectionHandler = () => void

const PING_INTERVAL_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10

export class WebSocketManager {
  private ws: WebSocket | null = null
  private url = ''
  private reconnectAttempts = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private messageHandlers: MessageHandler[] = []
  private connectHandlers: ConnectionHandler[] = []
  private disconnectHandlers: ConnectionHandler[] = []
  private connectionFailedHandlers: ConnectionHandler[] = []

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  connect(url: string): void {
    this.url = url
    this.cleanup()

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.startPing()
      for (const h of this.connectHandlers) h()
    }

    this.ws.onclose = (event) => {
      this.stopPing()
      for (const h of this.disconnectHandlers) h()
      if (event.code !== 1000) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      console.error('[WS] Connection error')
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        for (const h of this.messageHandlers) h(msg)
      } catch (err) {
        console.error('[WS] Failed to parse message:', err)
      }
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      console.warn('[WS] Cannot send — not connected')
    }
  }

  disconnect(): void {
    this.cleanup()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler)
    }
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.push(handler)
    return () => {
      this.connectHandlers = this.connectHandlers.filter((h) => h !== handler)
    }
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.push(handler)
    return () => {
      this.disconnectHandlers = this.disconnectHandlers.filter((h) => h !== handler)
    }
  }

  onConnectionFailed(handler: ConnectionHandler): () => void {
    this.connectionFailedHandlers.push(handler)
    return () => {
      this.connectionFailedHandlers = this.connectionFailedHandlers.filter((h) => h !== handler)
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' })
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] Max reconnection attempts reached')
      for (const h of this.connectionFailedHandlers) h()
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000)
    this.reconnectAttempts++
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimer = setTimeout(() => this.connect(this.url), delay)
  }

  private cleanup(): void {
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager()
