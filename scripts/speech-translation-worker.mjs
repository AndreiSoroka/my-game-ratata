import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
    fileDigest,
    files,
    manifestFile,
    modelRoot,
    models,
} from './translation-models.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const packageBase = new URL(
    basename(directory) === 'backend'
        ? '../../apps/backend/package.json'
        : '../apps/backend/package.json',
    import.meta.url
)
const require = createRequire(packageBase)
const { env, pipeline } = await import(
    pathToFileURL(require.resolve('@huggingface/transformers')).href
)
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = `${modelRoot}/`

const translators = new Map()
for (const [language, model] of Object.entries(models)) {
    const root = join(modelRoot, model.id)
    const manifest = JSON.parse(
        await readFile(join(root, manifestFile), 'utf8')
    )
    if (manifest.revision !== model.revision)
        throw new Error('Unexpected model revision')
    for (const file of files) {
        if ((await fileDigest(join(root, file))) !== manifest.files[file]) {
            throw new Error(
                `Translation model file failed integrity check: ${file}`
            )
        }
    }
    const translator = await pipeline('translation', model.id, {
        dtype: 'q8',
        device: 'cpu',
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    })
    await translate(translator, model.sample)
    translators.set(language, translator)
}

async function translate(translator, text) {
    const [result] = await translator(text, {
        num_beams: 1,
        max_new_tokens: 192,
        do_sample: false,
    })
    return result?.translation_text?.trim()
}

function respond(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`)
}
respond({ ready: true })
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of input) {
    let id
    try {
        const request = JSON.parse(line)
        id = request.id
        const translator = translators.get(request.from)
        if (
            !Number.isSafeInteger(id) ||
            translator === undefined ||
            typeof request.text !== 'string' ||
            request.text.length === 0 ||
            request.text.length > 400
        ) {
            respond({ id })
            continue
        }
        respond({ id, text: await translate(translator, request.text) })
    } catch {
        respond({ id })
    }
}
await Promise.all(
    [...translators.values()].map((translator) => translator.dispose())
)
