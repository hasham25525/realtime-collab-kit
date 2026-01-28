export interface User {
  id: string
  roomId: string
  cursor: { x: number; y: number } | null
  typing: boolean
  metadata?: UserMetadata
}

export interface UserMetadata {
  name?: string
  avatar?: string
  color?: string
  [key: string]: unknown
}

export interface ServerConfig {
  port?: number
  auth?: AuthConfig
  adapter?: AdapterConfig
}

export interface AuthConfig {
  verifyToken: (token: string) => Promise<AuthResult> | AuthResult
}

export interface AuthResult {
  userId: string
  metadata?: UserMetadata
  error?: string
}

export interface AdapterConfig {
  type: 'memory' | 'redis'
  redis?: RedisConfig
}

export interface RedisConfig {
  url?: string
  host?: string
  port?: number
  password?: string
}

export interface ReconnectConfig {
  enabled?: boolean
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffFactor?: number
}

export interface ClientConfig {
  url: string
  token?: string
  roomId?: string
  metadata?: UserMetadata
  reconnect?: ReconnectConfig | boolean
  throttleCursor?: number 
  heartbeatInterval?: number 
}

export type MessageType = 'cursor' | 'typing' | 'join' | 'leave' | 'presence' | 'update' | 'custom' | 'ping' | 'pong'

export interface ClientMessage {
  type: MessageType
  roomId?: string
  position?: { x: number; y: number }
  isTyping?: boolean
  token?: string
  metadata?: UserMetadata
  event?: string 
  data?: unknown 
}

export interface ServerMessage {
  type: 'presence' | 'update' | 'error' | 'custom' | 'ping' | 'pong' | 'connected' | 'disconnected'
  users?: User[]
  user?: User
  error?: string
  event?: string 
  data?: unknown 
}

export interface CollabClient {
  on(type: 'presence' | 'update' | 'error' | 'connected' | 'disconnected' | 'custom', callback: (data: ServerMessage) => void): void
  cursor(position: { x: number; y: number }): void
  typing(isTyping: boolean): void
  send(event: string, data?: unknown): void // Send custom events
  joinRoom(roomId: string): void
  leaveRoom(): void
  disconnect(): void
  getState(): 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
}

export interface CollabServer {
  close(): void
}

export interface Adapter {
  joinRoom(roomId: string, userId: string, metadata?: UserMetadata): Promise<void>
  leaveRoom(roomId: string, userId: string): Promise<void>
  updateUser(roomId: string, userId: string, updates: Partial<User>): Promise<void>
  getUsers(roomId: string): Promise<User[]>
  broadcast(roomId: string, message: ServerMessage): Promise<void>
  subscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void>
  unsubscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void>
}
