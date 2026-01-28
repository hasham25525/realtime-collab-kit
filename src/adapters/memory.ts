import type { Adapter, User, ServerMessage } from '../types.js'

export class MemoryAdapter implements Adapter {
  private rooms = new Map<string, Map<string, User>>()
  private subscribers = new Map<string, Set<(message: ServerMessage) => void>>()

  async joinRoom(roomId: string, userId: string, metadata?: User['metadata']): Promise<void> {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map())
    }
    
    const room = this.rooms.get(roomId)!
    if (!room.has(userId)) {
      room.set(userId, {
        id: userId,
        roomId,
        cursor: null,
        typing: false,
        metadata
      })
    }
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (room) {
      room.delete(userId)
      if (room.size === 0) {
        this.rooms.delete(roomId)
      }
    }
  }

  async updateUser(roomId: string, userId: string, updates: Partial<User>): Promise<void> {
    const room = this.rooms.get(roomId)
    if (room) {
      const user = room.get(userId)
      if (user) {
        Object.assign(user, updates)
      }
    }
  }

  async getUsers(roomId: string): Promise<User[]> {
    const room = this.rooms.get(roomId)
    return room ? Array.from(room.values()) : []
  }

  async broadcast(roomId: string, message: ServerMessage): Promise<void> {
    const callbacks = this.subscribers.get(roomId)
    if (callbacks) {
      callbacks.forEach(callback => callback(message))
    }
  }

  async subscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void> {
    if (!this.subscribers.has(roomId)) {
      this.subscribers.set(roomId, new Set())
    }
    this.subscribers.get(roomId)!.add(callback)
  }

  async unsubscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void> {
    const callbacks = this.subscribers.get(roomId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscribers.delete(roomId)
      }
    }
  }
}
