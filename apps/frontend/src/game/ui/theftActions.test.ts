import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { guardActions, theftActions } from './theftActions'

describe('theft context actions', () => {
    it('targets the nearest living online actor without inspecting anyone else’s inventory', () => {
        const player = characterFixture('self')
        const near = characterFixture('near', { position: { x: 18, y: 0 } })
        const far = characterFixture('far', { position: { x: 26, y: 0 } })
        const offline = characterFixture('offline', { tags: ['offline'], position: { x: 5, y: 0 } })
        Object.defineProperty(near, 'inventory', {
            get: () => {
                throw new Error('Private inventory read')
            },
        })
        const characters = [player, far, offline, near]
        const actions = theftActions(worldFixture(characters), player, characters)
        expect(actions).toHaveLength(1)
        expect(actions[0]?.command).toEqual({ type: 'steal', targetId: 'near' })
        expect(actions[0]?.disabled).toBe(false)
        expect(actions[0]?.label).not.toContain('food')
    })
    it('requires sneak, energy and both cooldowns rather than promising an available attempt', () => {
        const player = characterFixture('self')
        const target = characterFixture('npc', { position: { x: 20, y: 0 } })
        const state = worldFixture([player, target])
        player.movement!.mode = 'walking'
        expect(theftActions(state, player, state.characters)[0]?.disabled).toBe(true)
        player.movement!.mode = 'sneaking'
        player.resources.energy = 9
        expect(theftActions(state, player, state.characters)[0]?.disabled).toBe(true)
        player.resources.energy = 100
        player.theft!.cooldownMsLeft = 4000
        expect(theftActions(state, player, state.characters)[0]?.disabled).toBe(true)
        player.theft!.cooldownMsLeft = 0
        player.theft!.lastResult = {
            outcome: 'failed',
            targetId: 'npc',
            at: 90_000,
            text: 'Не вышло',
        }
        expect(theftActions(state, player, state.characters)[0]?.label).toContain('50 с')
        state.serverTime = 150_000
        expect(theftActions(state, player, state.characters)[0]?.disabled).toBe(false)
        target.position.x = 29
        expect(theftActions(state, player, state.characters)).toEqual([])
    })
    it('offers guards only for unexpired accusations received by this player', () => {
        const player = characterFixture('victim')
        player.theft!.accusations = [
            {
                thiefId: 'visible-thief',
                thiefName: 'Замеченный вор',
                expiresAt: 101_000,
                canCallGuards: true,
                reported: false,
            },
            {
                thiefId: 'called-thief',
                thiefName: 'Уже вызвали',
                expiresAt: 200_000,
                canCallGuards: false,
                reported: false,
            },
            {
                thiefId: 'old-thief',
                thiefName: 'Старая история',
                expiresAt: 99_000,
                canCallGuards: true,
                reported: false,
            },
        ]
        const actions = guardActions(worldFixture([player]), player)
        expect(actions.map((action) => action.command)).toEqual([
            { type: 'call_guards', targetId: 'visible-thief' },
        ])
    })
})
