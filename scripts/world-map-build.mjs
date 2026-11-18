import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORLD_LOCATION_DEFINITIONS } from '../contracts/src/world.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/frontend/public/game/map')
const destination = path.join(root, 'dist/backend/maps')
await fs.mkdir(destination, { recursive: true })
for (const id of [...WORLD_LOCATION_DEFINITIONS.map(({ id }) => id), 'map1']) {
    await fs.copyFile(
        path.join(source, `${id}.json`),
        path.join(destination, `${id}.json`)
    )
}
console.info(
    `Prepared ${WORLD_LOCATION_DEFINITIONS.length} authored map assets and the legacy test alias`
)
