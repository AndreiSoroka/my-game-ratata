import { createConnection } from 'node:net'

const path = process.argv[2]
if (path === undefined || process.argv.length !== 3) {
    console.error('Usage: bun run admin:code /path/to/control.sock')
    process.exitCode = 1
} else {
    const socket = createConnection(path)
    socket.setTimeout(10_000, () => socket.destroy(new Error('Timed out')))
    socket.on('error', () => {
        console.error('Admin terminal socket unavailable')
        process.exitCode = 1
    })
    socket.pipe(process.stdout)
}
