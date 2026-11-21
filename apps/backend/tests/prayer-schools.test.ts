import {
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import {
    handleAbilityCommand,
    parseAbilityCommand,
} from '../src/game/abilityCommands'
import { knowsAbility } from '../src/game/abilityState'
import { autoActionStatus } from '../src/game/autoActionRules'
import {
    advanceCharacterControl,
    type ControlWorld,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { advanceRevive } from '../src/game/characterLife'
import { parseControlCommand } from '../src/game/controlCommands'
import { miracleChance } from '../src/game/deities'
import { chooseDeity, learnAbility } from '../src/game/magicLearning'
import { previewPrayer } from '../src/game/prayerContext'
import { prayerParameters } from '../src/game/prayerParameters'
import { recordUsefulResourceSpend } from '../src/game/resourcePractice'
import { canUseResurrection } from '../src/game/skillProgression'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { gravePrayerFixture, prayerSource } from './gravePrayerTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

type Hero = ReturnType<typeof abilityHero>
function known(actor: Hero, ...ids: PrayerAbilityId[]) {
    for (const id of ids) {
        actor.abilities.known.add(id)
    }
}
function complete(
    actor: Hero,
    abilityId: PrayerAbilityId,
    target: Hero,
    now = 1000,
    random = () => 0
) {
    const context = abilityContext([actor, target], now, random)
    const started = handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId,
            intent: { mode: 'restore', targetId: target.id },
        },
        context
    )
    const endsAt = actor.abilities.casting?.completesAt ?? now + 3000
    return [
        ...started,
        ...advanceRevive(
            actor,
            (id) => context.characters.find((candidate) => candidate.id === id),
            endsAt,
            undefined,
            { ...context, now: endsAt }
        ),
    ]
}

it('starts a cleric with healing alone and teaches only an exact known school', () => {
    const cleric = abilityHero()
    expect(prayerAbilityIds.filter((id) => knowsAbility(cleric, id))).toEqual([
        'pray',
    ])
    const student = abilityHero('vanguard')
    let context = abilityContext([student, cleric])
    expect(
        learnAbility(student, cleric, 'pray_road', context).every(
            (event) => event.kind === 'notice'
        )
    ).toBe(true)
    expect(knowsAbility(student, 'pray_road')).toBe(false)
    known(cleric, 'pray_road')
    learnAbility(student, cleric, 'pray_road', context)
    expect(knowsAbility(student, 'pray_road')).toBe(true)
    expect(student.progression.patron).toBe('road')
    expect(
        student.progression.constellations.opened.has('prayer_road.root')
    ).toBe(true)
    expect(student.progression.constellations.opened.has('prayer.root')).toBe(
        false
    )
    cleric.position.x += 65
    context = abilityContext([student, cleric])
    learnAbility(student, cleric, 'pray', context)
    expect(knowsAbility(student, 'pray')).toBe(false)
})

it('keeps spell effects fixed while the chosen HUD patron changes', () => {
    const actor = abilityHero()
    known(actor, 'pray_road', 'pray_lantern', 'pray_grave')
    const guide = abilityHero()
    chooseDeity(actor, guide, 'grave', 1000)
    expect(actor.progression.patron).toBe('grave')
    const living = abilityHero('vanguard')
    living.hp -= 10
    expect(
        complete(actor, 'pray', living).some((event) => event.kind === 'heal')
    ).toBe(true)
    const undead = abilityHero('vanguard', 'undead')
    undead.hp -= 10
    const livingHp = living.hp
    expect(
        complete(actor, 'pray_grave', undead, 4000).some(
            (event) => event.kind === 'heal'
        )
    ).toBe(true)
    expect(living.hp).toBe(livingHp)
    expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(36))
    expect(masteryExperience(actor, 'prayer_grave')).toBe(prayerXp(36))
    expect(masteryExperience(actor, 'prayer_road')).toBe(prayerXp(0))
})

it.each(['pray_road', 'pray_lantern'] as const)(
    'trains only %s from useful paid resource recovery',
    (abilityId) => {
        const actor = abilityHero()
        known(actor, abilityId)
        const target = abilityHero('vanguard')
        const resource = abilityId === 'pray_road' ? 'energy' : 'mana'
        target[resource] -= 20
        recordUsefulResourceSpend(target, resource, 20)
        const events = complete(actor, abilityId, target)
        expect(
            events.some(
                (event) => event.kind === 'heal' && event.text === resource
            )
        ).toBe(true)
        const school = PRAYER_SCHOOL_DEFINITIONS[abilityId]
        expect(masteryExperience(actor, school.constellationId)).toBe(
            prayerXp(36)
        )
        expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(0))
        expect(actor.mana).toBe(35)
    }
)

it('does not train resource prayers from artificial deficits or their own mana payment', () => {
    const actor = abilityHero()
    known(actor, 'pray_lantern')
    actor.mana -= 5
    complete(actor, 'pray_lantern', actor)
    expect(masteryExperience(actor, 'prayer_lantern')).toBe(prayerXp(0))
})

it('uses the fixed school deity and mood without a mastery-level chance bonus', () => {
    const actor = abilityHero()
    known(actor, 'pray_road')

    expect(miracleChance(actor, 0, 'road')).toBeCloseTo(0.25)
    actor.progression.masteries.prayer_road.level = 100
    expect(miracleChance(actor, 0, 'road')).toBeCloseTo(0.25)
    expect(miracleChance(actor, 0, 'hearth')).toBeCloseTo(0.25)
})

it.each(['pray_road', 'pray_lantern', 'pray_grave'] as const)(
    '%s has no healing passives, wave or grave purification',
    (abilityId) => {
        const f = gravePrayerFixture()
        known(f.actor, abilityId)
        for (const star of [
            'prayer.radius1',
            'prayer.focus',
            'prayer.gift1',
            'prayer.harm',
            'prayer.area',
        ]) {
            f.actor.progression.constellations.opened.add(star)
        }
        expect(prayerParameters(f.actor, 32, abilityId)).toEqual({
            radius: 48,
            durationMs: 3000,
            manaCost: 5,
            area: false,
            harm: false,
        })
        const beforeMana = f.actor.mana
        const random = vi.fn(() => 0)
        const context = { ...f.context(1000), random }
        expect(
            handleAbilityCommand(
                f.actor,
                {
                    type: 'use_ability',
                    abilityId,
                    intent: {
                        mode: 'purify_grave',
                        target: { kind: 'grave', id: prayerSource.id },
                    },
                },
                context
            ).every((event) => event.kind === 'notice')
        ).toBe(true)
        expect(
            handleAbilityCommand(
                f.actor,
                { type: 'use_ability', abilityId, intent: { mode: 'harm' } },
                context
            ).every((event) => event.kind === 'notice')
        ).toBe(true)
        expect(f.actor.mana).toBe(beforeMana)
        expect(random).not.toHaveBeenCalled()
    }
)

it('gates undead resurrection by the learned grave school and its own mastery', () => {
    const actor = abilityHero('vanguard')
    known(actor, 'pray_grave')

    expect(canUseResurrection(actor, 'pray_grave')).toBe(false)
    actor.progression.masteries.prayer_grave.level = 5
    expect(canUseResurrection(actor, 'pray_grave')).toBe(true)
    const target = abilityHero('vanguard', 'undead')
    target.applyDamage(target.hp, 100)
    const context = abilityContext([actor, target])
    expect(
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray_grave',
                intent: { mode: 'revive', targetId: target.id },
            },
            context
        )[0]?.phase
    ).toBe('started')
    expect(actor.abilities.casting?.abilityId).toBe('pray_grave')
    advanceRevive(
        actor,
        () => target,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(target.alive).toBe(true)
    expect(actor.mana).toBe(20)
    expect(masteryExperience(actor, 'prayer_grave')).toBe(prayerXp(1400))
    expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(0))
})

it('pins the school during a channel and records only accepted uses for training presentation', () => {
    const actor = abilityHero()
    known(actor, 'pray_road')
    const target = abilityHero('vanguard')
    target.energy -= 20
    recordUsefulResourceSpend(target, 'energy', 20)
    const context = abilityContext([actor, target])
    handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray_road',
            intent: { mode: 'restore', targetId: target.id },
        },
        context
    )
    expect(actor.abilities.lastPrayerAbilityId).toBe('pray_road')
    actor.progression.patron = 'hearth'
    handleAbilityCommand(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: target.id },
        },
        context
    )
    expect(actor.abilities.lastPrayerAbilityId).toBe('pray_road')
    const events = advanceRevive(
        actor,
        () => target,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(
        events.some((event) => event.kind === 'heal' && event.text === 'energy')
    ).toBe(true)
    expect(actor.snapshot(4000).abilities?.lastPrayerAbilityId).toBe(
        'pray_road'
    )
})

it('parses all four explicit schools and keeps a legacy automatic prayer healing', () => {
    for (const abilityId of [null, '', 'unknown_school', 'spark']) {
        expect(
            parseControlCommand({
                type: 'auto_action',
                action: {
                    kind: 'prayer',
                    abilityId,
                    intent: { mode: 'devotion' },
                },
            })
        ).toBeUndefined()
    }
    for (const abilityId of prayerAbilityIds) {
        expect(
            parseAbilityCommand({
                type: 'use_ability',
                abilityId,
                intent: { mode: 'devotion' },
            })
        ).toEqual({
            type: 'use_ability',
            abilityId,
            intent: { mode: 'devotion' },
        })
        expect(
            parseAbilityCommand({ type: 'use_ability', abilityId })
        ).toBeUndefined()
        expect(
            parseControlCommand({
                type: 'auto_action',
                action: {
                    kind: 'prayer',
                    abilityId,
                    intent: { mode: 'devotion' },
                },
            })
        ).toMatchObject({ action: { kind: 'prayer', abilityId } })
    }
    const actor = abilityHero()
    known(actor, 'pray_road')
    actor.progression.patron = 'road'
    const target = abilityHero('vanguard')
    target.energy -= 10
    expect(
        autoActionStatus(
            actor,
            {
                kind: 'prayer',
                intent: { mode: 'restore', targetId: target.id },
            },
            abilityContext([actor, target])
        )
    ).toBe('stop')
    expect(
        previewPrayer(
            actor,
            abilityContext([actor, target]),
            target.id,
            'pray_road'
        ).intent
    ).toEqual({ mode: 'restore', targetId: target.id })
})

it.each(prayerAbilityIds)(
    'charges a failed useful %s attempt once without granting XP',
    (abilityId) => {
        const actor = abilityHero()
        known(actor, abilityId)
        const target = abilityHero(
            'vanguard',
            abilityId === 'pray_grave' ? 'undead' : 'humanoid'
        )
        if (abilityId === 'pray_road') {
            target.energy -= 20
            recordUsefulResourceSpend(target, 'energy', 20)
        } else if (abilityId === 'pray_lantern') {
            target.mana -= 20
            recordUsefulResourceSpend(target, 'mana', 20)
        } else {
            target.hp -= 10
        }
        const random = vi.fn(() => 1)
        const events = complete(actor, abilityId, target, 1000, random)
        expect(events.some((event) => event.kind === 'heal')).toBe(false)
        expect(events.filter((event) => event.kind === 'notice')).toEqual([
            {
                kind: 'notice',
                noticeKind: 'prayer_unanswered',
                actorId: actor.id,
                audienceIds: [actor.id],
                abilityId,
                text: 'Божество не ответило',
            },
        ])
        const school = PRAYER_SCHOOL_DEFINITIONS[abilityId]
        expect(masteryExperience(actor, school.constellationId)).toBe(
            prayerXp(0)
        )
        expect(actor.mana).toBe(35)
        expect(random).toHaveBeenCalledTimes(1)
    }
)

it.each(['pray_road', 'pray_lantern'] as const)(
    'keeps the %s auto-action pinned while waiting for mana and lifecycle completion',
    (abilityId) => {
        const actor = abilityHero()
        known(actor, abilityId)
        actor.mana = 0
        const target = abilityHero('vanguard')
        const resource = abilityId === 'pray_road' ? 'energy' : 'mana'
        target[resource] -= 20
        recordUsefulResourceSpend(target, resource, 20)
        const context = abilityContext([actor, target])
        const world: ControlWorld = {
            getCharacter: (id) =>
                context.characters.find((character) => character.id === id),
            navigationFor: () => context.navigation,
            requestAttack: () => undefined,
            abilityContextFor: (_actor, now) => ({ ...context, now }),
            publishEvents: () => undefined,
        }
        expect(
            setCharacterControl(
                actor,
                {
                    type: 'auto_action',
                    action: {
                        kind: 'prayer',
                        abilityId,
                        intent: { mode: 'restore', targetId: target.id },
                    },
                },
                world,
                1000
            )
        ).toBe(true)
        advanceCharacterControl(actor, world, 1000)
        expect(snapshotControl(actor).waiting).toBe('resources')
        actor.mana = 5
        advanceCharacterControl(actor, world, 1001)
        expect(actor.abilities.casting?.abilityId).toBe(abilityId)
        expect(actor.mana).toBe(5)
        advanceCharacterControl(actor, world, 4001)
        expect(snapshotControl(actor).waiting).toBe('action')
        const events = advanceRevive(
            actor,
            () => target,
            4001,
            () => 0,
            { ...context, now: 4001 }
        )
        expect(
            events.some(
                (event) => event.kind === 'heal' && event.text === resource
            )
        ).toBe(true)
        expect(actor.mana).toBe(0)
        expect(snapshotControl(actor).action).toMatchObject({
            kind: 'prayer',
            abilityId,
            intent: { mode: 'restore', targetId: target.id },
        })
        advanceCharacterControl(actor, world, 4002)
        expect(snapshotControl(actor).waiting).toBe('resources')
    }
)
