import { spawn } from 'node:child_process'

const maxOutputBytes = 256 * 1024

export interface NpcAiProcess {
    stdin: { end(input: string): void }
    stdout: AsyncIterable<string | Uint8Array>
    stderr: AsyncIterable<string | Uint8Array>
    exited: Promise<number | null>
    kill(signal: NodeJS.Signals): void
}

export type NpcAiSpawn = (
    command: string,
    args: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
) => NpcAiProcess

export function spawnCli(
    command: string,
    args: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
): NpcAiProcess {
    const child = spawn(command, [...args], {
        ...options,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    })
    // An early process exit may close stdin before its small context is flushed.
    child.stdin.on('error', () => undefined)
    return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        exited: new Promise((resolve, reject) => {
            child.once('error', reject)
            child.once('close', resolve)
        }),
        kill: (signal) => {
            child.kill(signal)
        },
    }
}

export async function readLimited(
    source: AsyncIterable<string | Uint8Array>
): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of source) {
        const buffer = Buffer.from(chunk)
        size += buffer.byteLength
        if (size > maxOutputBytes) {
            throw new Error('NPC AI CLI output exceeds the limit')
        }
        chunks.push(buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

export function cliEnvironment(
    credentialNames: readonly string[]
): NodeJS.ProcessEnv {
    const names = [
        'PATH',
        'HOME',
        'USER',
        'LOGNAME',
        'TMPDIR',
        'HTTPS_PROXY',
        'HTTP_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
        'SSL_CERT_FILE',
        'SSL_CERT_DIR',
        'NODE_EXTRA_CA_CERTS',
        'SYSTEMROOT',
        ...credentialNames,
    ]
    return Object.fromEntries(
        names.flatMap((name) => {
            const value = process.env[name]
            return value === undefined ? [] : [[name, value]]
        })
    )
}
