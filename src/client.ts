import type { ClientConfig, CollabClient, ServerMessage, ClientMessage, ReconnectConfig } from './types.js'

export function createCollabClient(config: ClientConfig): CollabClient {
  const { 
    url, 
    token, 
    roomId = 'default', 
    metadata,
    reconnect: reconnectConfig = { enabled: true },
    throttleCursor = 50, // Default: throttle cursor to max 20 updates/sec
    heartbeatInterval = 30000 // Default: 30 seconds
  } = config

  let ws: WebSocket | null = null
  const listeners: Record<string, Array<(data: ServerMessage) => void>> = {}
  let currentRoomId = roomId
  let connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' = 'connecting'
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let lastCursorUpdate = 0
  let cursorThrottleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingCursorPosition: { x: number; y: number } | null = null
  let shouldReconnect = true

  // Normalize reconnect config
  const reconnect: ReconnectConfig = typeof reconnectConfig === 'boolean'
    ? { enabled: reconnectConfig }
    : { 
        enabled: reconnectConfig?.enabled !== false,
        maxRetries: reconnectConfig?.maxRetries ?? 10,
        initialDelay: reconnectConfig?.initialDelay ?? 1000,
        maxDelay: reconnectConfig?.maxDelay ?? 30000,
        backoffFactor: reconnectConfig?.backoffFactor ?? 2
      }

  function setState(newState: typeof connectionState) {
    if (connectionState !== newState) {
      const oldState = connectionState
      connectionState = newState
      
      if (newState === 'connected' && oldState !== 'connected') {
        emit('connected', { type: 'connected' } as ServerMessage)
      } else if (newState === 'disconnected' && oldState !== 'disconnected') {
        emit('disconnected', { type: 'disconnected' } as ServerMessage)
      }
    }
  }

  function emit(type: string, data: ServerMessage) {
    if (listeners[type]) {
      listeners[type].forEach((cb) => cb(data))
    }
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    try {
      ws = new WebSocket(url)
      setState(reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage
          
          // Handle ping/pong
          if (data.type === 'ping') {
            sendMessage('pong', {})
            return
          }
          if (data.type === 'pong') {
            // Heartbeat received, connection is alive
            return
          }

          // Emit to listeners
          if (listeners[data.type]) {
            listeners[data.type].forEach((cb) => cb(data))
          }
          // Also handle error messages
          if (data.type === 'error' && listeners['error']) {
            listeners['error'].forEach((cb) => cb(data))
          }
        } catch (error) {
          console.error('Failed to parse message:', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        if (listeners['error']) {
          listeners['error'].forEach((cb) => cb({ 
            type: 'error', 
            error: 'WebSocket connection error' 
          }))
        }
      }

      ws.onopen = () => {
        reconnectAttempts = 0
        setState('connected')
        console.log('WebSocket connected, sending join message...')
        
        // Authenticate and join room
        if (token) {
          sendMessage('join', {
            token,
            roomId: currentRoomId,
            metadata
          })
        } else {
          sendMessage('join', {
            roomId: currentRoomId,
            metadata
          })
        }

        // Start heartbeat
        startHeartbeat()
      }

      ws.onclose = (event) => {
        setState('disconnected')
        stopHeartbeat()
        
        // Only reconnect if we should (not manually disconnected)
        if (shouldReconnect && reconnect.enabled && reconnectAttempts < (reconnect.maxRetries ?? 10)) {
          const delay = Math.min(
            (reconnect.initialDelay ?? 1000) * Math.pow(reconnect.backoffFactor ?? 2, reconnectAttempts),
            reconnect.maxDelay ?? 30000
          )
          
          reconnectAttempts++
          console.log(`Connection closed. Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`)
          
          reconnectTimer = setTimeout(() => {
            connect()
          }, delay)
        } else if (reconnectAttempts >= (reconnect.maxRetries ?? 10)) {
          console.error('Max reconnection attempts reached')
          emit('error', { type: 'error', error: 'Max reconnection attempts reached' })
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setState('disconnected')
    }
  }

  function startHeartbeat() {
    if (heartbeatInterval > 0) {
      stopHeartbeat()
      heartbeatTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          sendMessage('ping', {})
        }
      }, heartbeatInterval)
    }
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function sendMessage(type: ClientMessage['type'], payload: Partial<ClientMessage>): void {
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type, ...payload } as ClientMessage))
      } catch (error) {
        console.error('Failed to send message:', error)
      }
    }
  }

  function on(type: 'presence' | 'update' | 'error' | 'connected' | 'disconnected' | 'custom', callback: (data: ServerMessage) => void): void {
    listeners[type] = listeners[type] || []
    listeners[type].push(callback)
  }

  function flushCursorUpdate() {
    if (pendingCursorPosition) {
      sendMessage('cursor', { position: pendingCursorPosition, roomId: currentRoomId })
      pendingCursorPosition = null
    }
  }

  // Start initial connection
  connect()

  return {
    on,
    cursor: (position: { x: number; y: number }) => {
      const now = Date.now()
      pendingCursorPosition = position

      if (now - lastCursorUpdate >= throttleCursor) {
        flushCursorUpdate()
        lastCursorUpdate = now
      } else {
        // Clear existing timer and set new one
        if (cursorThrottleTimer) {
          clearTimeout(cursorThrottleTimer)
        }
        cursorThrottleTimer = setTimeout(flushCursorUpdate, throttleCursor - (now - lastCursorUpdate))
      }
    },
    typing: (isTyping: boolean) => {
      sendMessage('typing', { isTyping, roomId: currentRoomId })
    },
    send: (event: string, data?: unknown) => {
      sendMessage('custom', { event, data, roomId: currentRoomId })
    },
    joinRoom: (newRoomId: string) => {
      currentRoomId = newRoomId
      sendMessage('join', { roomId: newRoomId })
    },
    leaveRoom: () => {
      sendMessage('leave', { roomId: currentRoomId })
    },
    disconnect: () => {
      shouldReconnect = false
      stopHeartbeat()
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (cursorThrottleTimer) {
        clearTimeout(cursorThrottleTimer)
        cursorThrottleTimer = null
      }
      ws?.close()
      ws = null
      setState('disconnected')
    },
    getState: () => connectionState
  }
}
