import { describe, expect, it } from 'vitest'

import { snapshotAbilities } from '../src/game/abilityState'
import { snapshotAbilityUsage } from '../src/game/abilityUsage'
import { attemptAbilityAttack } from '../src/game/combat'
import { observeCharacterCombat } from '../src/game/combatObservation'
import { NavigationService } from '../src/game/navigation'
import { abilityContext, abilityHero } from './abilityTestHelpers'

describe('public effective ability usage', () => {
    it('mirrors actual discounted costs, focused duration and authored tile range without damage knowledge', () => {
        const actor = trainedActor()
        const usage = snapshotAbilityUsage(
            actor,
            [...actor.abilities.known],
            24
        )
        expect(usage.shot).toEqual({
            mana: 0,
            energy: 9,
            cooldownMs: 495,
            range: 120,
            windupMs: 50,
            cycleMs: 200,
            movementMs: 200,
        })
        expect(usage.spark).toEqual({
            mana: 5,
            energy: 5,
            cooldownMs: 800,
            range: 104,
            windupMs: 200,
            cycleMs: 200,
            movementMs: 200,
        })
        expect(usage.pray).toEqual({
            mana: 5,
            energy: 0,
            cooldownMs: 2700,
            range: 96,
            windupMs: 2700,
        })
        const energy = actor.energy
        expect(
            attemptAbilityAttack(
                {
                    actor,
                    now: 1000,
                    targets: [],
                    tileSize: 24,
                    respawnDelayMsFor: () => 15000,
                },
                'shot'
            )
        ).toHaveLength(1)
        expect(actor.energy).toBe(energy - (usage.shot?.energy ?? 0))
        expect(actor.abilities.availableAt.shot).toBe(
            1000 + (usage.shot?.cooldownMs ?? 0)
        )
        for (const values of Object.values(usage)) {
            expect(Object.keys(values).sort()).toEqual([
                'cooldownMs',
                ...('cycleMs' in values ? ['cycleMs'] : []),
                ...('durationMs' in values ? ['durationMs'] : []),
                'energy',
                'mana',
                ...('movementMs' in values ? ['movementMs'] : []),
                'range',
                'windupMs',
            ])
        }
        expect(JSON.stringify(usage)).not.toContain('damage')
        expect(JSON.stringify(usage)).not.toContain('critChance')
        expect(usage.fireball).toBeUndefined()
        expect(usage.greater_fireball).toBeUndefined()
    })

    it('reprojects raw snapshots with the current navigation dimensions for self and foreign viewers', () => {
        const actor = trainedActor()
        const observer = abilityHero('vanguard')
        const navigation = new NavigationService({
            id: actor.locationId,
            width: 32,
            height: 32,
            tileWidth: 24,
            tileHeight: 24,
            solid: new Array<boolean>(32 * 32).fill(false),
            solidLayerNames: [],
        })
        const raw = actor.snapshot(1000)
        expect(raw.abilities?.parameters?.shot?.range).toBe(80)
        for (const viewer of [actor, observer]) {
            const projected = observeCharacterCombat(raw, actor, {
                observer: viewer,
                getCharacter: (id) => (id === actor.id ? actor : observer),
                navigation,
                now: 1000,
            })
            expect(projected.abilities?.parameters).toMatchObject({
                shot: { range: 120 },
                spark: { range: 104 },
                pray: { range: 96, windupMs: 2700 },
            })
            expect(
                JSON.stringify(projected.abilities?.parameters)
            ).not.toContain('damage')
        }
        expect(raw.abilities?.parameters?.shot?.range).toBe(80)
    })
})

it('includes only attained abilities and adds learned spells without exporting their numeric power', () => {
    const actor = abilityHero('vanguard')
    expect(snapshotAbilities(actor, 1000).parameters).toEqual({})
    actor.abilities.known.add('fireball')
    actor.progression.masteries.magic.level = 8
    actor.progression.constellations.opened.add('magic.fire_damage')
    const snapshot = snapshotAbilities(actor, 1000)
    expect(snapshot.parameters).toEqual({
        fireball: {
            mana: 15,
            energy: 0,
            cooldownMs: 5000,
            range: 160,
            windupMs: 400,
            cycleMs: 400,
            movementMs: 400,
        },
    })
    expect(snapshot.parameters?.greater_fireball).toBeUndefined()
    expect(JSON.stringify(snapshot.parameters)).not.toContain('damage')
})

it('keeps the fraction for portal prices and reveals the rounded amount only to the informed caster', () => {
    const actor = abilityHero('arcanist')
    const observer = abilityHero('vanguard')
    const context = abilityContext([actor, observer])
    actor.abilities.known.add('city_portal')
    actor.progression.constellations.opened.add('magic.spell_economy3')

    const portal = (viewer = actor) =>
        observeCharacterCombat(actor.snapshot(context.now), actor, {
            observer: viewer,
            getCharacter: (id) =>
                context.characters.find((character) => character.id === id),
            navigation: context.navigation,
            now: context.now,
        }).abilities?.parameters?.city_portal
    expect(portal()).toMatchObject({ mana: 0, durationMs: 60000 })
    expect(portal()?.manaFraction).toBeCloseTo(0.28)
    actor.progression.constellations.opened.add('magic.mana3')
    expect(portal()?.mana).toBe(20)
    observer.exactCombatNumbers = true
    expect(portal(observer)?.mana).toBe(0)
})

function trainedActor() {
    const actor = abilityHero('arcanist')
    actor.abilities.known.add('shot')
    actor.abilities.known.add('pray')
    for (const id of [
        'arrow.range1',
        'arrow.economy',
        'arrow.tempo',
        'magic.spark_range',
        'magic.spark_economy',
        'prayer.radius1',
        'prayer.radius2',
        'prayer.focus',
    ]) {
        actor.progression.constellations.opened.add(id)
    }
    return actor
}
