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
        const node = readSource(object, locationId)
        if (ids.has(node.id)) {
            throw new Error(`Duplicate harvest source in ${locationId}`)
        }
        ids.add(node.id)
        return node
    })
}

type HarvestObject = NonNullable<
    HarvestMap['layers'][number]['objects']
>[number]
function readSource(
    object: HarvestObject,
    locationId: string
): AdventureResourceNode {
    const get = (name: string) =>
        object.properties?.find((property) => property.name === name)?.value
    const id = get('sourceId'),
        propId = get('propId'),
        capacity = get('capacity'),
        visual = get('visual')
    const treeSize = get('treeSize') ?? 'adult'
    validateSource(
        object,
        { id, propId, capacity, visual, treeSize },
        locationId
    )
    const bounds = {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
    }
    return {
        id: id as string,
        ...(typeof propId === 'string' ? { propId } : {}),
        locationId,
        source: object.type as NonNullable<AdventureResourceNode['source']>,
        kind: sourceMaterial(object.type),
        ...(object.type === 'tree'
            ? { treeSize: treeSize as 'adult' | 'small' }
            : {}),
        phase: 'ready',
        remaining: capacity as number,
        readyAt: 0,
        visual: visual as 'forest' | 'pine',
        ...treeProfileData(object.type, get('treeProfile')),
        position: {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height - 8,
        },
        bounds: { ...bounds },
        matureBounds: { ...bounds },
        ...(object.type === 'branches'
            ? {}
            : { collisionBounds: { ...bounds } }),
    }
}
function sourceMaterial(source: string): AdventureResourceNode['kind'] {
    return source === 'tree'
        ? 'wood'
        : source === 'stone'
          ? 'stone'
          : 'brushwood'
}
export function capacityFor(source: string, size: unknown): number {
    switch (source) {
        case 'tree':
            return size === 'small' ? 2 : 8
        case 'bush':
            return 2
        case 'branches':
            return 1
        default:
            return 8
    }
}
function validateSource(
    object: HarvestObject,
    values: Record<string, unknown>,
    locationId: string
): void {
    const { id, propId, capacity, visual, treeSize } = values
    if (
        !['tree', 'stone', 'bush', 'branches'].includes(object.type) ||
        typeof id !== 'string' ||
        id.length === 0 ||
        !validBounds(object) ||
        !validSourceDetails(object.type, propId, treeSize) ||
        capacity !== capacityFor(object.type, treeSize) ||
        (visual !== 'forest' && visual !== 'pine')
    ) {
        throw new Error(`Invalid harvest source in ${locationId}`)
    }
}
function validSourceDetails(
    source: string,
    propId: unknown,
    treeSize: unknown
): boolean {
    return (
        (source === 'branches' || typeof propId === 'string') &&
        (source !== 'tree' || treeSize === 'adult' || treeSize === 'small')
    )
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
