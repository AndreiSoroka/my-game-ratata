import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'

import {
    atomicVectorCacheWrite,
    type CacheLockOptions,
    code,
    withVectorCacheLock,
} from './vectorCacheFile'

export interface VectorCacheProfile {
    fingerprint: string
    dimensions: number
}

/** Only content hashes and vectors are saved, never source texts or player queries. */
export class PersistentVectorCache {
    private readonly loaded: Promise<void>
    private entries = new Map<string, number[]>()
    private writes = Promise.resolve()
    private readonly reported = new Set<string>()
    public constructor(
        public readonly path: string,
        public readonly profile: VectorCacheProfile,
        private readonly diagnostic: (message: string) => void = () =>
            undefined,
        private readonly lockOptions: CacheLockOptions = {}
    ) {
        this.loaded = this.read().then((entries) => {
            this.entries = entries
        })
    }
    public async get(text: string): Promise<number[] | undefined> {
        await this.loaded
        return this.entries.get(this.key(text))?.slice()
    }
    public async put(
        values: ReadonlyArray<readonly [string, readonly number[]]>
    ): Promise<void> {
        await this.loaded
        const incoming = new Map(
            values
                .filter(([, vector]) => this.validVector(vector))
                .map(([text, vector]) => [this.key(text), [...vector]])
        )
        if (incoming.size === 0) {
            return
        }
        for (const [key, vector] of incoming) {
            this.entries.set(key, vector)
        }
        this.writes = this.writes
            .then(() => this.persist(incoming))
            .catch(() =>
                this.report(
                    'Vector cache could not be saved; in-memory search remains available'
                )
            )
        await this.writes
    }
    public async flush(): Promise<void> {
        await this.loaded
        await this.writes
    }
    private key(text: string): string {
        return createHash('sha256')
            .update(this.profile.fingerprint)
            .update('\0')
            .update(text)
            .digest('hex')
    }
    private validVector(value: unknown): value is readonly number[] {
        return (
            Array.isArray(value) &&
            value.length === this.profile.dimensions &&
            value.every(
                (number) =>
                    typeof number === 'number' && Number.isFinite(number)
            )
        )
    }
    private async read(): Promise<Map<string, number[]>> {
        try {
            if ((await stat(this.path)).size > 64 * 1024 * 1024) {
                throw new Error('Oversized vector cache')
            }
            const parsed: unknown = JSON.parse(
                await readFile(this.path, 'utf8')
            )
            if (
                !record(parsed) ||
                parsed['schemaVersion'] !== 1 ||
                parsed['profile'] !== this.profile.fingerprint ||
                parsed['dimensions'] !== this.profile.dimensions ||
                !record(parsed['vectors'])
            ) {
                throw new Error('Incompatible vector cache')
            }
            const entries = Object.entries(parsed['vectors'])
            if (
                entries.length > 8192 ||
                entries.some(
                    ([key, value]) =>
                        !/^[a-f0-9]{64}$/u.test(key) || !this.validVector(value)
                )
            ) {
                throw new Error('Invalid cached vectors')
            }
            return new Map(entries as Array<[string, number[]]>)
        } catch (error) {
            if (code(error) !== 'ENOENT') {
                this.report(
                    'Vector cache is unavailable or incompatible; vectors will be rebuilt'
                )
            }
            return new Map()
        }
    }
    private async persist(
        incoming: ReadonlyMap<string, number[]>
    ): Promise<void> {
        await withVectorCacheLock(
            this.path,
            async () => {
                const merged = await this.read()
                for (const [key, vector] of this.entries) {
                    merged.set(key, vector)
                }
                for (const [key, vector] of incoming) {
                    merged.set(key, vector)
                }
                while (merged.size > 8192) {
                    const oldest = merged.keys().next().value
                    if (oldest !== undefined) {
                        merged.delete(oldest)
                    }
                }
                await atomicVectorCacheWrite(
                    this.path,
                    JSON.stringify({
                        schemaVersion: 1,
                        profile: this.profile.fingerprint,
                        dimensions: this.profile.dimensions,
                        vectors: Object.fromEntries(merged),
                    })
                )
                this.entries = merged
            },
            this.lockOptions
        )
    }
    private report(message: string): void {
        if (!this.reported.has(message)) {
            this.reported.add(message)
            this.diagnostic(message)
        }
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
