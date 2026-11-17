import profile from '../../../../scripts/knowledge-profile.json'
import type { EmbeddingProvider } from './embeddingTypes'
import type { PersistentVectorCache } from './persistentVectorCache'

interface QueuedPassage {
    text: string
    persist: boolean
}

export class SemanticIndex {
    private readonly vectors = new Map<string, number[]>()
    private readonly queued = new Map<string, QueuedPassage>()
    private readonly texts = new Map<string, string>()
    private processing: Promise<void> | undefined
    private readonly cache: PersistentVectorCache | undefined
    public constructor(
        private readonly provider: EmbeddingProvider,
        private readonly diagnostic: (message: string) => void = () =>
            undefined,
        cache?: PersistentVectorCache
    ) {
        this.cache = cache ?? provider.persistentCache?.()
    }
    public remember(key: string, text: string, persist = false): void {
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
        this.vectors.delete(key)
        this.texts.set(key, text)
        if (this.queued.size >= 128) {
            this.diagnostic(
                'Embedding index queue is full; indexing deferred and text remains searchable'
            )
            return
        }
        this.queued.set(key, {
            text,
            persist:
                persist &&
                !key.startsWith('memory:') &&
                !key.startsWith('own-star:'),
        })
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
                const misses = await this.cached(batch)
                if (misses.length === 0) {
                    continue
                }
                const vectors = await this.provider.embed(
                    misses.map(([, value]) =>
                        value.text.slice(0, profile.maxPassageCharacters)
                    )
                )
                const saved: Array<readonly [string, number[]]> = []
                misses.forEach(([key, value], index) => {
                    const vector = vectors[index]
                    if (
                        this.texts.get(key) === value.text &&
                        vector !== undefined
                    ) {
                        this.vectors.set(key, vector)
                        if (value.persist) {
                            saved.push([
                                value.text.slice(
                                    0,
                                    profile.maxPassageCharacters
                                ),
                                vector,
                            ])
                        }
                    }
                })
                await this.cache?.put(saved)
            } catch (error) {
                this.diagnostic(
                    error instanceof Error ? error.message : 'Indexing deferred'
                )
                return
            }
        }
    }
    private async cached(
        batch: Array<[string, QueuedPassage]>
    ): Promise<Array<[string, QueuedPassage]>> {
        const misses: Array<[string, QueuedPassage]> = []
        for (const [key, value] of batch) {
            const vector = value.persist
                ? await this.cache?.get(
                      value.text.slice(0, profile.maxPassageCharacters)
                  )
                : undefined
            if (this.texts.get(key) !== value.text) {
                continue
            }
            if (vector === undefined) {
                misses.push([key, value])
            } else {
                this.vectors.set(key, vector)
            }
        }
        return misses
    }
    public async rank(
        query: string,
        allowed: readonly string[]
    ): Promise<Map<string, number>> {
        try {
            await this.idle()
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
                                      (sum, value, index) =>
                                          sum + value * (vector[index] ?? 0),
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
    public async idle(): Promise<void> {
        await this.processing
        await this.cache?.flush()
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
