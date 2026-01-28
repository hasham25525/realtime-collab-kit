import Redis from 'ioredis'
import type { Adapter, User, ServerMessage } from '../types.js'

export class RedisAdapter implements Adapter {
  private redis: Redis
  private pub: Redis
  private sub: Redis
  private subscribers = new Map<string, Set<(message: ServerMessage) => void>>()

  constructor(config?: { url?: string; host?: string; port?: number; password?: string }) {
    const redisConfig = config?.url 
      ? { path: config.url }
      : {
          host: config?.host || 'localhost',
          port: config?.port || 6379,
          password: config?.password
        }

    this.redis = new Redis(redisConfig)
    this.pub = new Redis(redisConfig)
    this.sub = new Redis(redisConfig)

    this.sub.on('message', (channel, message) => {
      const roomId = channel.replace('room:', '')
      const data = JSON.parse(message) as ServerMessage
      const callbacks = this.subscribers.get(roomId)
      if (callbacks) {
        callbacks.forEach(callback => callback(data))
      }
    })
  }

  async joinRoom(roomId: string, userId: string, metadata?: User['metadata']): Promise<void> {
    const user: User = {
      id: userId,
      roomId,
      cursor: null,
      typing: false,
      metadata
    }
    await this.redis.hset(`room:${roomId}:users`, userId, JSON.stringify(user))
    await this.redis.sadd(`room:${roomId}:members`, userId)
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.redis.hdel(`room:${roomId}:users`, userId)
    await this.redis.srem(`room:${roomId}:members`, userId)
  }

  async updateUser(roomId: string, userId: string, updates: Partial<User>): Promise<void> {
    const userData = await this.redis.hget(`room:${roomId}:users`, userId)
    if (userData) {
      const user = JSON.parse(userData) as User
      Object.assign(user, updates)
      await this.redis.hset(`room:${roomId}:users`, userId, JSON.stringify(user))
    }
  }

  async getUsers(roomId: string): Promise<User[]> {
    const members = await this.redis.smembers(`room:${roomId}:members`)
    if (members.length === 0) return []

    const usersData = await this.redis.hmget(`room:${roomId}:users`, ...members)
    return usersData
      .filter(Boolean)
      .map(data => JSON.parse(data!) as User)
  }

  async broadcast(roomId: string, message: ServerMessage): Promise<void> {
    await this.pub.publish(`room:${roomId}`, JSON.stringify(message))
  }

  async subscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void> {
    if (!this.subscribers.has(roomId)) {
      this.subscribers.set(roomId, new Set())
      await this.sub.subscribe(`room:${roomId}`)
    }
    this.subscribers.get(roomId)!.add(callback)
  }

  async unsubscribe(roomId: string, callback: (message: ServerMessage) => void): Promise<void> {
    const callbacks = this.subscribers.get(roomId)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscribers.delete(roomId)
        await this.sub.unsubscribe(`room:${roomId}`)
      }
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.redis.quit(),
      this.pub.quit(),
      this.sub.quit()
    ])
  }
}
