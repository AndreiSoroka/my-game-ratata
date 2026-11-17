import { createHash } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
    modelFiles,
    modelId,
    modelRevision,
    modelRoot,
} from './knowledge-model.mjs'

const files = {}
for (const file of modelFiles) {
    const response = await fetch(
        `https://huggingface.co/${modelId}/resolve/${modelRevision}/${file}`
    )
    if (!response.ok)
        throw new Error(
            `Model preparation failed for ${file}: ${response.status}`
        )
    const data = Buffer.from(await response.arrayBuffer())
    const target = join(modelRoot, modelId, file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(`${target}.partial`, data)
    await rename(`${target}.partial`, target)
    files[file] = createHash('sha256').update(data).digest('hex')
    console.info(`Prepared ${file} (${data.length} bytes)`)
}
await writeFile(
    join(modelRoot, modelId, 'ratata-manifest.json'),
    JSON.stringify({ modelId, modelRevision, files }, null, 2)
)
console.info(
    'Local knowledge model prepared. Runtime inference needs no network.'
)
