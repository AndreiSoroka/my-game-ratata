import {
    parseMasteryExperience,
    type PrayerAbilityId,
    type PrayerActionId,
    type PrayerIntent,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { AbilityContext } from '../src/game/abilityContext'
import { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { completePrayer } from '../src/game/prayerEffects'
import { recordUsefulResourceSpend } from '../src/game/resourcePractice'
import { captureMasteryFactors } from '../src/game/skillProgression'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { gravePrayerFixture, prayerSource } from './gravePrayerTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

it('awards thirty XP per useful area recipient and none for empty recipients', () => {
    const caster = abilityHero()
    caster.progression.constellations.opened.add('prayer.area')
    caster.abilities.known.add('pray_woven')
    for (const id of ['prayer.targets1', 'prayer.targets2']) {
        caster.progression.constellations.opened.add(id)
    }
    const targets = Array.from({ length: 5 }, () => abilityHero('vanguard'))
    for (const target of targets.slice(0, 4)) {
        target.hp -= 10
    }
    const events = castAction(
        caster,
        { mode: 'restore', targetId: targets.at(0)?.id ?? 'missing' },
        abilityContext([caster, ...targets], 30_000),
        'pray_woven'
    )
    expect(events.filter((event) => event.kind === 'heal')).toHaveLength(4)
    expect(masteryExperience(caster)).toBe(prayerXp(144))
    expect(caster.progression.masteries.prayer).toEqual({
        level: 1,
        experience: prayerXp(44),
    })
    expect(caster.progression.masteries.prayer_road.experience).toBe(0n)
    expect(caster.mana).toBe(20)
})

it('freezes one conflict factor before self recovery, then adds every gift, victim and grave contribution', () => {
    const f = gravePrayerFixture()
    for (const id of [
        'prayer.area',
        'prayer.harm',
        'prayer.targets1',
        'prayer.targets2',
        'prayer.targets3',
    ]) {
        f.actor.progression.constellations.opened.add(id)
    }
    f.actor.abilities.known.add('pray_woven')
    f.actor.hp -= 10
    f.actor.progression.masteries.life.experience = parseMasteryExperience('80')
    f.actor.progression.constellations.hostileWound = 10
    f.actor.progression.constellations.recoveryPractice =
        f.actor.maxHp * 0.2 - 1
    const ally = abilityHero('vanguard')
    ally.locationId = prayerSource.locationId
    ally.position = { ...f.actor.position }
    ally.hp -= 10
    f.characters.set(ally.id, ally)
    for (let index = 0; index < 2; index++) {
        const enemy = new GameCharacter({
            id: `prayer-mastery-enemy-${String(index)}`,
            nickname: 'Undead',
            archetype: 'skeleton',
            controllerKind: 'mob1',
            faction: 'monsters',
            locationId: f.actor.locationId,
            spawnPosition: { ...f.actor.position },
        })
        f.characters.set(enemy.id, enemy)
    }
    const finalGrave = {
        ...prayerSource,
        id: 'final-grave',
        position: { x: 136, y: 136 },
    }
    f.service.register(finalGrave, [], 10_000)
    for (let step = 0; step < 4; step++) {
        f.service.contributePurification(
            finalGrave.id,
            `setup:${String(step)}`,
            10_000
        )
    }
    expect(captureMasteryFactors(f.actor).prayer).toBe(1)
    const events = castAction(
        f.actor,
        { mode: 'restore', targetId: ally.id },
        f.context(30_000),
        'pray_woven'
    )
    expect(events.filter((event) => event.kind === 'heal')).toHaveLength(2)
    expect(events.filter((event) => event.kind === 'damage')).toHaveLength(2)
    expect(
        events.filter((event) => event.kind === 'grave_purified')
    ).toHaveLength(1)
    expect(
        events.filter((event) => event.kind === 'grave_purification_progress')
    ).toHaveLength(1)
    expect(f.actor.progression.masteries.life.level).toBe(1)
    // 2×30 gifts + 2×70 hostile victims + 10 ordinary step + 150 final step.
    // Self recovery raises Life first, but cannot change this prayer's frozen multiplier.
    expect(masteryExperience(f.actor)).toBe(prayerXp(432))
    expect(f.actor.mana).toBe(10)
})

it.each([
    ['pray', 'hp', 6],
    ['pray_road', 'energy', 15],
    ['pray_lantern', 'mana', 12],
    ['pray_grave', 'hp', 6],
] as const)(
    'keeps %s power fixed at mastery zero and one hundred',
    (abilityId, resource, power) => {
        for (const level of [0, 100]) {
            const caster = abilityHero()
            caster.abilities.known.add(abilityId)
            for (const mastery of Object.values(caster.progression.masteries)) {
                mastery.level = level
            }
            const target = abilityHero(
                'vanguard',
                abilityId === 'pray_grave' ? 'undead' : 'humanoid'
            )
            target[resource] -= 20
            if (resource !== 'hp') {
                recordUsefulResourceSpend(target, resource, 20)
            }
            const before = target[resource]
            const context = abilityContext([caster, target], 30_000)
            const intent = { mode: 'restore', targetId: target.id } as const
            const events =
                abilityId === 'pray'
                    ? castAction(caster, intent, context, abilityId)
                    : completePrayer(
                          caster,
                          intent,
                          context,
                          0,
                          1,
                          `power:${abilityId}:${String(level)}`,
                          abilityId
                      )
            expect(target[resource] - before).toBe(power)
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'heal', amount: power })
            )
        }
    }
)

function castAction(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerActionId
) {
    const events = handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId, intent },
        context
    )
    expect(events[0]?.phase).toBe('started')
    const cast = actor.abilities.casting
    if (cast === null) {
        throw new Error('Expected a paid prayer channel')
    }
    return [
        ...events,
        ...advanceRevive(
            actor,
            (id) => context.characters.find((target) => target.id === id),
            cast.completesAt,
            context.random,
            { ...context, now: cast.completesAt }
        ),
    ]
}

it.each(['pray_road', 'pray_lantern'] as const)(
    'does not pay %s twice for a recovered useful deficit',
    (abilityId: PrayerAbilityId) => {
        const caster = abilityHero()
        caster.abilities.known.add(abilityId)
        const target = abilityHero('vanguard')
        const resource = abilityId === 'pray_road' ? 'energy' : 'mana'
        target[resource] -= 1
        recordUsefulResourceSpend(target, resource, 1)
        const context = abilityContext([caster, target], 30_000)
        const intent = { mode: 'restore', targetId: target.id } as const
        completePrayer(
            caster,
            intent,
            context,
            0,
            1,
            'resource:first',
            abilityId
        )
        const path =
            abilityId === 'pray_road' ? 'prayer_road' : 'prayer_lantern'
        expect(masteryExperience(caster, path)).toBe(prayerXp(36))
        target[resource] -= 1
        completePrayer(
            caster,
            intent,
            context,
            0,
            1,
            'resource:artificial',
            abilityId
        )
        expect(masteryExperience(caster, path)).toBe(prayerXp(36))
    }
)
