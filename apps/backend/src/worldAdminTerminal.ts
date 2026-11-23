import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export async function openAdminTerminal(
    issueCode: () => string
): Promise<() => void> {
    const directory = await mkdtemp('/tmp/ratata-admin-')
    const path = join(directory, 'control.sock')
    const server = createServer((socket) => {
        socket.on('error', () => undefined)
        socket.setTimeout(2_000, () => socket.destroy())
        socket.end(`${issueCode()}\n`)
    })
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(path, () => {
                server.off('error', reject)
                resolve()
            })
        })
        await chmod(path, 0o600)
    } catch (error) {
        if (server.listening) {
            server.close()
        }
        await rm(directory, { recursive: true, force: true })
        throw error
    }

    console.info(`Admin code command: bun run admin:code ${path}`)
    server.on('error', () => console.warn('Admin terminal socket unavailable'))
    const interactive = process.stdin.isTTY && process.stdout.isTTY
    const terminal = interactive
        ? createInterface({ input: process.stdin })
        : undefined
    const showCode = () =>
        process.stdout.write(`Admin code (2 min): ${issueCode()}\n`)
    if (terminal !== undefined) {
        showCode()
        terminal.on('line', (line) => {
            if (line.trim() === 'admin-code') {
                showCode()
            }
        })
    }
    return () => {
        terminal?.close()
        server.close(() => {
            void rm(directory, { recursive: true, force: true }).catch(
                () => undefined
            )
        })
    }
}
