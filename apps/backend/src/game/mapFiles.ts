import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Runtime assets, not saved worlds. Bundles carry authored maps beside index.js. */
export function resolveMapRoot(): string {
    const override = process.env['GAME_MAP_ROOT']
    if (override !== undefined && override.trim().length > 0) {
        return path.resolve(override)
    }
    const directory = path.dirname(fileURLToPath(import.meta.url))
    const bundled = path.join(directory, 'maps')
    if (fs.existsSync(path.join(bundled, 'map-2-2.json'))) {
        return bundled
    }
    return path.resolve(directory, '../../../../apps/frontend/public/game/map')
}
