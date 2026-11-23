import {
    getWorldLocationDefinition,
    GRID_SIZE,
    REGION_NAME,
    WESTERN_RUINS_LOCATION_ID,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { generateWorldMap } from '../../../scripts/generate-map.mjs'
import { canTargetByFaction } from '../src/game/factions'
import { NavigationService } from '../src/game/navigation'
import { buildGrid, type TiledMap } from '../src/game/navigationGrid'
import { spawnNecromancer } from '../src/game/necromancerSpawn'
import { createSkeleton, createSlime } from '../src/game/spawns'
import { WorldInventory } from '../src/game/worldInventory'

it('generates one reachable Ash refuge in each corner using deterministic world seeds', () => {
    const definition = getWorldLocationDefinition(WESTERN_RUINS_LOCATION_ID)
    if (definition === undefined) {
        throw new Error('Missing Western Ruins location')
    }
    const generate = (seed: string) => {
        const map = generateWorldMap(definition, {
            ashRefugeSeed: seed,
        }) as TiledMap
        const navigation = new NavigationService(buildGrid(definition.id, map))
        const inventory = new WorldInventory(navigation, definition.id)
        const location = {
            description: {
                ...definition,
                columns: GRID_SIZE,
                rows: GRID_SIZE,
                regionName: REGION_NAME,
                map: navigation.summary,
            },
            inventory,
            navigation,
        }
        const spawn = spawnNecromancer(location)
        if (spawn === undefined) {
            throw new Error('Missing Savva')
        }
        return { spawn, navigation }
    }
    const corners = new Set<string>()
    for (const seed of ['ruins-a', 'ruins-b', 'ruins-c', 'ruins-d']) {
        const { spawn, navigation } = generate(seed)
        const savva = spawn.character
        const { x, y } = navigation.worldToTile(savva.position)
        corners.add(`${String(x)},${String(y)}`)
        expect(
            navigation.findPathWorld({ x: 1512, y: 648 }, savva.position).at(-1)
        ).toEqual(savva.position)
        expect(generate(seed).spawn.character.position).toEqual(savva.position)
        expect(savva.progression.masteries.prayer_grave.level).toBe(5)
        expect(savva.maxHp).toBe(100)
        expect(savva.hp).toBe(savva.maxHp)
        expect(savva.abilities.known).toContain('ash_raise')
        const skeleton = createSkeleton(navigation).character
        const slime = createSlime(navigation).character
        expect(canTargetByFaction(savva, skeleton)).toBe(false)
        expect(canTargetByFaction(skeleton, savva)).toBe(false)
        expect(canTargetByFaction(savva, slime)).toBe(true)
        expect(canTargetByFaction(slime, savva)).toBe(true)
        expect(canTargetByFaction(skeleton, slime)).toBe(false)
    }
    expect(corners).toEqual(new Set(['20,23', '74,23', '20,57', '74,57']))
})
