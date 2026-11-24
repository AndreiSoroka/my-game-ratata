import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { GameCharacter } from '../src/game/character'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { grantRetaliation } from '../src/game/crimeRelations'
import { practiceResourceMissing } from '../src/game/resourcePractice'
import { castSpell } from '../src/game/spellCasting'
import { createTrainingTarget } from '../src/game/trainingTargets'
import {
    abilityContext,
    abilityHero,
    resolveTestSpells,
} from './abilityTestHelpers'

const spells = ['spark', 'fireball'] as const
type TestSpell = (typeof spells)[number]

describe('resource provenance of barrier impacts', () => {
    it.each(spells)(
        'credits the paid %s cost after fully absorbed hostile impact without granting HP mastery',
        (spell) => {
            const { actor, target } = encounter('hostile')
            const beforeHp = target.hp
            const events = cast(actor, target, spell)
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'absorb', targetId: target.id })
            )
            expect(target.hp).toBe(beforeHp)
            expect(target.mana).toBeLessThan(100)
            expect(practiceResourceMissing(actor, 'mana')).toBe(
                spell === 'spark' ? 6 : 15
            )
            expect(practiceResourceMissing(actor, 'energy')).toBe(
                spell === 'spark' ? 5 : 0
            )
            expect(actor.progression.masteries.magic.experience).toBe(0n)
        }
    )

    it.each(spells)(
        'keeps %s costs uncredited for a same-faction barrier even with lawful retaliation',
        (spell) => {
            const { actor, target } = encounter('friendly')
            grantRetaliation(actor, target, 5000)
            const events = cast(actor, target, spell)
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'absorb', targetId: target.id })
            )
            expect(target.mana).toBeLessThan(100)
            expect(practiceResourceMissing(actor, 'mana')).toBe(0)
            expect(practiceResourceMissing(actor, 'energy')).toBe(0)
        }
    )

    it.each(spells)(
        'never turns %s measurements on a training dummy into useful resource debt',
        (spell) => {
            const { actor, target } = encounter('dummy')
            const beforeHp = target.hp
            const events = cast(actor, target, spell)
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'damage', targetId: target.id })
            )
            expect(events.some((event) => event.kind === 'absorb')).toBe(false)
            expect(target.hp).toBe(beforeHp)
            expect(target.mana).toBe(100)
            expect(practiceResourceMissing(actor, 'mana')).toBe(0)
            expect(practiceResourceMissing(actor, 'energy')).toBe(0)
        }
    )
})

describe('training dummy authority', () => {
    it('cannot attack through the shared boundary to confirm a defender barrier receipt', () => {
        const { actor, target: dummy } = encounter('dummy')
        const context = abilityContext([actor, dummy], 1000)
        handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId: 'barrier' },
            context
        )
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
        const attack = {
            actor: dummy,
            targets: [actor],
            targetId: actor.id,
            tileSize: 16,
            now: 1100,
            respawnDelayMsFor: () => 15000,
            navigation: context.navigation,
        }
        expect(attemptAttack(attack)).toEqual([])
        expect(resolvePendingAttackHit({ ...attack, now: 2000 })).toEqual([])
        expect(actor.abilities.barrier?.expiresAt).toBe(6000)
        expect(actor.mana).toBe(66)
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    })
})

function encounter(kind: 'hostile' | 'friendly' | 'dummy') {
    const actor = abilityHero('arcanist')
    actor.abilities.known.add('fireball')
    const target =
        kind === 'dummy'
            ? createTrainingTarget({
                  id: `resource-barrier-${actor.id}`,
                  areaId: 'test:yard',
                  locationId: actor.locationId,
                  position: { x: 100, y: 132 },
                  visualId: 'training_dummy',
              })
            : abilityHero('vanguard', 'undead')
    target.position = { x: 100, y: 132 }
    if (kind === 'hostile') {
        Object.assign(target, { faction: 'monsters' })
    }
    target.mana = 100
    target.abilities.barrier = {
        expiresAt: 10000,
        practiced: false,
    }
    return { actor, target }
}

function cast(actor: GameCharacter, target: GameCharacter, spell: TestSpell) {
    const context = abilityContext([actor, target], 1000, () => 0.5)
    if (spell === 'fireball') {
        target.position.y = 210
        expect(
            castSpell(
                actor,
                {
                    type: 'cast_spell',
                    skillId: 'fireball',
                    targetId: target.id,
                },
                context
            )
        ).toHaveLength(1)
        return resolveTestSpells(actor, context)
    }
    const attack = {
        actor,
        targets: [target],
        targetId: target.id,
        tileSize: 16,
        now: 1000,
        respawnDelayMsFor: () => 15000,
        navigation: context.navigation,
        random: () => 0.5,
    }
    expect(attemptAbilityAttack(attack, 'spark')).toHaveLength(1)
    expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    return resolvePendingAttackHit({
        ...attack,
        now: attack.now + ABILITY_DEFINITIONS.spark.windupMs,
    })
}
