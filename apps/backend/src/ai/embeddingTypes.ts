import type { PersistentVectorCache } from './persistentVectorCache'

export interface EmbeddingProvider {
    embed(texts: string[], query?: boolean): Promise<number[][]>
    persistentCache?(): PersistentVectorCache | undefined
    stop?(): void
}
