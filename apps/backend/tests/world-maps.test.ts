import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    CENTER_LOCATION_ID,
    FARM_PLOTS,
    GRID_SIZE,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAdventureResourceNodes } from '../src/game/adventureResources'
import { CompanionService } from '../src/game/companions'
import { loadNavigationService } from '../src/game/navigation'
import { findPath } from '../src/game/pathfinding'
import { createFriendlyGirl, playerSpawn } from '../src/game/spawns'
import { createSupportNpcs } from '../src/game/supportNpcs'
import { WorldInventory } from '../src/game/worldInventory'
import { createLocationEnemies } from '../src/game/worldSpawns'

const mapIds = WORLD_LOCATION_DEFINITIONS.map((location) => location.id)

afterEach(() => vi.unstubAllGlobals())

describe('explorable world maps', () => {
    it.each(mapIds)(
        '%s connects every spawn, chest and edge entrance',
        (id) => {
            vi.stubGlobal('Bun', { env: {} })
            const navigation = loadNavigationService(id)
            const start = navigation.worldToTile(playerSpawn(navigation, 1))
            const definition = WORLD_LOCATION_DEFINITIONS.find(
                (location) => location.id === id
            )
            if (definition === undefined) {
                throw new Error('Missing region location')
            }
            const npcs = [
                ...(id === CENTER_LOCATION_ID
                    ? [
                          createFriendlyGirl(navigation),
                          ...createSupportNpcs(
                              navigation,
                              new CompanionService()
                          ),
                      ]
                    : []),
                ...createLocationEnemies(navigation, definition),
            ]
            const chests = new WorldInventory(navigation)
                .snapshotChests()
                .filter((chest) => chest.kind !== 'barrel')
            const destinations = [
                ...[1, 2, 3, 4].map((index) =>
                    navigation.worldToTile(playerSpawn(navigation, index))
                ),
                ...npcs.map(({ character }) =>
                    navigation.worldToTile(character.position)
                ),
                ...chests.map((chest) =>
                    navigation.worldToTile(chest.position)
                ),
                ...FARM_PLOTS.filter((plot) => plot.locationId === id).map(
                    (plot) => navigation.worldToTile(plot.position)
                ),
                ...createAdventureResourceNodes()
                    .filter((node) => node.locationId === id)
                    .map((node) => navigation.worldToTile(node.position)),
                { x: 42, y: 45 },
                { x: 0, y: 40 },
                { x: 95, y: 40 },
                { x: 48, y: 0 },
                { x: 48, y: 79 },
            ]

            expect(navigation.grid.width).toBe(96)
            expect(navigation.grid.height).toBe(80)
            expect(chests).toHaveLength(5)
            expect(chests[0]?.itemCount).toBe(1)
            for (const target of destinations) {
                expect(
                    navigation.isSolidTile(target),
                    `${id}: ${JSON.stringify(target)}`
                ).toBe(false)
                expect(findPath(navigation.grid, start, target).at(-1)).toEqual(
                    target
                )
            }
            // Every point on an outer edge supports coordinate-preserving transitions.
            for (let x = 0; x < 96; x += 1) {
                expect(navigation.isSolidTile({ x, y: 0 })).toBe(false)
                expect(navigation.isSolidTile({ x, y: 79 })).toBe(false)
            }
            for (let y = 0; y < 80; y += 1) {
                expect(navigation.isSolidTile({ x: 0, y })).toBe(false)
                expect(navigation.isSolidTile({ x: 95, y })).toBe(false)
            }
        }
    )

    it('keeps all region terrain layouts distinct and the legacy map centered', () => {
        const root = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../frontend/public/game/map'
        )
        const maps = mapIds.map((id) =>
            fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
        )
        expect(new Set(maps).size).toBe(GRID_SIZE * GRID_SIZE)
        expect(fs.readFileSync(path.join(root, 'map1.json'), 'utf8')).toBe(
            maps[mapIds.indexOf(CENTER_LOCATION_ID)]
        )
    })
})
