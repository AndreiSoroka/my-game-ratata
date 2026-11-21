import type { WorldLocation } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { justiceActions } from './justiceActions'

const city: WorldLocation = {
    id: 'map-2-2',
    name: 'Новогород',
    column: 2,
    row: 2,
    columns: 5,
    rows: 5,
    dangerLevel: 0,
    biome: 'city',
    regionName: 'Земли Новогорода',
    map: {
        asset: { url: '/game/map/map1.json', revision: 'fixture' },
        id: 'map-2-2',
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        worldWidth: 1536,
        worldHeight: 1280,
        solidLayerNames: [],
    },
}

describe('city justice actions', () => {
    it('requires speaking, a nearby living guard, and private unsubmitted proof in the city', () => {
        const player = characterFixture('victim', {
            soul: {
                canSpeak: true,
                controlSource: 'human',
                kind: 'spark',
            },
        })
        player.theft!.accusations = [
            {
                thiefId: 'thief',
                thiefName: 'Ловкач',
                expiresAt: 400_000,
                canCallGuards: false,
                reported: false,
            },
            {
                thiefId: 'reported',
                thiefName: 'Старый',
                expiresAt: 400_000,
                canCallGuards: false,
                reported: true,
            },
        ]
        const guard = characterFixture('guard', { tags: ['guard'], position: { x: 64, y: 0 } })
        const state = { ...worldFixture([player, guard]), location: { ...city } }
        expect(
            justiceActions(state, player, state.characters).map((action) => action.command)
        ).toEqual([{ type: 'report_theft', targetId: 'thief' }])
        guard.position.x = 65
        expect(justiceActions(state, player, state.characters)).toEqual([])
        guard.position.x = 64
        state.location.biome = 'outskirts'
        expect(justiceActions(state, player, state.characters)).toEqual([])
        state.location.biome = 'city'
        player.soul!.canSpeak = false
        expect(justiceActions(state, player, state.characters)).toEqual([])
        player.soul!.canSpeak = true
        state.serverTime = 400_000
        expect(justiceActions(state, player, state.characters)).toEqual([])
    })
    it('offers paid absolution only while blacklisted and near an actual cleric service', () => {
        const player = characterFixture('thief')
        player.theft!.blacklisted = true
        const cleric = characterFixture('cleric', { tags: ['cleric'], position: { x: 48, y: 0 } })
        const state = { ...worldFixture([player, cleric]), adventure: adventureFixture(29) }
        const actions = () => justiceActions(state, player, state.characters)
        expect(actions()[0]?.disabled).toBe(true)
        expect(actions()[0]?.label).toContain('30 золотых')
        state.adventure.gold = 30
        expect(actions()[0]?.disabled).toBe(false)
        expect(actions()[0]?.command).toEqual({ type: 'absolve', targetId: 'cleric' })
        cleric.alive = false
        expect(actions()).toEqual([])
        cleric.alive = true
        player.theft!.blacklisted = false
        expect(actions()).toEqual([])
    })
})
