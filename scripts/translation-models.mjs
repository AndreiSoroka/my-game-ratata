import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
export const modelRoot = resolve(
    process.env.GAME_TRANSLATION_MODELS ??
        resolve(
            directory,
            basename(directory) === 'backend'
                ? '../../.cache/ratata-translation'
                : '../.cache/ratata-translation'
        )
)
export const models = {
    en: {
        id: 'Xenova/opus-mt-en-ru',
        revision: 'e050376e960175e8ddc5cff85025dc8436cddd68',
        sample: 'Where is the city gate?',
    },
    ru: {
        id: 'Xenova/opus-mt-ru-en',
        revision: 'afe8c6c738ec81b6d033fd8f44f9678a639a7c67',
        sample: 'Где находится городской рынок?',
    },
}
export const manifestFile = 'ratata-manifest.json'
export const files = [
    'config.json',
    'generation_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx',
]

export async function fileDigest(path) {
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(path)) digest.update(chunk)
    return digest.digest('hex')
}
