import {
    ABILITY_DEFINITIONS,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { characterEnergyRegenRate } from '../src/game/characterRecovery'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import { advancePrayerCast, beginPrayerCast } from '../src/game/prayer'
import { cancelPrayerCast } from '../src/game/prayerCancellation'
import {
    recordLifeWorkSpend,
    recordUsefulResourceSpend,
    restoreEnergy,
} from '../src/game/resourcePractice'
import {
    applyRoadPrayerRecovery,
    hasRoadPrayerRecovery,
} from '../src/game/roadPrayerRecovery'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

const startedAt = 1_000
const completesAt = startedAt + ABILITY_DEFINITIONS.pray_road.windupMs

function start(
    caster: GameCharacter,
    target: GameCharacter,
    characters: GameCharacter[]
) {
    caster.abilities.known.add('pray_road')
    const context = abilityContext(characters, startedAt)
    expect(
        beginPrayerCast(
            caster,
            { mode: 'restore', targetId: target.id },
            context,
            'pray_road'
        )[0]?.phase
    ).toBe('started')
    return context
}

it('applies fivefold ordinary recovery from the root during the channel and caps overlapping songs', () => {
    const caster = abilityHero()
    const secondCaster = abilityHero()
    const ally = abilityHero()
    const distant = abilityHero()
    distant.position.x += 49
    const enemy = new GameCharacter({
        id: 'hostile',
        nickname: 'Hostile',
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'monsters',
        spawnPosition: { ...caster.position },
    })
    const characters = [caster, secondCaster, ally, distant, enemy]
    const context = start(caster, caster, characters)
    start(secondCaster, secondCaster, characters)
    expect(caster.mana).toBe(caster.config.resources.maxMana - 5)
    expect(hasRoadPrayerRecovery(ally, context.navigation, startedAt)).toBe(
        true
    )
    expect(hasRoadPrayerRecovery(distant, context.navigation, startedAt)).toBe(
        false
    )
    const energyRates = new Map(characters.map((actor) => [actor, () => 6]))
    for (const actor of characters) {
        actor.energy = 0
        actor.applyRegen(500, false, true, startedAt + 250)
    }
    applyRoadPrayerRecovery(
        characters,
        energyRates,
        () => context.navigation,
        startedAt + 250,
        500
    )
    expect(caster.energy).toBe(9)
    expect(ally.energy).toBe(9)
    expect(distant.energy).toBe(3)
    expect(enemy.energy).toBe(3)

    cancelPrayerCast(caster, startedAt + 250)
    cancelPrayerCast(secondCaster, startedAt + 250)
    applyRoadPrayerRecovery(
        characters,
        energyRates,
        () => context.navigation,
        startedAt + 500,
        250
    )
    expect(ally.energy).toBe(9)
    expect(caster.mana).toBe(caster.config.resources.maxMana - 5 + 2)
})

it('doubles the circular song area with Bard Skills and keeps the instant gift range', () => {
    const caster = abilityHero()
    caster.progression.constellations.opened.add('prayer_road.bard')
    const ally = abilityHero()
    ally.position.x += 60
    const beyond = abilityHero()
    beyond.position.x += 69
    const context = start(caster, caster, [caster, ally, beyond])
    expect(hasRoadPrayerRecovery(ally, context.navigation, startedAt)).toBe(
        true
    )
    expect(hasRoadPrayerRecovery(beyond, context.navigation, startedAt)).toBe(
        false
    )
    expect(
        caster.snapshot(startedAt).abilities?.prayers?.pray_road?.radius
    ).toBe(ABILITY_DEFINITIONS.pray_road.range)
    expect(
        caster.snapshot(startedAt).abilities?.prayers?.pray_road
            ?.energyRecoveryRadius
    ).toBeCloseTo(ABILITY_DEFINITIONS.pray_road.range * Math.sqrt(2))
    caster.progression.constellations.opened.delete('prayer_road.bard')
    expect(caster.snapshot(startedAt).abilities?.casting?.radius).toBeCloseTo(
        ABILITY_DEFINITIONS.pray_road.range * Math.sqrt(2)
    )
})

it('restores useful work energy up to the Endurance capacity', () => {
    const caster = abilityHero()
    const ally = abilityHero()
    ally.progression.constellations.opened.add('life.endurance')
    restoreEnergy(ally, 20, startedAt)
    recordLifeWorkSpend(ally, ally.drainEnergy(30), startedAt)
    const characters = [caster, ally]
    const context = start(caster, ally, characters)

    applyRoadPrayerRecovery(
        characters,
        new Map([[ally, () => 6]]),
        () => context.navigation,
        startedAt + 1500,
        1500
    )

    expect(ally.energy).toBe(effectiveMaxEnergy(ally))
    expect(ally.progression.constellations.lifeEnergy.recovered).toBe(30)
    expect(ally.progression.masteries.life.experience).toBe(10_000_000n)
})

it('boosts the resting bonus only while the rest and song overlap', () => {
    const caster = abilityHero()
    const ally = abilityHero()
    ally.progression.constellations.opened.add('life.breath')
    ally.progression.constellations.opened.add('life.rest')
    ally.progression.constellations.lifeEnergy.restUntil = startedAt + 8100
    ally.energy = 0
    const characters = [caster, ally]
    const context = start(caster, ally, characters)

    applyRoadPrayerRecovery(
        characters,
        new Map([[ally, characterEnergyRegenRate(ally, false, false)]]),
        () => context.navigation,
        startedAt + 250,
        500
    )

    expect(ally.energy).toBeCloseTo(10.08)
})

it.each([true, false])(
    'credits useful song recovery once and grants the dash discount only if answered (%s)',
    (answered) => {
        const caster = abilityHero()
        caster.progression.constellations.opened.add('prayer_road.shoulder')
        const ally = abilityHero()
        ally.energy -= 20
        recordUsefulResourceSpend(ally, 'energy', 20)
        const characters = [caster, ally]
        const context = start(caster, ally, characters)
        applyRoadPrayerRecovery(
            characters,
            new Map([[ally, () => 6]]),
            () => context.navigation,
            completesAt,
            1_000
        )
        expect(ally.energy).toBe(ally.config.resources.maxEnergy)
        expect(
            hasRoadPrayerRecovery(ally, context.navigation, completesAt)
        ).toBe(false)
        const finish = {
            ...context,
            now: completesAt,
            random: () => (answered ? 0 : 0.99),
        }
        expect(advancePrayerCast(caster, completesAt, finish)[0]?.phase).toBe(
            'completed'
        )
        expect(ally.movement.roadPrayerDashUntil).toBe(
            answered
                ? completesAt + ROAD_PRAYER_RULES.dashDiscountDurationMs
                : undefined
        )
        expect(advancePrayerCast(caster, completesAt, finish)).toEqual([])
        expect(masteryExperience(caster, 'prayer_road')).toBe(prayerXp(36))
    }
)
