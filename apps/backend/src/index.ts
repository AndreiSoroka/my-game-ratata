import { createFetchHandler } from './server'

const defaultPort = 3000
const rawPort = Bun.env['PORT']
const port = Number(rawPort ?? String(defaultPort))

if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort ?? String(defaultPort)}`)
}

const server = Bun.serve({
    fetch: createFetchHandler(),
    port,
})

const hostname = server.hostname ?? 'localhost'
const servedPort = server.port ?? port

console.info(`Backend listening on http://${hostname}:${String(servedPort)}`)
