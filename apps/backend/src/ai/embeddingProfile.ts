import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import profile from '../../../../scripts/knowledge-profile.json'
import {
    PersistentVectorCache,
    type VectorCacheProfile,
} from './persistentVectorCache'

/** No model inference/import is needed to identify compatible saved vectors. */
export function embeddingCacheProfile(manifest: unknown): VectorCacheProfile {
    if (
        !record(manifest) ||
        manifest['modelId'] !== profile.modelId ||
        manifest['modelRevision'] !== profile.modelRevision ||
        !record(manifest['files'])
    ) {
        throw new Error('Invalid embedding model manifest')
    }
    const hashes = profile.modelFiles.map((file) => {
        const hash = (manifest['files'] as Record<string, unknown>)[file]
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)) {
            throw new Error('Invalid embedding model checksum')
        }
        return [file, hash]
    })
    return {
        fingerprint: createHash('sha256')
            .update(JSON.stringify({ profile, hashes }))
            .digest('hex'),
        dimensions: profile.dimensions,
    }
}

export function localVectorCache(
    diagnostic: (message: string) => void
): PersistentVectorCache | undefined {
    if (
        process.env['VITEST'] === 'true' &&
        process.env['GAME_EMBEDDING_TEST_REAL'] !== '1'
    ) {
        return undefined
    }
    const moduleDirectory = dirname(fileURLToPath(import.meta.url))
    const root =
        basename(moduleDirectory) === 'backend'
            ? resolve(moduleDirectory, '../..')
            : resolve(moduleDirectory, '../../../..')
    const modelRoot =
        process.env['GAME_EMBEDDING_MODELS'] ??
        resolve(root, '.cache/ratata-models')
    try {
        const manifest: unknown = JSON.parse(
            readFileSync(
                resolve(modelRoot, profile.modelId, 'ratata-manifest.json'),
                'utf8'
            )
        )
        return new PersistentVectorCache(
            process.env['GAME_EMBEDDING_CACHE'] ??
                resolve(root, '.cache/ratata-knowledge/vectors.json'),
            embeddingCacheProfile(manifest),
            diagnostic
        )
    } catch {
        // The embedding provider reports missing/unprepared models and keeps lexical fallback.
        return undefined
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
