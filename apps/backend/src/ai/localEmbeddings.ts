import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface EmbeddingProvider {
    embed(texts: string[], query?: boolean): Promise<number[][]>
    stop?(): void
}
function embeddingWorkerPath(): string | undefined {
    if (!import.meta.url.startsWith('file:')) {
        return undefined
    }
    return [
        new URL('./knowledge-embeddings.mjs', import.meta.url),
        new URL(
            '../../../../scripts/knowledge-embeddings.mjs',
            import.meta.url
        ),
    ]
        .map((url) => fileURLToPath(url))
        .find((path) => existsSync(path))
}

/** Native CPU inference is isolated from the Bun simulation process. No inference API is used. */
export class LocalEmbeddings implements EmbeddingProvider {
    private child: ChildProcessWithoutNullStreams | undefined
    private serial = 0
    private buffer = ''
    private readonly pending = new Map<
        number,
        {
            resolve: (value: number[][]) => void
            reject: (reason: Error) => void
            timer: ReturnType<typeof setTimeout>
        }
    >()
    private failed = false
    public constructor(
        private readonly diagnostic: (message: string) => void = (message) =>
            console.warn('NPC knowledge:', message)
    ) {}
    public async embed(texts: string[], query = false): Promise<number[][]> {
        if (
            process.env['VITEST'] === 'true' &&
            process.env['GAME_EMBEDDING_TEST_REAL'] !== '1'
        ) {
            throw new Error('Unit tests use injected embedding providers')
        }
        const processPath = embeddingWorkerPath()
        if (this.failed || processPath === undefined) {
            throw new Error(
                'Local embedding worker is unavailable; lexical retrieval remains active'
            )
        }
        const workerDirectory = dirname(processPath)
        const modelDirectory =
            process.env['GAME_EMBEDDING_MODELS'] ??
            resolve(
                workerDirectory,
                basename(workerDirectory) === 'backend'
                    ? '../../.cache/ratata-models'
                    : '../.cache/ratata-models'
            )
        if (
            !existsSync(
                resolve(
                    modelDirectory,
                    'Xenova/multilingual-e5-small/ratata-manifest.json'
                )
            )
        ) {
            this.fail(
                'Local model is not prepared; run bun run knowledge:prepare. Lexical retrieval remains active.'
            )
            throw new Error('Local model is not prepared')
        }
        if (this.pending.size >= 32) {
            throw new Error('Embedding queue is full; indexing deferred')
        }
        if (this.child === undefined) {
            this.start(processPath)
        }
        const id = ++this.serial
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error('Local embedding request timed out'))
            }, 30_000)
            this.pending.set(id, { resolve, reject, timer })
            this.child?.stdin.write(
                `${JSON.stringify({ id, texts: texts.slice(0, 32), query })}\n`
            )
        })
    }
    private start(path: string): void {
        const child = spawn(
            process.env['GAME_EMBEDDING_NODE'] ?? 'node',
            [path],
            { stdio: 'pipe', env: process.env }
        )
        this.child = child
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
            this.buffer += chunk
            let end: number
            while ((end = this.buffer.indexOf('\n')) >= 0) {
                const line = this.buffer.slice(0, end)
                this.buffer = this.buffer.slice(end + 1)
                try {
                    const result = JSON.parse(line) as {
                        id: number
                        vectors?: number[][]
                        error?: string
                    }
                    const pending = this.pending.get(result.id)
                    if (pending === undefined) {
                        continue
                    }
                    clearTimeout(pending.timer)
                    this.pending.delete(result.id)
                    if (
                        result.error !== undefined ||
                        result.vectors === undefined
                    ) {
                        pending.reject(
                            new Error(result.error ?? 'Missing embeddings')
                        )
                    } else {
                        pending.resolve(result.vectors)
                    }
                } catch {
                    this.fail('Invalid local embedding worker response')
                }
            }
        })
        child.stderr.on('data', (chunk: Buffer) =>
            this.diagnostic(chunk.toString().trim().slice(0, 500))
        )
        child.on('error', () =>
            this.fail('Node embedding worker could not start')
        )
        child.on('exit', () =>
            this.fail(
                'Local model not prepared or embedding worker stopped; lexical retrieval remains active'
            )
        )
        child.stdin.on('error', () =>
            this.fail('Embedding worker input closed')
        )
    }
    private fail(reason: string): void {
        if (!this.failed) {
            this.diagnostic(reason)
        }
        this.failed = true
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(new Error(reason))
        }
        this.pending.clear()
    }
    public stop(): void {
        this.failed = true
        this.child?.kill()
        this.child = undefined
        this.fail('Embedding worker stopped')
    }
}

export class SemanticIndex {
    private readonly vectors = new Map<string, number[]>()
    private readonly queued = new Map<string, string>()
    private readonly texts = new Map<string, string>()
    private processing: Promise<void> | undefined
    public constructor(
        private readonly provider: EmbeddingProvider,
        private readonly diagnostic: (message: string) => void = () => undefined
    ) {}
    public remember(key: string, text: string): void {
        if (this.texts.get(key) === text && this.vectors.has(key)) {
            return
        }
        if (this.texts.get(key) === text && this.queued.has(key)) {
            this.kick()
            return
        }
        if (!this.texts.has(key) && this.texts.size >= 8192) {
            const oldest = this.texts.keys().next().value
            if (oldest !== undefined) {
                this.forget(oldest)
            }
        }
        this.texts.set(key, text)
        if (this.queued.size >= 128) {
            this.diagnostic(
                'Embedding index queue is full; indexing deferred and text remains searchable'
            )
            return
        }
        this.queued.set(key, text)
        this.kick()
    }
    private kick(): void {
        this.processing ??= Promise.resolve()
            .then(() => this.process())
            .finally(() => {
                this.processing = undefined
            })
    }
    private async process(): Promise<void> {
        while (this.queued.size > 0) {
            const batch = [...this.queued].slice(0, 16)
            for (const [key] of batch) {
                this.queued.delete(key)
            }
            try {
                const vectors = await this.provider.embed(
                    batch.map(([, text]) => text.slice(0, 1800))
                )
                batch.forEach(([key, text], i) => {
                    if (
                        this.texts.get(key) === text &&
                        vectors[i] !== undefined
                    ) {
                        this.vectors.set(key, vectors[i])
                    }
                })
            } catch (error) {
                this.diagnostic(
                    error instanceof Error ? error.message : 'Indexing deferred'
                )
                return
            }
        }
    }
    public async rank(
        query: string,
        allowed: readonly string[]
    ): Promise<Map<string, number>> {
        try {
            await this.processing
            const [vector] = await this.provider.embed([query], true)
            if (vector === undefined) {
                return new Map()
            }
            return new Map(
                allowed.flatMap((key) => {
                    const entry = this.vectors.get(key)
                    return entry?.length !== vector.length
                        ? []
                        : [
                              [
                                  key,
                                  entry.reduce(
                                      (sum, value, i) =>
                                          sum + value * (vector[i] ?? 0),
                                      0
                                  ),
                              ],
                          ]
                })
            )
        } catch {
            return new Map()
        }
    }
    public idle(): Promise<void> {
        return this.processing ?? Promise.resolve()
    }
    public forgetExcept(prefix: string, valid: ReadonlySet<string>): void {
        for (const key of this.texts.keys()) {
            if (key.startsWith(prefix) && !valid.has(key)) {
                this.forget(key)
            }
        }
    }
    private forget(key: string): void {
        this.texts.delete(key)
        this.vectors.delete(key)
        this.queued.delete(key)
    }
    public stop(): void {
        this.provider.stop?.()
    }
}
