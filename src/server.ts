import { WebSocketServer, WebSocket } from 'ws'
import type { ServerConfig, User, ClientMessage, ServerMessage, Adapter, AuthResult } from './types.js'
import { MemoryAdapter } from './adapters/memory.js'
import { RedisAdapter } from './adapters/redis.js'

interface ClientConnection {
  ws: WebSocket
  userId: string
  roomId: string
  metadata?: User['metadata']
}

export function createCollabServer(config: ServerConfig = {}) {
  const { port = 3001, auth, adapter: adapterConfig } = config
  
  const wss = new WebSocketServer({ port })
  const connections = new Map<WebSocket, ClientConnection>()
  
  // Initialize adapter
  const adapter: Adapter = adapterConfig?.type === 'redis'
    ? new RedisAdapter(adapterConfig.redis)
    : new MemoryAdapter()

  // Subscribe to room broadcasts
  const roomSubscriptions = new Map<string, (message: ServerMessage) => void>()

  wss.on('connection', async (ws: WebSocket) => {
    let connection: ClientConnection | null = null

    ws.on('message', async (msg: Buffer) => {
      try {
        const data = JSON.parse(msg.toString()) as ClientMessage

        // Handle join/authentication
        if (data.type === 'join') {
          // If already connected, handle room switching
          if (connection && data.roomId && data.roomId !== connection.roomId) {
            await adapter.leaveRoom(connection.roomId, connection.userId)
            await unsubscribeFromRoom(connection.roomId)
            
            connection.roomId = data.roomId
            await adapter.joinRoom(data.roomId, connection.userId, connection.metadata)
            await subscribeToRoom(data.roomId)
            await broadcastToRoom(data.roomId, { type: 'presence', users: await adapter.getUsers(data.roomId) })
            return
          }

          // Initial join - handle authentication
          if (!auth) {
            // No auth required - create anonymous user
            const userId = crypto.randomUUID()
            const roomId = data.roomId || 'default'
            connection = {
              ws,
              userId,
              roomId,
              metadata: data.metadata
            }
            connections.set(ws, connection)
            await adapter.joinRoom(roomId, userId, data.metadata)
            await subscribeToRoom(roomId)
            await broadcastToRoom(roomId, { type: 'presence', users: await adapter.getUsers(roomId) })
            return
          }

          // Auth required - verify token
          if (!data.token) {
            ws.send(JSON.stringify({ type: 'error', error: 'Authentication required. Token missing.' }))
            return
          }

          const authResult: AuthResult = await auth.verifyToken(data.token)
          
          if (authResult.error) {
            ws.send(JSON.stringify({ type: 'error', error: authResult.error }))
            return
          }

          const roomId = data.roomId || 'default'
          connection = {
            ws,
            userId: authResult.userId,
            roomId,
            metadata: authResult.metadata || data.metadata
          }
          connections.set(ws, connection)
          await adapter.joinRoom(roomId, authResult.userId, connection.metadata)
          await subscribeToRoom(roomId)
          await broadcastToRoom(roomId, { type: 'presence', users: await adapter.getUsers(roomId) })
          return
        }

        if (!connection) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated. Send join message first.' }))
          return
        }

        if (data.type === 'leave') {
          await adapter.leaveRoom(connection.roomId, connection.userId)
          await unsubscribeFromRoom(connection.roomId)
          await broadcastToRoom(connection.roomId, { type: 'presence', users: await adapter.getUsers(connection.roomId) })
          return
        }

        // Handle cursor updates
        if (data.type === 'cursor' && data.position && connection) {
          const conn = connection
          await adapter.updateUser(conn.roomId, conn.userId, { cursor: data.position })
          const user = (await adapter.getUsers(conn.roomId)).find(u => u.id === conn.userId)
          if (user) {
            await broadcastToRoom(conn.roomId, { type: 'update', user }, conn.userId)
          }
          return
        }

        // Handle typing updates
        if (data.type === 'typing' && typeof data.isTyping === 'boolean' && connection) {
          const conn = connection
          await adapter.updateUser(conn.roomId, conn.userId, { typing: data.isTyping })
          const user = (await adapter.getUsers(conn.roomId)).find(u => u.id === conn.userId)
          if (user) {
            await broadcastToRoom(conn.roomId, { type: 'update', user }, conn.userId)
          }
          return
        }

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }))
          return
        }

        if (data.type === 'pong') {
          return
        }

        // Handle custom events
        if (data.type === 'custom' && data.event && connection) {
          const conn = connection
          const user = (await adapter.getUsers(conn.roomId)).find(u => u.id === conn.userId)
          await broadcastToRoom(conn.roomId, {
            type: 'custom',
            event: data.event,
            data: data.data,
            user: user ?? { id: conn.userId, roomId: conn.roomId, cursor: null, typing: false, metadata: conn.metadata }
          }, conn.userId)
          return
        }
      } catch (error) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Invalid message format' 
        }))
      }
    })

    ws.on('close', async () => {
      if (connection) {
        await adapter.leaveRoom(connection.roomId, connection.userId)
        await unsubscribeFromRoom(connection.roomId)
        await broadcastToRoom(connection.roomId, { type: 'presence', users: await adapter.getUsers(connection.roomId) })
        connections.delete(ws)
      }
    })
  })

  async function subscribeToRoom(roomId: string): Promise<void> {
    if (roomSubscriptions.has(roomId)) return

    const callback = async (message: ServerMessage) => {
      const { _excludeUserId, ...payload } = message
      const roomConnections = Array.from(connections.values())
        .filter(conn => conn.roomId === roomId)
      
      for (const conn of roomConnections) {
        if (_excludeUserId !== undefined && conn.userId === _excludeUserId) continue
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify(payload))
        }
      }
    }

    roomSubscriptions.set(roomId, callback)
    await adapter.subscribe(roomId, callback)
  }

  async function unsubscribeFromRoom(roomId: string): Promise<void> {
    const callback = roomSubscriptions.get(roomId)
    if (callback) {
      await adapter.unsubscribe(roomId, callback)
      roomSubscriptions.delete(roomId)
    }
  }

  async function broadcastToRoom(roomId: string, message: ServerMessage, excludeUserId?: string): Promise<void> {
    const payload: ServerMessage = excludeUserId ? { ...message, _excludeUserId: excludeUserId } : message
    await adapter.broadcast(roomId, payload)
  }

  console.log(`  Collab server running on ws://localhost:${port}`)
  if (adapterConfig?.type === 'redis') {
    console.log(`   Using Redis adapter for scaling`)
  }

  return {
    close: async () => {
      wss.close()
      if ('disconnect' in adapter && typeof adapter.disconnect === 'function') {
        await adapter.disconnect()
      }
    }
  }
}
