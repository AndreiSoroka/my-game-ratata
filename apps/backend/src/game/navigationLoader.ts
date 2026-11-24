import fs from 'node:fs'
import path from 'node:path'

import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { resolveMapRoot } from './mapFiles'
import { NavigationService } from './navigation'
import { buildGrid, type TiledMap } from './navigationGrid'

export function loadNavigationService(
    mapId: string = CENTER_LOCATION_ID
): NavigationService {
    const mapRoot = resolveMapRoot()
    const raw = fs.readFileSync(path.join(mapRoot, `${mapId}.json`), 'utf-8')
    const map = JSON.parse(raw) as TiledMap

    return new NavigationService(buildGrid(mapId, map))
}
