import { GameRoom } from './game/room'
import { createFetchHandler, createWebSocketHandlers } from './server'

const defaultPort = 3000
const rawPort = Bun.env['PORT']
const port = Number(rawPort ?? String(defaultPort))

if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort ?? String(defaultPort)}`)
}

const room = new GameRoom()
room.start()

const server = Bun.serve({
    fetch: createFetchHandler(room),
    port,
    websocket: createWebSocketHandlers(room),
})

const hostname = server.hostname ?? 'localhost'
const servedPort = server.port ?? port

console.info(`Backend listening on http://${hostname}:${String(servedPort)}`)
console.info(`Game room ready with map ${room.navigation.summary.id}`)
