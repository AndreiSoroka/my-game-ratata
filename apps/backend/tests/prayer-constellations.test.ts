import { GRAVE_RESTORE_MS } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { advanceRevive } from '../src/game/characterLife'
import {
    deityMood,
    snapshotDeity,
    snapshotOtherDeities,
} from '../src/game/deities'
import { pray } from '../src/game/prayer'
import { previewPrayer } from '../src/game/prayerContext'
import { prayerParameters } from '../src/game/prayerParameters'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { gravePrayerFixture, prayerSource } from './gravePrayerTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

it.each([0.199999, 0.2])(
    'uses the neutral twenty-percent threshold without a second roll: %s',
    (roll) => {
        const f = gravePrayerFixture()
        const endsAt = 33_000
        expect(deityMood('hearth', endsAt)).toBe('neutral')
        const random = vi.fn(() => roll)
        const start = { ...f.context(endsAt - 3000), random }
        const intent = {
            mode: 'purify_grave',
            target: { kind: 'grave', id: prayerSource.id },
        } as const
        pray(f.actor, start.now, undefined, start, intent)
        const events = advanceRevive(
            f.actor,
            () => undefined,
            endsAt,
            undefined,
            { ...start, now: endsAt }
        )
        expect(random).toHaveBeenCalledTimes(1)
        expect(f.actor.mana).toBe(115)
        expect(masteryExperience(f.actor, 'prayer')).toBe(
            prayerXp(roll < 0.2 ? 10 : 0)
        )
        expect(f.service.get(prayerSource.id)?.purification?.completed).toBe(
            roll < 0.2 ? 1 : 0
        )
        expect(
            events.some((event) => event.kind === 'grave_purification_progress')
        ).toBe(roll < 0.2)
        expect(f.advance(endsAt + 1)).toEqual([])
    }
)

it('shares progress across interruptions, ruin/restoration and duplicate registrations', () => {
    const f = gravePrayerFixture()
    expect(
        f.service.contributePurification(prayerSource.id, 'cast:one', 10_000)
            .accepted
    ).toBe(true)
    expect(
        f.service.contributePurification(prayerSource.id, 'cast:one', 10_001)
            .accepted
    ).toBe(false)
    f.begin()
    f.actor.setMoveInput({ x: 1, y: 0 })
    f.advance(10_001)
    expect(f.actor.mana).toBe(115)
    f.service.damage(prayerSource.id, 100, 10_002)
    f.service.update(10_002 + GRAVE_RESTORE_MS, f.spawnContext)
    f.service.register(prayerSource, [], 10_003 + GRAVE_RESTORE_MS)
    expect(f.service.get(prayerSource.id)).toMatchObject({
        phase: 'active',
        purification: { completed: 1, required: 5 },
    })
})

it('resolves area gifts and multiple grave steps with one roll and per-result XP', () => {
    const f = gravePrayerFixture()
    f.actor.progression.constellations.opened.add('prayer.area')
    f.actor.abilities.known.add('pray_woven')
    for (const id of ['prayer.targets1', 'prayer.targets2']) {
        f.actor.progression.constellations.opened.add(id)
    }
    f.actor.hp -= 10
    const ally = abilityHero('vanguard')
    ally.locationId = prayerSource.locationId
    ally.position = { x: 130, y: 168 }
    ally.hp -= 10
    f.characters.set(ally.id, ally)
    f.service.register(
        { ...prayerSource, id: 'other-grave', position: { x: 136, y: 136 } },
        [],
        10_000
    )
    const random = vi.fn(() => 0)
    const start = { ...f.context(10_000), random }
    pray(
        f.actor,
        start.now,
        undefined,
        start,
        {
            mode: 'purify_grave',
            target: { kind: 'grave', id: prayerSource.id },
        },
        'pray_woven'
    )
    const events = advanceRevive(f.actor, () => undefined, 13_000, undefined, {
        ...start,
        now: 13_000,
    })
    expect(events.filter((event) => event.kind === 'heal')).toHaveLength(2)
    expect(
        events.filter((event) => event.kind === 'grave_purification_progress')
    ).toHaveLength(2)
    expect(f.actor.mana).toBe(100)
    expect(masteryExperience(f.actor, 'prayer')).toBe(prayerXp(80))
    expect(random).toHaveBeenCalledTimes(1)
})

it('keeps the unranked root prayer single-target without mixing in healing', () => {
    const f = gravePrayerFixture()
    f.actor.hp -= 10
    f.begin()
    const events = f.advance(13_000)
    expect(events.some((event) => event.kind === 'heal')).toBe(false)
    expect(f.service.get(prayerSource.id)?.purification?.completed).toBe(1)
})

it('uses authored cell size for prayer reach and fixes duration when a channel starts', () => {
    const actor = abilityHero()
    actor.progression.constellations.opened.add('prayer.radius1')
    actor.progression.constellations.opened.add('prayer.focus')
    const target = abilityHero('vanguard')
    target.position.x += 79
    target.hp -= 20
    const context = abilityContext([actor, target])
    context.navigation.grid.tileWidth = 32
    expect(prayerParameters(actor, 32)).toMatchObject({
        radius: 80,
        durationMs: 2700,
        manaCost: 5,
    })
    expect(previewPrayer(actor, context)).toMatchObject({
        radius: 80,
        durationMs: 2700,
    })
    expect(
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'restore', targetId: target.id },
            },
            context
        )[0]
    ).toMatchObject({ phase: 'started', durationMs: 2700 })
    expect(actor.abilities.casting?.completesAt).toBe(3700)
    expect(
        advanceRevive(
            actor,
            () => target,
            3699,
            () => 0,
            { ...context, now: 3699 }
        )
    ).toEqual([])
    expect(
        advanceRevive(
            actor,
            () => target,
            3700,
            () => 0,
            { ...context, now: 3700 }
        ).some((event) => event.kind === 'heal')
    ).toBe(true)
    expect(actor.mana).toBe(115)
})

it('learns harmful prayer from its star instead of a mastery level', () => {
    const actor = abilityHero()
    const undead = abilityHero('vanguard', 'undead')

    const context = abilityContext([actor, undead])
    expect(previewPrayer(actor, context).harmfulTargets).toBe(0)
    actor.progression.constellations.opened.add('prayer.harm')
    expect(previewPrayer(actor, context).harmfulTargets).toBe(1)
})

it('reveals own and other divine knowledge only through their independently learned stars', () => {
    const actor = abilityHero()

    expect(snapshotDeity(actor, 30_000)).toMatchObject({
        perception: 'vague',
        mood: null,
        successChance: null,
        changesInMs: null,
    })
    expect(snapshotOtherDeities(actor, 30_000)).toEqual([])
    actor.progression.constellations.opened.add('prayer.omen1')
    expect(snapshotDeity(actor, 30_000)).toMatchObject({
        perception: 'hint',
        mood: null,
    })
    actor.progression.constellations.opened.add('prayer.omen2')
    expect(snapshotDeity(actor, 30_000)).toMatchObject({
        mood: 'neutral',
        successChance: null,
    })
    actor.progression.constellations.opened.add('prayer.omen3')
    expect(snapshotDeity(actor, 30_000).successChance).toBeCloseTo(0.55)
    actor.progression.constellations.opened.add('prayer.omen4')
    expect(snapshotDeity(actor, 30_000).changesInMs).toBe(30_000)
    actor.progression.constellations.opened.add('prayer.others1')
    expect(snapshotOtherDeities(actor, 30_000)).toHaveLength(3)
    expect(
        snapshotOtherDeities(actor, 30_000).every(
            (deity) =>
                deity.mood === null &&
                deity.successChance === null &&
                deity.changesInMs === null
        )
    ).toBe(true)
    actor.progression.constellations.opened.add('prayer.others4')
    expect(
        snapshotOtherDeities(actor, 30_000).every(
            (deity) =>
                deity.mood !== null &&
                deity.successChance !== null &&
                deity.changesInMs !== null
        )
    ).toBe(true)
})

it('cancels a restored pinned recipient before rolls or Woven effects without refunding the prepaid targets', () => {
    const actor = abilityHero()
    actor.progression.constellations.opened.add('prayer.area')
    actor.progression.constellations.opened.add('prayer.targets1')
    actor.abilities.known.add('pray_woven')
    const target = abilityHero('vanguard')
    const neighbor = abilityHero('vanguard')
    target.hp -= 10
    neighbor.hp -= 10
    const random = vi.fn(() => 0)
    const context = abilityContext([actor, target, neighbor], 1000, random)
    handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray_woven',
            intent: { mode: 'restore', targetId: target.id },
        },
        context
    )
    target.hp = target.maxHp
    expect(
        advanceRevive(
            actor,
            (id) => context.characters.find((character) => character.id === id),
            4000,
            undefined,
            { ...context, now: 4000 }
        )
    ).toMatchObject([
        { kind: 'cast', phase: 'interrupted', targetId: target.id },
    ])
    expect(actor.mana).toBe(110)
    expect(neighbor.hp).toBe(neighbor.maxHp - 10)
    expect(random).not.toHaveBeenCalled()
    expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(0))
})

it('does not turn a small hostile wound followed by friendly damage into Last Light', () => {
    const actor = abilityHero()
    const ally = abilityHero()
    actor.hp = 1
    actor.progression.constellations.hostileWound = 1
    actor.progression.constellations.lowHpFromHostile = false
    actor.progression.constellations.opened.add('prayer.gift1')
    actor.progression.constellations.opened.add('life.hp1')
    ally.hp -= 10
    const context = abilityContext([actor, ally], 1000, () => 0)
    pray(actor, 1000, undefined, context, {
        mode: 'restore',
        targetId: ally.id,
    })
    advanceRevive(actor, () => undefined, 4000, undefined, {
        ...context,
        now: 4000,
    })
    expect(ally.hp).toBeGreaterThan(ally.maxHp - 10)
    expect(
        actor.progression.constellations.opened.has('prayer.last_light')
    ).toBe(false)
})
