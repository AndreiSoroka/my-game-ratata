import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import profile from './knowledge-profile.json' with { type: 'json' }

export const modelId = profile.modelId
export const modelRevision = profile.modelRevision
export const maxPassageTokens = profile.maxPassageTokens
export { profile }
const directory = dirname(fileURLToPath(import.meta.url))
export const modelRoot = resolve(
    process.env.GAME_EMBEDDING_MODELS ??
        resolve(
            directory,
            basename(directory) === 'backend'
                ? '../../.cache/ratata-models'
                : '../.cache/ratata-models'
        )
)
export const modelFiles = profile.modelFiles
