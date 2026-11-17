import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const modelId = 'Xenova/multilingual-e5-small'
export const modelRevision = '761b726'
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
export const modelFiles = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'onnx/model_quantized.onnx',
]
