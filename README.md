# realtime-collab-kit 🛰️

Production-grade TypeScript WebSocket-based presence, cursors, and typing indicators with **rooms**, **auth tokens**, and **Redis scaling**.

## Features

- ✨ **Presence** - See who's online in real-time
- 🖱️ **Live Cursors** - Real-time cursor positions (with automatic throttling)
- ⌨️ **Typing Indicators** - "User is typing..." notifications
- 🏠 **Rooms** - Isolate users into separate collaboration spaces
- 🔐 **Auth Tokens** - Secure authentication support
- 📦 **Redis Scaling** - Horizontal scaling with Redis adapter
- 🔄 **Auto Reconnection** - Automatic reconnection with exponential backoff
- 💬 **Custom Events** - Send and receive custom messages
- 💓 **Heartbeat** - Connection health monitoring with ping/pong
- 📊 **Connection State** - Track connection status (connecting/connected/disconnected)
- 🎯 **TypeScript** - Full type safety
- 🚀 **Lightweight** - Zero framework lock-in

## Install

```bash
npm install realtime-collab-kit
```

## Quick Start

### Server

```typescript
import { createCollabServer } from "realtime-collab-kit"

// Simple server
createCollabServer({ port: 3001 })

// With authentication
createCollabServer({
  port: 3001,
  auth: {
    verifyToken: async (token: string) => {
      // Verify JWT or your auth token
      const userId = await verifyJWT(token)
      return { userId, metadata: { name: "John" } }
    }
  }
})

// With Redis for scaling
createCollabServer({
  port: 3001,
  adapter: {
    type: 'redis',
    redis: {
      host: 'localhost',
      port: 6379
    }
  }
})
```

### Client

```typescript
import { createCollabClient } from "realtime-collab-kit"

const collab = createCollabClient({
  url: "ws://localhost:3001",
  roomId: "my-room",
  token: "your-auth-token", // Optional
  metadata: {
    name: "John Doe",
    avatar: "https://...",
    color: "#ff0000"
  },
  // Optional: Configure reconnection (enabled by default)
  reconnect: {
    enabled: true,
    maxRetries: 10,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2
  },
  throttleCursor: 50, // Throttle cursor updates to max 20/sec (default: 50ms)
  heartbeatInterval: 30000 // Heartbeat every 30 seconds (default: 30000ms)
})

// Track cursor position (automatically throttled)
document.addEventListener("mousemove", (e) => {
  collab.cursor({ x: e.clientX, y: e.clientY })
})

// Track typing
collab.typing(true)  // User started typing
collab.typing(false) // User stopped typing

// Send custom events
collab.send("selection", { start: 0, end: 10 })
collab.send("draw", { x: 100, y: 200, color: "#ff0000" })

// Switch rooms
collab.joinRoom("another-room")

// Listen for updates
collab.on("presence", (data) => {
  console.log("Users online:", data.users)
})

collab.on("update", (data) => {
  console.log("User update:", data.user)
})

// Listen for connection state changes
collab.on("connected", () => {
  console.log("Connected to server")
})

collab.on("disconnected", () => {
  console.log("Disconnected from server")
})

// Listen for custom events
collab.on("custom", (data) => {
  if (data.event === "selection") {
    console.log("Selection update:", data.data)
  }
})

// Check connection state
const state = collab.getState() // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
```

## API Reference

### Server

#### `createCollabServer(config: ServerConfig)`

Creates a WebSocket server for real-time collaboration.

**Config Options:**

- `port?: number` - WebSocket server port (default: 3001)
- `auth?: AuthConfig` - Authentication configuration
  - `verifyToken: (token: string) => Promise<AuthResult> | AuthResult` - Token verification function
- `adapter?: AdapterConfig` - Storage adapter configuration
  - `type: 'memory' | 'redis'` - Adapter type
  - `redis?: RedisConfig` - Redis configuration (if using Redis adapter)

### Client

#### `createCollabClient(config: ClientConfig)`

Creates a WebSocket client for real-time collaboration.

**Config Options:**

- `url: string` - WebSocket server URL
- `roomId?: string` - Initial room ID (default: 'default')
- `token?: string` - Authentication token (optional)
- `metadata?: UserMetadata` - User metadata (name, avatar, color, etc.)
- `reconnect?: ReconnectConfig | boolean` - Reconnection configuration (default: enabled)
  - `enabled?: boolean` - Enable/disable auto-reconnection (default: true)
  - `maxRetries?: number` - Maximum reconnection attempts (default: 10)
  - `initialDelay?: number` - Initial delay in ms (default: 1000)
  - `maxDelay?: number` - Maximum delay in ms (default: 30000)
  - `backoffFactor?: number` - Exponential backoff factor (default: 2)
- `throttleCursor?: number` - Throttle cursor updates in ms (default: 50)
- `heartbeatInterval?: number` - Heartbeat interval in ms (default: 30000, set to 0 to disable)

**Methods:**

- `cursor(position: { x: number; y: number })` - Send cursor position (automatically throttled)
- `typing(isTyping: boolean)` - Send typing status
- `send(event: string, data?: unknown)` - Send custom event
- `joinRoom(roomId: string)` - Join a room
- `leaveRoom()` - Leave current room
- `on(type, callback)` - Listen for events ('presence', 'update', 'error', 'connected', 'disconnected', 'custom')
- `disconnect()` - Close connection (disables auto-reconnection)
- `getState()` - Get current connection state ('connecting' | 'connected' | 'disconnected' | 'reconnecting')

## Examples

1. **Start the WebSocket server** (in one terminal):
   ```bash
   npm run start:example
   ```

2. **Start the HTTP server** (in another terminal):
   ```bash
   npm run serve
   ```

3. **Open your browser** and go to:
   ```
   http://localhost:3000/client.html
   ```

   or 
   
   **Open the advanced example**:
   ```
   http://localhost:3000/client-advanced.html
   ```

   The advanced example demonstrates:
- ✅ Connection state indicators (connected/disconnected/reconnecting)
- ✅ Automatic reconnection with visual feedback
- ✅ Custom events (send and receive)
- ✅ Cursor throttling stats
- ✅ Reconnection attempt counter
- ✅ Real-time event log

4. **Test rooms**: Add `?room=my-room` to the URL to join a specific room:
   ```
   http://localhost:3000/client.html?room=my-room
   ```



### With Authentication

```typescript
import { createCollabServer } from "realtime-collab-kit"
import jwt from "jsonwebtoken"

createCollabServer({
  port: 3001,
  auth: {
    verifyToken: async (token: string) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!)
        return {
          userId: decoded.userId,
          metadata: {
            name: decoded.name,
            avatar: decoded.avatar
          }
        }
      } catch (error) {
        return { userId: "", error: "Invalid token" }
      }
    }
  }
})
```

### With Redis Scaling

```typescript
import { createCollabServer } from "realtime-collab-kit"

createCollabServer({
  port: 3001,
  adapter: {
    type: 'redis',
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    }
  }
})
```

### Custom Events

Send and receive custom events for any use case:

```typescript
// Client: Send custom event
collab.send("selection", { start: 0, end: 10 })
collab.send("draw", { x: 100, y: 200 })

// Client: Listen for custom events
collab.on("custom", (data) => {
  if (data.event === "selection") {
    console.log("Selection:", data.data)
  }
})
```

### Auto Reconnection

Automatic reconnection is enabled by default with exponential backoff:

```typescript
const collab = createCollabClient({
  url: "ws://localhost:3001",
  reconnect: {
    enabled: true,
    maxRetries: 10,
    initialDelay: 1000,    // Start with 1 second
    maxDelay: 30000,      // Max 30 seconds between retries
    backoffFactor: 2      // Double delay each retry
  }
})

// Or disable reconnection
const collab = createCollabClient({
  url: "ws://localhost:3001",
  reconnect: false
})
```

### Connection State

Monitor connection state:

```typescript
collab.on("connected", () => {
  console.log("Connected!")
})

collab.on("disconnected", () => {
  console.log("Disconnected!")
})

// Check current state
const state = collab.getState()
// Returns: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
```

## Development

```bash
# Build TypeScript
npm run build

# Watch mode
npm run dev

# Run example server
npm run start:example

# Serve example client
npm run serve
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type { 
  User, 
  UserMetadata, 
  ServerConfig, 
  ClientConfig,
  CollabClient,
  CollabServer,
  ReconnectConfig
} from "realtime-collab-kit"
```

## Architecture

- **Memory Adapter**: Default in-memory storage (single server)
- **Redis Adapter**: Distributed storage for horizontal scaling
- **Rooms**: Isolate users into separate collaboration spaces
- **Auth**: Optional token-based authentication
- **TypeScript**: Full type safety throughout

## License

MIT
