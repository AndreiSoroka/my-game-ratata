import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'

import {
    modelFiles,
    modelId,
    modelRevision,
    modelRoot,
    maxPassageTokens,
    profile,
} from './knowledge-model.mjs'

if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Local embeddings require Node 24 or newer')
const manifest = JSON.parse(
    await readFile(join(modelRoot, modelId, 'ratata-manifest.json'), 'utf8')
)
if (manifest.modelId !== modelId || manifest.modelRevision !== modelRevision)
    throw new Error(
        'Local model revision mismatch; run bun run knowledge:prepare'
    )
for (const file of modelFiles) {
    const hash = createHash('sha256')
        .update(await readFile(join(modelRoot, modelId, file)))
        .digest('hex')
    if (manifest.files[file] !== hash)
        throw new Error(`Local model integrity check failed: ${file}`)
}
const workerDirectory = dirname(fileURLToPath(import.meta.url))
const packageBase = new URL(
    basename(workerDirectory) === 'backend'
        ? '../../apps/backend/package.json'
        : '../apps/backend/package.json',
    import.meta.url
)
const require = createRequire(packageBase)
const { env, pipeline, mean_pooling } = await import(
    pathToFileURL(require.resolve('@huggingface/transformers')).href
)
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = `${modelRoot}/`
const extractor = await pipeline('feature-extraction', modelId, {
    dtype: profile.dtype,
    device: profile.device,
})
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of input) {
    let request
    try {
        request = JSON.parse(line)
        if (
            !Array.isArray(request.texts) ||
            (request.op !== undefined && request.op !== 'tokenize') ||
            request.texts.length > 32 ||
            request.texts.some(
                (text) => typeof text !== 'string' || text.length > 8000
            )
        )
            throw new Error('Invalid embedding input')
        const prefix = request.query
            ? profile.queryPrefix
            : profile.passagePrefix
        const texts = request.texts.map((text) => `${prefix}${text}`)
        if (request.op === 'tokenize') {
            const encoded = extractor.tokenizer(texts, {
                padding: false,
                truncation: false,
                return_tensor: false,
            })
            process.stdout.write(
                `${JSON.stringify({ id: request.id, tokenCounts: encoded.input_ids.map((ids) => ids.length) })}\n`
            )
            continue
        }
        // The pipeline ignores max_length options; tokenize explicitly so the
        // worker's documented budget applies to the actual model input.
        const inputs = extractor.tokenizer(texts, {
            padding: profile.padding,
            truncation: profile.truncation,
            max_length: maxPassageTokens,
        })
        const outputs = await extractor.model(inputs)
        const hidden =
            outputs.last_hidden_state ??
            outputs.logits ??
            outputs.token_embeddings
        const pooled = mean_pooling(hidden, inputs.attention_mask)
        const output = profile.normalize ? pooled.normalize(2, -1) : pooled
        process.stdout.write(
            `${JSON.stringify({ id: request.id, vectors: output.tolist() })}\n`
        )
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({ id: request?.id, error: String(error.message ?? error) })}\n`
        )
    }
}
