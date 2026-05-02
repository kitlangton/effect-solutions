import fs from "node:fs"
import path from "node:path"
import type { ServerWebSocket } from "bun"

const PORT = Number(process.env.CONTENT_WATCHER_PORT ?? 3201)
const WATCH_DIR = path.join(process.cwd(), "../../skills/effect-solutions/topics")

const clients = new Set<ServerWebSocket<undefined>>()

const _server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(req, server) {
    // Upgrade HTTP requests to WebSocket when possible.
    if (server.upgrade(req)) {
      return undefined
    }

    return new Response("Effect Solutions content watcher", {
      status: 200,
    })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
    },
    close(ws) {
      clients.delete(ws)
    },
    message() {
      // No-op: clients don't need to send messages.
    },
  },
})

console.log(`🔌 Content watcher listening on ws://localhost:${PORT} (watching ${WATCH_DIR})`)

function broadcastRefresh() {
  for (const ws of clients) {
    try {
      ws.send("refresh")
    } catch {
      // Ignore send errors on stale sockets.
    }
  }
}

if (!fs.existsSync(WATCH_DIR)) {
  console.warn(`[content-watcher] Directory does not exist, nothing to watch: ${WATCH_DIR}`)
} else {
  fs.watch(
    WATCH_DIR,
    {
      recursive: false,
    },
    (_event, filename) => {
      if (!filename) return
      if (!/\.(md|mdx)$/i.test(filename)) return

      console.log(`[content-watcher] Change detected in ${filename}, notifying clients...`)
      broadcastRefresh()
    },
  )
}
