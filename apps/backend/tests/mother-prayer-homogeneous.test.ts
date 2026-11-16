import type { PrayerActionId, PrayerIntent } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { advanceRevive } from '../src/game/characterLife'
import { planMotherPrayer } from '../src/game/motherPrayerPlan'
import { prayerParameters } from '../src/game/prayerParameters'
import { resolvePrayerIntent } from '../src/game/prayerSelection'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { gravePrayerFixture, prayerSource } from './gravePrayerTestHelpers'

type Actor = ReturnType<typeof abilityHero>
function ranks(actor: Actor, level: number): void {
    for (let value = 1; value <= level; value += 1) {
        actor.progression.constellations.opened.add(
            `prayer.targets${String(value)}`
        )
    }
}
function wounded(count: number): Actor[] {
    return Array.from({ length: count }, (_, index) => {
        const actor = abilityHero()
        actor.hp -= 10
        actor.position.x += index
        return actor
    })
}
function start(
    actor: Actor,
    context: ReturnType<typeof abilityContext>,
    intent: PrayerIntent,
    abilityId: PrayerActionId = 'pray'
) {
    const events = handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId, intent },
        context
    )
    expect(events).toContainEqual(
        expect.objectContaining({ kind: 'cast', phase: 'started' })
    )
    return actor.abilities.casting?.plan
}
function finish(actor: Actor, context: ReturnType<typeof abilityContext>) {
    const deadline = actor.abilities.casting?.completesAt
    if (deadline === undefined) {
        throw new Error('Expected paid prayer')
    }
    return advanceRevive(
        actor,
        (id) => context.characters.find((target) => target.id === id),
        deadline,
        () => 0,
        { ...context, now: deadline }
    )
}

describe('ordinary Mother target ranks without Woven knowledge', () => {
    it.each([
        [0, 1],
        [1, 2],
        [2, 5],
        [3, 20],
    ] as const)(
        'rank %s applies to both action parameter limits and heals at most %s recipients',
        (rank, limit) => {
            const actor = abilityHero()
            ranks(actor, rank)
            const allies = wounded(limit + 2)
            const selected = allies.at(-1)
            if (selected === undefined) {
                throw new Error('Expected selected ally')
            }
            const context = abilityContext([actor, ...allies])
            expect(actor.abilities.known.has('pray_woven')).toBe(false)
            expect(
                actor.progression.constellations.opened.has('prayer.area')
            ).toBe(false)
            for (const id of ['pray', 'pray_woven'] as const) {
                expect(prayerParameters(actor, 24, id).targetLimit).toBe(limit)
            }
            const plan = start(actor, context, {
                mode: 'restore',
                targetId: selected.id,
            })
            expect(plan?.targets).toHaveLength(limit)
            expect(
                plan?.targets.every((target) => target.kind === 'restore')
            ).toBe(true)
            expect(plan?.targets[0]?.id).toBe(selected.id)
            expect(actor.mana).toBe(120 - 5 * limit)
            const events = finish(actor, context).filter(
                (event) => event.kind === 'heal'
            )
            expect(events).toHaveLength(limit)
            expect(new Set(events.map((event) => event.targetId)).size).toBe(
                limit
            )
            expect(
                allies.filter((ally) => ally.hp > ally.maxHp - 10)
            ).toHaveLength(limit)
        }
    )
})

describe('ordinary manual miracle kind and automatic priority', () => {
    it('does not revive or harm neighbors when restore was explicitly selected', () => {
        const actor = abilityHero()
        ranks(actor, 2)
        actor.progression.constellations.opened.add('prayer.harm')
        const ally = wounded(1)[0]
        if (ally === undefined) {
            throw new Error('Expected ally')
        }
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        const enemy = abilityHero('vanguard', 'undead')
        Object.assign(enemy, { faction: 'monsters' })
        const context = abilityContext([actor, corpse, ally, enemy])
        expect(
            start(actor, context, { mode: 'restore', targetId: ally.id })
                ?.targets
        ).toEqual([{ kind: 'restore', id: ally.id }])
        const events = finish(actor, context)
        expect(events.filter((event) => event.kind === 'heal')).toHaveLength(1)
        expect(
            events.some(
                (event) => event.kind === 'revive' || event.kind === 'damage'
            )
        ).toBe(false)
        expect(corpse.alive).toBe(false)
        expect(enemy.hp).toBe(enemy.maxHp)
    })

    it('honors a selected harm mode and collects only undead while leaving fallen and wounded allies alone', () => {
        const actor = abilityHero()
        ranks(actor, 1)
        actor.progression.constellations.opened.add('prayer.harm')
        const allies = wounded(1)
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        const enemies = Array.from({ length: 3 }, () =>
            abilityHero('vanguard', 'undead')
        )
        enemies.forEach((enemy) =>
            Object.assign(enemy, { faction: 'monsters' })
        )
        const selected = enemies[2]
        if (selected === undefined) {
            throw new Error('Expected enemy')
        }
        const context = abilityContext([actor, corpse, ...allies, ...enemies])
        const plan = start(actor, context, {
            mode: 'harm',
            targetId: selected.id,
        })
        expect(plan?.targets).toHaveLength(2)
        expect(plan?.targets.every((target) => target.kind === 'harm')).toBe(
            true
        )
        expect(plan?.targets[0]?.id).toBe(selected.id)
        const events = finish(actor, context)
        expect(events.filter((event) => event.kind === 'damage')).toHaveLength(
            2
        )
        expect(
            events.some(
                (event) => event.kind === 'heal' || event.kind === 'revive'
            )
        ).toBe(false)
        expect(corpse.alive).toBe(false)
        expect(allies[0]?.hp).toBe((allies[0]?.maxHp ?? 0) - 10)
    })

    it('automatic priority chooses fallen allies and keeps the whole ordinary cast as resurrection', () => {
        const actor = abilityHero()
        ranks(actor, 1)
        actor.hp -= 5
        const corpses = [abilityHero(), abilityHero()]
        corpses.forEach((corpse) => corpse.applyDamage(corpse.hp, 0))
        const allies = wounded(1)
        const context = abilityContext([actor, ...allies, ...corpses])
        const intent = resolvePrayerIntent(actor, context)
        expect(intent.mode).toBe('revive')
        const plan = start(actor, context, intent)
        expect(plan?.targets).toHaveLength(2)
        expect(plan?.targets.every((target) => target.kind === 'revive')).toBe(
            true
        )
        const events = finish(actor, context)
        expect(events.filter((event) => event.kind === 'revive')).toHaveLength(
            2
        )
        expect(events.some((event) => event.kind === 'heal')).toBe(false)
        expect(actor.hp).toBe(actor.maxHp - 5)
        expect(corpses.every((corpse) => corpse.alive)).toBe(true)
    })
})

describe('homogeneous allocation, payment and frozen recipients', () => {
    it('prepays only distinct affordable healing recipients and never fills an empty slot later', () => {
        const actor = abilityHero()
        ranks(actor, 2)
        actor.hp -= 1
        actor.mana = 12.5
        const allies = wounded(2)
        const selectedSecondary = allies[0]
        if (selectedSecondary === undefined) {
            throw new Error('Expected secondary')
        }
        const late = abilityHero()
        const context = abilityContext([
            actor,
            actor,
            ...allies,
            selectedSecondary,
            late,
        ])
        const plan = start(actor, context, {
            mode: 'restore',
            targetId: actor.id,
        })
        expect(plan?.targets).toHaveLength(2)
        expect(plan?.targets[0]).toEqual({ kind: 'restore', id: actor.id })
        expect(new Set(plan?.targets.map((target) => target.id)).size).toBe(2)
        expect(plan?.manaCost).toBe(10)
        expect(actor.mana).toBe(2.5)
        selectedSecondary.position.x += 100
        late.hp -= 10
        const events = finish(actor, context)
        expect(events.filter((event) => event.kind === 'heal')).toHaveLength(1)
        expect(late.hp).toBe(late.maxHp - 10)
        expect(actor.mana).toBe(2.5)
        expect(
            advanceRevive(
                actor,
                () => undefined,
                10_000,
                () => 0,
                context
            )
        ).toEqual([])
    })

    it('purifies several graves without also healing nearby allies', () => {
        const f = gravePrayerFixture()
        ranks(f.actor, 1)
        f.actor.hp -= 10
        f.service.register(
            {
                ...prayerSource,
                id: 'other-grave',
                position: { x: 136, y: 136 },
            },
            [],
            10_000
        )
        const context = f.context(10_000)
        const plan = start(f.actor, context, {
            mode: 'purify_grave',
            target: { kind: 'grave', id: prayerSource.id },
        })
        expect(plan?.targets).toHaveLength(2)
        expect(
            plan?.targets.every((target) => target.kind === 'purify_grave')
        ).toBe(true)
        expect(f.actor.mana).toBe(110)
        const events = finish(f.actor, context)
        expect(
            events.filter(
                (event) => event.kind === 'grave_purification_progress'
            )
        ).toHaveLength(2)
        expect(events.some((event) => event.kind === 'heal')).toBe(false)
        expect(f.actor.hp).toBe(f.actor.maxHp - 10)
    })

    it('allocates an ordinary ward to multiple undead without secretly adding Kara', () => {
        const actor = abilityHero()
        ranks(actor, 1)
        actor.progression.constellations.opened.add('prayer.ward1')
        const enemies = [
            abilityHero('vanguard', 'undead'),
            abilityHero('vanguard', 'undead'),
        ]
        const selected = enemies[0]
        if (selected === undefined) {
            throw new Error('Expected target')
        }
        const context = abilityContext([actor, ...enemies])
        expect(
            start(actor, context, {
                mode: 'ward',
                targetId: selected.id,
            })?.targets.map((target) => target.kind)
        ).toEqual(['ward', 'ward'])
        expect(actor.abilities.casting?.mother?.wardTargetIds).toHaveLength(2)
        expect(
            finish(actor, context).some((event) => event.kind === 'damage')
        ).toBe(false)
        expect(enemies.every((enemy) => enemy.hp === enemy.maxHp)).toBe(true)
    })
})

describe('Last Light ordinary homogeneity and Woven exception', () => {
    function emergency() {
        const actor = abilityHero()
        ranks(actor, 1)
        actor.hp = 3
        actor.progression.constellations.hostileWound = 23
        actor.progression.constellations.lowHpFromHostile = true
        for (const id of ['prayer.last_light', 'prayer.harm', 'prayer.area']) {
            actor.progression.constellations.opened.add(id)
        }
        actor.abilities.known.add('pray_woven')
        const ally = wounded(1)[0]
        if (ally === undefined) {
            throw new Error('Expected ally')
        }
        const enemy = abilityHero('vanguard', 'undead')
        Object.assign(enemy, { faction: 'monsters' })
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        return {
            actor,
            ally,
            enemy,
            corpse,
            context: abilityContext([actor, ally, enemy, corpse]),
        }
    }

    it.each(['harm', 'revive'] as const)(
        'converts ordinary selected %s into self-first healing only',
        (mode) => {
            const f = emergency()
            const chosen = mode === 'harm' ? f.enemy : f.corpse
            const plan = start(f.actor, f.context, {
                mode,
                targetId: chosen.id,
            })
            expect(plan?.targets).toEqual([
                { kind: 'restore', id: f.actor.id },
                { kind: 'restore', id: f.ally.id },
            ])
            expect(plan?.manaCost).toBe(72)
            expect(f.actor.mana).toBe(48)
            const events = finish(f.actor, f.context)
            expect(
                events.filter((event) => event.kind === 'heal')
            ).toHaveLength(2)
            expect(
                events.some(
                    (event) =>
                        event.kind === 'damage' || event.kind === 'revive'
                )
            ).toBe(false)
            expect(f.corpse.alive).toBe(false)
            expect(f.enemy.hp).toBe(f.enemy.maxHp)
        }
    )

    it('retains the mandatory self-heal plus selected harm for mixed Woven prayer', () => {
        const f = emergency()
        const plan = start(
            f.actor,
            f.context,
            { mode: 'harm', targetId: f.enemy.id },
            'pray_woven'
        )
        expect(plan?.targets).toEqual([
            { kind: 'restore', id: f.actor.id },
            { kind: 'harm', id: f.enemy.id },
        ])
        expect(plan?.manaCost).toBe(41)
        expect(f.actor.mana).toBe(79)
        const events = finish(f.actor, f.context)
        expect(events.filter((event) => event.kind === 'heal')).toHaveLength(1)
        expect(events.filter((event) => event.kind === 'damage')).toHaveLength(
            1
        )
        expect(f.ally.hp).toBe(f.ally.maxHp - 10)
    })

    it('does not use leftover cheap harm slots in ordinary prayer and refuses an unaffordable self-heal', () => {
        const f = emergency()
        f.actor.mana = 41
        const intent = { mode: 'harm', targetId: f.enemy.id } as const
        expect(
            planMotherPrayer(f.actor, intent, f.context, 'pray')?.targets
        ).toEqual([{ kind: 'restore', id: f.actor.id }])
        expect(
            planMotherPrayer(f.actor, intent, f.context, 'pray_woven')?.targets
        ).toHaveLength(2)
        f.actor.mana = 35
        const events = handleAbilityCommand(
            f.actor,
            { type: 'use_ability', abilityId: 'pray', intent },
            f.context
        )
        expect(events.some((event) => event.phase === 'started')).toBe(false)
        expect(f.actor.abilities.casting).toBeNull()
        expect(f.actor.mana).toBe(35)
    })
})
