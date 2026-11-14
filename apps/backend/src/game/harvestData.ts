import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    type AdventureResourceNode,
    WORLD_LOCATION_DEFINITIONS,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

interface HarvestMap {
    layers: Array<{
        name: string
        objects?: Array<
            WorldObjectBounds & {
                type: string
                properties?: Array<{ name: string; value: unknown }>
            }
        >
    }>
}

const sourceCache = new Map<string, AdventureResourceNode[]>()

export function loadHarvestSources(): AdventureResourceNode[] {
    const root =
        process.env['GAME_MAP_ROOT'] ??
        path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../../../apps/frontend/public/game/map'
        )
    const cached = sourceCache.get(root)
    if (cached !== undefined) {
        return cached
    }
    const nodes = WORLD_LOCATION_DEFINITIONS.flatMap(({ id }) =>
        readHarvestSources(
            JSON.parse(
                fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
            ) as HarvestMap,
            id
        )
    )
    sourceCache.set(root, nodes)
    return nodes
}

export function readHarvestSources(
    map: HarvestMap,
    locationId: string
): AdventureResourceNode[] {
    const ids = new Set<string>()
    return (
        map.layers.find((layer) => layer.name === 'Harvest sources')?.objects ??
        []
    ).map((object) => {
        const get = (name: string) =>
            object.properties?.find((property) => property.name === name)?.value
        const id = get('sourceId')
        const propId = get('propId')
        const capacity = get('capacity')
        const visual = get('visual')
        const profile = treeProfileData(object.type, get('treeProfile'))
        if (
            (object.type !== 'tree' && object.type !== 'stone') ||
            typeof id !== 'string' ||
            id.length === 0 ||
            ids.has(id) ||
            typeof propId !== 'string' ||
            !validBounds(object) ||
            capacity !== 8 ||
            (visual !== 'forest' && visual !== 'pine')
        ) {
            throw new Error(`Invalid harvest source in ${locationId}`)
        }
        ids.add(id)
        const bounds = {
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
        }
        return {
            id,
            propId,
            locationId,
            source: object.type,
            kind: object.type === 'tree' ? 'wood' : 'stone',
            phase: 'ready',
            remaining: capacity,
            readyAt: 0,
            visual,
            ...profile,
            position: {
                x: bounds.x + bounds.width / 2,
                y: bounds.y + bounds.height - 8,
            },
            bounds: { ...bounds },
            matureBounds: { ...bounds },
            collisionBounds: { ...bounds },
        }
    })
}

function treeProfileData(
    source: string,
    profile: unknown
): Pick<AdventureResourceNode, 'treeProfile'> {
    if (source !== 'tree') {
        return {}
    }
    if (profile !== 'forest' && profile !== 'apple' && profile !== 'pine') {
        throw new Error('Invalid tree profile')
    }
    return { treeProfile: profile }
}

function validBounds(bounds: WorldObjectBounds): boolean {
    return (
        [bounds.x, bounds.y, bounds.width, bounds.height].every(
            Number.isFinite
        ) &&
        bounds.width > 0 &&
        bounds.height > 0
    )
}
