import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createCharacterSheet, observeValue } from '../src/game/characterSheet'
import { observeCharacterCombat } from '../src/game/combatObservation'
import { createItemInstance } from '../src/game/inventory'
import { abilityHero } from './abilityTestHelpers'
import { observationFixture } from './combatObservationFixture'

describe('earned character knowledge', () => {
    it.each([
        [0, 0, 50],
        [49, 0, 50],
        [49.999, 0, 50],
        [50, 50, 100],
        [99, 50, 100],
        [100, 100, 150],
        [175.5, 150, 200],
    ])('places %s in the half-open range %s–%s', (value, lower, upper) => {
        expect(observeValue(value, 50)).toEqual({ kind: 'range', lower, upper })
        expect(observeValue(value, 50)).not.toHaveProperty('value')
    })

    it('keeps decimal probability boundaries stable and exact knowledge truthful', () => {
        expect(observeValue(0.3, 0.1)).toEqual({
            kind: 'range',
            lower: 0.3,
            upper: 0.4,
        })
        expect(observeValue(17.875, null)).toEqual({
            kind: 'exact',
            value: 17.875,
        })
    })

    it('refines own health without revealing other resource pools or foreign health', () => {
        const { observer, target, view } = observationFixture()
        observer.hp = 17.875
        observer.mana = 11.5
        observer.energy = 39.5
        target.hp = 7.25
        for (const [id, expected] of [
            ['life.hp1', { kind: 'range', lower: 0, upper: 25 }],
            ['life.hp2', { kind: 'range', lower: 10, upper: 20 }],
            ['life.hp3', { kind: 'range', lower: 15, upper: 20 }],
            ['life.hp4', { kind: 'exact', value: 17.875 }],
        ] as const) {
            observer.progression.constellations.opened.add(id)
            const own = observeCharacterCombat(
                observer.snapshot(1000),
                observer,
                view
            )
            expect(own.characterSheet?.health.current).toEqual(expected)
            expect(own.resources.mana.kind).toBe('percent')
            expect(own.resources.energy.kind).toBe('percent')
            const foreign = observeCharacterCombat(
                target.snapshot(1000),
                target,
                view
            )
            expect(foreign.health.kind).toBe('percent')
            expect(foreign).not.toHaveProperty('characterSheet')
            expect(foreign).not.toHaveProperty('stats')
            expect(foreign.progression).not.toHaveProperty('constellations')
        }
        expect(
            observeCharacterCombat(observer.snapshot(1000), observer, view)
                .health
        ).toEqual({
            kind: 'exact',
            current: observer.hp,
            max: observer.maxHp,
        })
        expect(observer.exactCombatNumbers).toBe(false)
    })

    it('reveals mana and energy independently after their own knowledge chains', () => {
        const { observer, view } = observationFixture()
        observer.progression.constellations.opened.add('magic.mana3')
        let own = observeCharacterCombat(
            observer.snapshot(1000),
            observer,
            view
        )
        expect(own.resources.mana.kind).toBe('exact')
        expect(own.resources.energy.kind).toBe('percent')
        expect(own.health.kind).toBe('percent')
        observer.progression.constellations.opened.add('life.energy3')
        own = observeCharacterCombat(observer.snapshot(1000), observer, view)
        expect(own.resources.energy.kind).toBe('exact')
        expect(own.health.kind).toBe('percent')
    })

    it('distinguishes species without mana from an empty refillable pool', () => {
        const actor = new GameCharacter({
            id: 'no-mana',
            nickname: 'No mana',
            archetype: 'skeleton',
            controllerKind: 'scripted',
            faction: 'monsters',
            spawnPosition: { x: 0, y: 0 },
        })
        const sheet = createCharacterSheet(actor, 16)
        expect(sheet.mana).toEqual({
            hasCapacity: false,
            current: { kind: 'exact', value: 0 },
            max: { kind: 'exact', value: 0 },
        })
    })
})

describe('character sheet privacy', () => {
    it('does not forward injected private sheets or earned divine perception to another viewer', () => {
        const { observer, target, view } = observationFixture()
        const raw = target.snapshot(1000)
        if (raw.progression === undefined) {
            throw new Error('Expected progression')
        }
        raw.progression = {
            ...raw.progression,
            deity: {
                ...raw.progression.deity,
                mood: 'benevolent',
                successChance: 0.8,
                hearthPrayerChances: {
                    purificationPerStep: 0.29,
                    resurrection: 0.8,
                },
            },
            otherDeities: [raw.progression.deity],
        }
        const foreign = observeCharacterCombat(
            { ...raw, characterSheet: createCharacterSheet(target, 16) },
            target,
            view
        )
        expect(foreign).not.toHaveProperty('characterSheet')
        expect(foreign).not.toHaveProperty('stats')
        expect(foreign.progression).not.toHaveProperty('otherDeities')
        expect(foreign.progression?.deity.mood).toBeNull()
        expect(foreign.progression?.deity.successChance).toBeNull()
        expect(foreign.progression?.deity).not.toHaveProperty(
            'hearthPrayerChances'
        )
        expect(raw.progression.deity.hearthPrayerChances).toEqual({
            purificationPerStep: 0.29,
            resurrection: 0.8,
        })
        expect(observer.exactCombatNumbers).toBe(false)
    })
})

it('shows the actual attack family critical chance and mastered spell power', () => {
    const actor = abilityHero('ranger')
    actor.equipment.weapon = createItemInstance('simple_sword')
    for (const id of [
        'blade.critical',
        'blade.insight3',
        'arrow.insight2',
        'magic.insight',
        'magic.fire_damage',
    ]) {
        actor.progression.constellations.opened.add(id)
    }
    actor.abilities.known.add('fireball')
    actor.progression.masteries.magic.level = 4
    const attacks = createCharacterSheet(actor, 16).attacks
    expect(
        attacks.find((attack) => attack.id === 'basic_attack')?.critChance
    ).toEqual({ kind: 'exact', value: actor.config.combat.critChance + 0.05 })
    expect(attacks.find((attack) => attack.id === 'shot')?.critChance).toEqual({
        kind: 'exact',
        value: actor.config.combat.critChance,
    })
    expect(attacks.find((attack) => attack.id === 'fireball')).toMatchObject({
        damage: {
            min: { kind: 'exact', value: 11 },
            max: { kind: 'exact', value: 44 },
        },
        critChance: { kind: 'exact', value: 0 },
    })
})

it('refines Blade attack knowledge at each rank without revealing Life resources', () => {
    const actor = abilityHero('ranger')
    actor.equipment.weapon = createItemInstance('simple_sword')
    actor.progression.constellations.opened.add('blade.critical')
    for (const [id, chanceWidth, timeWidth] of [
        ['blade.insight1', 0.02, 100],
        ['blade.insight2', 0.01, 50],
    ] as const) {
        actor.progression.constellations.opened.add(id)
        const sheet = createCharacterSheet(actor, 16)
        const attack = sheet.attacks.find(
            (entry) => entry.id === 'basic_attack'
        )
        expect(attack?.critChance.kind).toBe('range')
        expect(attack?.cooldownMs.kind).toBe('range')
        if (
            attack?.critChance.kind === 'range' &&
            attack.cooldownMs.kind === 'range'
        ) {
            expect(
                attack.critChance.upper - attack.critChance.lower
            ).toBeCloseTo(chanceWidth)
            expect(attack.cooldownMs.upper - attack.cooldownMs.lower).toBe(
                timeWidth
            )
        }
        expect(sheet.health.current.kind).toBe('range')
        expect(sheet.energy.current.kind).toBe('range')
    }
    actor.progression.constellations.opened.add('blade.insight3')
    const sheet = createCharacterSheet(actor, 16)
    expect(
        sheet.attacks.find((entry) => entry.id === 'basic_attack')?.critChance
    ).toEqual({
        kind: 'exact',
        value: actor.config.combat.critChance + 0.05,
    })
    expect(sheet.health.current.kind).toBe('range')
    expect(sheet.energy.current.kind).toBe('range')
})
