import { copyFile } from 'node:fs/promises'

for (const name of ['knowledge-model.mjs', 'knowledge-embeddings.mjs'])
    await copyFile(
        new URL(name, import.meta.url),
        new URL(`../dist/backend/${name}`, import.meta.url)
    )
