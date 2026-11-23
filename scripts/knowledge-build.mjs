import { execFileSync } from 'node:child_process'
import { copyFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const compiled = execFileSync(
    'bun',
    [
        fileURLToPath(new URL('knowledge-check.ts', import.meta.url)),
        '--compiled',
    ],
    { encoding: 'utf8' }
)
await writeFile(
    new URL('../dist/backend/knowledge.json', import.meta.url),
    compiled
)
for (const name of [
    'knowledge-model.mjs',
    'knowledge-embeddings.mjs',
    'knowledge-profile.json',
    'speech-translation-worker.mjs',
    'translation-models.mjs',
])
    await copyFile(
        new URL(name, import.meta.url),
        new URL(`../dist/backend/${name}`, import.meta.url)
    )

// Clean the former multi-file layout so a deployment cannot retain stale articles.
await rm(new URL('../dist/backend/knowledge', import.meta.url), {
    recursive: true,
    force: true,
})
