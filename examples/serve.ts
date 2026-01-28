import { createServer } from "http"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/client.html") {
    const html = readFileSync(join(__dirname, "client.html"), "utf-8")
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
  } else if (req.url === "/client-advanced.html") {
    const html = readFileSync(join(__dirname, "client-advanced.html"), "utf-8")
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
  } else if (req.url?.startsWith("/dist/")) {
    // Serve from dist (compiled TypeScript)
    const filePath = join(__dirname, "..", req.url)
    try {
      const content = readFileSync(filePath, "utf-8")
      const contentType = filePath.endsWith(".js") ? "application/javascript" : 
                         filePath.endsWith(".d.ts") ? "text/plain" : "text/plain"
      res.writeHead(200, { "Content-Type": contentType })
      res.end(content)
    } catch (err) {
      res.writeHead(404)
      res.end("Not found")
    }
  } else if (req.url?.startsWith("/src/")) {
    // Fallback to src (for development)
    const filePath = join(__dirname, "..", req.url)
    try {
      const content = readFileSync(filePath, "utf-8")
      const contentType = filePath.endsWith(".js") || filePath.endsWith(".ts") 
        ? "application/javascript" : "text/plain"
      res.writeHead(200, { "Content-Type": contentType })
      res.end(content)
    } catch (err) {
      res.writeHead(404)
      res.end("Not found")
    }
  } else {
    res.writeHead(404)
    res.end("Not found")
  }
})

const PORT = 3000
server.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`)
  console.log(`   Basic example: http://localhost:${PORT}/client.html`)
  console.log(`   Advanced example: http://localhost:${PORT}/client-advanced.html`)
})
