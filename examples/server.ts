import { createCollabServer } from '../src/index.js'

// Simple server without auth
createCollabServer({ port: 3001 })

// Example with auth:
// createCollabServer({
//   port: 3001,
//   auth: {
//     verifyToken: async (token: string) => {
//       // Verify JWT or your auth token
//       // Return { userId: 'user-123', metadata: { name: 'John' } }
//       return { userId: 'user-123', metadata: { name: 'John' } }
//     }
//   }
// })

// Example with Redis:
// createCollabServer({
//   port: 3001,
//   adapter: {
//     type: 'redis',
//     redis: {
//       host: 'localhost',
//       port: 6379
//     }
//   }
// })
