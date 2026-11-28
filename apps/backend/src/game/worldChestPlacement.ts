import { containerBounds, FARM_SUPPLY_CHESTS } from '@my-game-ratata/contracts'

import type { WorldChest } from './chestInteraction'
import { createItemInstance } from './inventory'
import type { NavigationService } from './navigation'
import { overlaps } from './resourcePlacement'
import {
    generateChestContents,
    generateFarmSupplyContents,
} from './worldInventoryHelpers'

export function createWorldChests(
    navigation: NavigationService,
    locationId = navigation.grid.id,
    random: () => number = Math.random
): Map<string, WorldChest> {
    const chests = new Map<string, WorldChest>()
    const authoredContainers = navigation.grid.containers ?? []
    const farmChests = FARM_SUPPLY_CHESTS.filter(
        (chest) => chest.locationId === locationId
    )
    const occupied = [
        ...authoredContainers.map((container) => container.bounds),
        ...farmChests.map((chest) => containerBounds(chest.position)),
    ]
    const passageClearance = chestPassageClearanceCells(navigation)
    const isCellClear = (cell: number) =>
        navigation.grid.solid[cell] !== true && !passageClearance.has(cell)
    const large = navigation.grid.width >= 64 && navigation.grid.height >= 64
    const tiles = large
        ? [
              { x: 50, y: 43 },
              { x: 20, y: 20 },
              { x: 74, y: 20 },
              { x: 20, y: 60 },
              { x: 74, y: 60 },
          ]
        : [{ x: 6, y: 4 }]
    for (const [index, preferred] of tiles.entries()) {
        const tile = navigation.findWalkableTileNear(preferred, (candidate) => {
            const bounds = containerBounds(navigation.tileToWorld(candidate))
            return (
                navigation.cellsInBounds(bounds).every(isCellClear) &&
                !occupied.some((area) => overlaps(area, bounds)) &&
                navigation.walkableNeighbors(candidate).length > 0
            )
        })
        if (tile === undefined) {
            continue
        }
        const id = `chest_forest_${String(index + 1)}`
        const position = navigation.tileToWorld(tile)
        occupied.push(containerBounds(position))
        chests.set(id, {
            contents: generateChestContents(large && index === 0, random),
            id,
            opened: false,
            position,
        })
    }
    for (const definition of farmChests) {
        chests.set(definition.id, {
            contents: generateFarmSupplyContents(random),
            id: definition.id,
            position: { ...definition.position },
            opened: false,
        })
    }
    for (const definition of authoredContainers) {
        const { bounds, contents, ...metadata } = definition
        if (chests.has(definition.id)) {
            throw new Error(`Duplicate container: ${definition.id}`)
        }
        chests.set(definition.id, {
            ...metadata,
            bounds: { ...bounds },
            position: {
                x: bounds.x + bounds.width / 2,
                y: bounds.y + bounds.height / 2,
            },
            contents: contents.flatMap(({ itemId, quantity }) =>
                Array.from({ length: quantity }, () =>
                    createItemInstance(itemId)
                )
            ),
            opened: false,
        })
    }
    return chests
}

function chestPassageClearanceCells(
    navigation: NavigationService
): Set<number> {
    const { dungeonPassages = [], tileWidth, tileHeight } = navigation.grid
    const marginX = 3 * tileWidth
    const marginY = 3 * tileHeight
    return new Set(
        dungeonPassages.flatMap(({ position, arrival, triggerRadius }) => {
            const landing = navigation.worldToTile(arrival)
            const landingX = landing.x * tileWidth
            const landingY = landing.y * tileHeight
            const left =
                Math.min(position.x - triggerRadius, landingX) - marginX
            const right =
                Math.max(position.x + triggerRadius, landingX + tileWidth) +
                marginX
            const top = Math.min(position.y - triggerRadius, landingY) - marginY
            const bottom =
                Math.max(position.y + triggerRadius, landingY + tileHeight) +
                marginY
            return navigation.cellsInBounds({
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
            })
        })
    )
}
