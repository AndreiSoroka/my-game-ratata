import { expect, it } from 'vitest'

import { createWorldChests } from '../src/game/chestInteraction'
import { NavigationService } from '../src/game/navigation'

it.each([
    {
        name: 'moves a chest three tiles from a tower landing to the fourth tile',
        direction: 'down',
        position: { x: 104, y: 8 },
        arrival: { x: 104, y: 24 },
        triggerRadius: 7,
        neighbor: { x: 6, y: 5 },
        canPlace: true,
    },
    {
        name: 'protects the whole landing tile when arrival sits at its edge',
        direction: 'down',
        position: { x: 104, y: 8 },
        arrival: { x: 104, y: 16 },
        triggerRadius: 7,
        neighbor: { x: 6, y: 5 },
        canPlace: true,
    },
    {
        name: 'clears the third diagonal tile to the left of stairs leading up',
        direction: 'up',
        position: { x: 160, y: 136 },
        arrival: { x: 160, y: 152 },
        triggerRadius: 12,
        neighbor: { x: 5, y: 4 },
        canPlace: true,
    },
    {
        name: 'clears the third diagonal tile to the right of stairs leading down',
        direction: 'down',
        position: { x: 48, y: 136 },
        arrival: { x: 48, y: 120 },
        triggerRadius: 12,
        neighbor: { x: 7, y: 4 },
        canPlace: true,
    },
    {
        name: 'skips the generated chest when all walkable tiles are too close',
        direction: 'up',
        position: { x: 160, y: 136 },
        arrival: { x: 160, y: 152 },
        triggerRadius: 12,
        neighbor: { x: 7, y: 4 },
        canPlace: false,
    },
] as const)(
    '$name',
    ({ direction, position, arrival, triggerRadius, neighbor, canPlace }) => {
        const width = 20
        const height = 20
        const solid = Array<boolean>(width * height).fill(true)
        for (const { x, y } of [{ x: 6, y: 4 }, neighbor]) {
            solid[y * width + x] = false
        }
        const nav = new NavigationService({
            id: 'dungeon-chest-spawns',
            width,
            height,
            tileWidth: 16,
            tileHeight: 16,
            solid,
            solidLayerNames: [],
            dungeonPassages: [
                {
                    id: 'passage',
                    destinationLocationId: 'other-floor',
                    destinationPassageId: 'return',
                    direction,
                    position,
                    arrival,
                    triggerRadius,
                },
            ],
        })

        const chest = createWorldChests(nav, nav.grid.id, () => 0).get(
            'chest_forest_1'
        )

        expect(chest?.position).toEqual(
            canPlace ? nav.tileToWorld(neighbor) : undefined
        )
    }
)
