import {
    type CreatureType,
    creatureTypes,
    isCreatureType,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { parseClientMessage } from '../src/game/messages'

describe('shared creature types', () => {
    it('accepts every authored 5e category, rejecting unknown data', () => {
        expect(creatureTypes).toHaveLength(14)
        for (const creatureType of creatureTypes) {
            const actor = make({ creatureType })
            expect(actor.snapshot(100).creatureType).toBe(creatureType)
        }
        expect(isCreatureType('robot')).toBe(false)
        expect(() => make({ creatureType: 'robot' as CreatureType })).toThrow(
            'Unknown creature type'
        )
    })
    it('maps archetypes without deriving nature from presentation or control', () => {
        expect(
            make({
                archetype: 'skeleton',
                controllerKind: 'network_player',
                visualId: 'player',
            }).creatureType
        ).toBe('undead')
        expect(make({ archetype: 'slime' }).creatureType).toBe('ooze')
        const human = make({ visualId: 'zombie', heroClass: 'cleric' })
        expect(human.creatureType).toBe('humanoid')
        expect(human.soul.canSpeak).toBe(true)
        expect(
            make({ creatureType: 'undead', visualId: 'zombie_mage' })
                .creatureType
        ).toBe('undead')
    })
    it('does not accept client-assigned creature categories', () => {
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'join',
                    nickname: 'X',
                    creatureType: 'undead',
                })
            ).message
        ).toBeUndefined()
    })
})

function make(
    options: Partial<ConstructorParameters<typeof GameCharacter>[0]> = {}
) {
    return new GameCharacter({
        archetype: 'human',
        controllerKind: 'scripted',
        id: 'typed',
        nickname: 'Typed',
        spawnPosition: { x: 40, y: 40 },
        ...options,
    })
}
