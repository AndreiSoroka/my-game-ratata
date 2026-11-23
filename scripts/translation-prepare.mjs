import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import {
    fileDigest,
    files,
    manifestFile,
    modelRoot,
    models,
} from './translation-models.mjs'

for (const { id, revision } of Object.values(models)) {
    const hashes = {}
    for (const file of files) {
        const response = await fetch(
            `https://huggingface.co/${id}/resolve/${revision}/${file}`,
            { signal: AbortSignal.timeout(120_000) }
        )
        if (!response.ok || response.body === null) {
            throw new Error(
                `Could not download ${id}/${file}: ${response.status}`
            )
        }
        const target = join(modelRoot, id, file)
        const partial = `${target}.${process.pid}.partial`
        await mkdir(dirname(target), { recursive: true })
        try {
            await pipeline(
                Readable.fromWeb(response.body),
                createWriteStream(partial)
            )
            hashes[file] = await fileDigest(partial)
            await rename(partial, target)
        } finally {
            await rm(partial, { force: true })
        }
        console.info(`Prepared ${id}/${file}`)
    }
    const manifest = join(modelRoot, id, manifestFile)
    const partial = `${manifest}.${process.pid}.partial`
    await writeFile(partial, JSON.stringify({ revision, files: hashes }))
    await rename(partial, manifest)
}
