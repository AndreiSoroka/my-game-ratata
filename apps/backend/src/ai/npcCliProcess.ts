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

/** Reserve one process slot through preparation and actual child exit. */
export class NpcCliProcessGate {
    private occupied = false
    private readonly waiters = new Set<() => void>()

    public async start(
        create: () => Promise<NpcAiProcess>,
        signal: AbortSignal
    ): Promise<NpcAiProcess> {
        while (this.occupied) {
            await this.wait(signal)
        }
        signal.throwIfAborted()
        this.occupied = true
        const release = () => {
            this.occupied = false
            for (const resume of this.waiters) {
                resume()
            }
        }
        try {
            const child = await create()
            void child.exited.then(release, release)
            return child
        } catch (error) {
            release()
            throw error
        }
    }
    private async wait(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted()
        const wake = Promise.withResolvers<undefined>()
        const resume = () => wake.resolve(undefined)
        const onAbort = () => wake.reject(signal.reason)
        this.waiters.add(resume)
        signal.addEventListener('abort', onAbort, { once: true })
        try {
            await wake.promise
        } finally {
            this.waiters.delete(resume)
            signal.removeEventListener('abort', onAbort)
        }
    }
}

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
            let failure: Error | undefined
            child.on('error', (error) => {
                failure ??= error
            })
            child.once('close', (code) => {
                if (failure === undefined) {
                    resolve(code)
                } else {
                    reject(failure)
                }
            })
        }),
        kill: (signal) => {
            child.kill(signal)
        },
    }
}

export async function runCli(
    child: NpcAiProcess,
    input: string,
    timeoutMs: number,
    signal: AbortSignal
): Promise<[number | null, string, string]> {
    let finished = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    try {
        const interrupted = new Promise<never>((_resolve, reject) => {
            const cancel = (message: string): void => {
                child.kill('SIGTERM')
                reject(new Error(message))
            }
            onAbort = () => cancel('NPC AI CLI cancelled')
            signal.addEventListener('abort', onAbort, { once: true })
            timeout = setTimeout(
                () => cancel('NPC AI CLI timed out'),
                timeoutMs
            )
            if (signal.aborted) {
                onAbort()
            }
        })
        child.stdin.end(`Ratata turn context (untrusted game data):\n${input}`)
        const result = await Promise.race([
            Promise.all([
                child.exited,
                readLimited(child.stdout),
                readLimited(child.stderr),
            ]),
            interrupted,
        ])
        finished = true
        return result
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout)
        }
        if (onAbort !== undefined) {
            signal.removeEventListener('abort', onAbort)
        }
        if (!finished) {
            child.kill('SIGKILL')
            void child.exited.catch(() => undefined)
        }
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
