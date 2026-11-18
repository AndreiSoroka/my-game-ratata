import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { cancelPrayerCast } from '../src/game/prayerCancellation'
import { prayerParameters } from '../src/game/prayerParameters'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

function woven(actor: ReturnType<typeof abilityHero>, rank = 1) {
    actor.abilities.known.add('pray_woven')
    for (const id of [
        'prayer.area',
        'prayer.harm',
        `prayer.targets${String(rank)}`,
    ]) {
        actor.progression.constellations.opened.add(id)
    }
}
function cast(
    actor: ReturnType<typeof abilityHero>,
    context: ReturnType<typeof abilityContext>,
    abilityId: 'pray' | 'pray_woven' = 'pray',
    intent = { mode: 'restore' as const, targetId: actor.id }
) {
    return handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId, intent },
        context
    )
}
function finish(
    actor: ReturnType<typeof abilityHero>,
    context: ReturnType<typeof abilityContext>,
    now = deadline(actor)
) {
    return advanceRevive(
        actor,
        (id) => context.characters.find((target) => target.id === id),
        now,
        context.random,
        { ...context, now }
    )
}

describe('frozen Mother prayer target plan', () => {
    it('keeps ordinary prayer homogeneous after all area/rank upgrades', () => {
        const actor = abilityHero()
        woven(actor, 3)
        actor.hp = 5
        const ally = abilityHero()
        ally.hp = 5
        const context = abilityContext([actor, ally])
        expect(cast(actor, context)[0]?.phase).toBe('started')
        expect(actor.mana).toBe(30)
        expect(actor.abilities.casting?.plan?.targets).toEqual([
            { kind: 'restore', id: actor.id },
            { kind: 'restore', id: ally.id },
        ])
        finish(actor, context)
        expect(actor.hp).toBe(9)
        expect(ally.hp).toBe(9)
    })
    it('shares a mixed Woven budget and pays only affordable recipients upfront', () => {
        const actor = abilityHero()
        woven(actor, 2)
        actor.mana = 10
        actor.hp = 5
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        const ally = abilityHero()
        ally.hp = 5
        const enemy = abilityHero('vanguard', 'undead')
        Object.assign(enemy, { faction: 'monsters' })
        const context = abilityContext([actor, corpse, ally, enemy])
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray_woven',
                intent: { mode: 'revive', targetId: corpse.id },
            },
            context
        )
        expect(actor.mana).toBe(0)
        expect(actor.abilities.casting?.plan?.targets).toEqual([
            { kind: 'revive', id: corpse.id },
            { kind: 'restore', id: ally.id },
        ])
        const events = finish(actor, context)
        expect(events.filter((event) => event.kind === 'revive')).toHaveLength(
            1
        )
        expect(corpse.hp).toBe(1)
        expect(ally.hp).toBe(9)
        expect(actor.hp).toBe(5)
        expect(enemy.hp).toBe(enemy.maxHp)
    })
    it('does not replace a lost secondary recipient or heal a revived target again', () => {
        const actor = abilityHero()
        woven(actor, 2)
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        const ally = abilityHero()
        ally.hp = 5
        const late = abilityHero()
        const context = abilityContext([actor, corpse, ally, late])
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray_woven',
                intent: { mode: 'revive', targetId: corpse.id },
            },
            context
        )
        ally.position.x += 100
        late.hp = 5
        const events = finish(actor, context)
        expect(corpse.hp).toBe(1)
        expect(late.hp).toBe(5)
        expect(
            events.filter(
                (event) => event.kind === 'heal' && event.targetId === corpse.id
            )
        ).toHaveLength(0)
    })
    it('uses the same accelerated channel and five-mana start payment for resurrection', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.focus')
        const corpse = abilityHero()
        corpse.applyDamage(corpse.hp, 0)
        const context = abilityContext([actor, corpse])
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'revive', targetId: corpse.id },
            },
            context
        )
        expect(actor.mana).toBe(35)
        expect(actor.abilities.casting?.completesAt).toBe(3700)
        finish(actor, context)
        expect(actor.mana).toBe(35)
        expect(corpse.alive).toBe(true)
    })
    it('freezes multipliers and target capacity when an opening occurs during a channel', () => {
        const actor = abilityHero()
        actor.hp = 5
        const context = abilityContext([actor])
        cast(actor, context)
        actor.progression.constellations.opened.add('prayer.gift1')
        actor.progression.constellations.opened.add('prayer.focus')
        expect(actor.abilities.casting?.completesAt).toBe(4000)
        finish(actor, context)
        expect(actor.hp).toBe(9)
    })
})

describe('Domain receipts and interrupted aura recovery', () => {
    it('pays five-mana aura-only casts and catches up five ticks once, including enemies', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.aura_domain')
        const enemy = abilityHero()
        Object.assign(enemy, { faction: 'monsters' })
        enemy.hp = 5
        const context = abilityContext([actor, enemy])
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'devotion' },
            },
            context
        )
        expect(actor.mana).toBe(35)
        finish(actor, context, 1500)
        expect(enemy.hp).toBe(10)
        expect(masteryExperience(actor)).toBe(prayerXp(36))
        finish(actor, context, 1500)
        expect(enemy.hp).toBe(10)
        finish(actor, context, 4000)
        expect(masteryExperience(actor)).toBe(prayerXp(36))
    })
    it('shares healing XP between Domain ticks and main healing and keeps channel at full HP', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.aura_domain')
        actor.hp -= 5
        const context = abilityContext([actor])
        cast(actor, context)
        finish(actor, context, 1500)
        expect(actor.hp).toBe(actor.maxHp)
        expect(actor.abilities.casting).not.toBeNull()
        finish(actor, context, 4000)
        expect(masteryExperience(actor)).toBe(prayerXp(36))
    })
    it('suppresses every aura after interruption until a later full Mother cast finishes', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.aura_domain')
        actor.hp = 5
        let context = abilityContext([actor])
        cast(actor, context)
        finish(actor, context, 1100)
        expect(actor.hp).toBe(6)
        cancelPrayerCast(actor, 1100)
        expect(actor.abilities.prayerAurasSuppressed).toBe(true)
        context = { ...context, now: 1200 }
        cast(actor, context)
        finish(actor, context, 1700)
        expect(actor.hp).toBe(6)
        finish(actor, context, 4200)
        expect(actor.abilities.prayerAurasSuppressed).toBe(false)
        context = { ...context, now: 4300 }
        cast(actor, context)
        finish(actor, context, 4400)
        expect(actor.hp).toBe(11)
    })
})

describe('Last Light frozen emergency profile', () => {
    it('forces self, charges30%maxMP per heal, and locks both actions after completion', () => {
        const actor = abilityHero()
        woven(actor, 2)
        actor.hp = 3
        actor.mana = 17
        actor.progression.constellations.opened.add('prayer.last_light')
        actor.progression.constellations.lowHpFromHostile = true
        actor.progression.constellations.hostileWound = 23
        const ally = abilityHero()
        ally.hp = 5
        const context = abilityContext([actor, ally])
        cast(actor, context, 'pray_woven', {
            mode: 'restore',
            targetId: ally.id,
        })
        expect(actor.mana).toBeCloseTo(5)
        expect(actor.abilities.casting?.plan?.targets).toEqual([
            { kind: 'restore', id: actor.id },
        ])
        const end = deadline(actor)
        expect(cancelPrayerCast(actor, 1100)).toEqual([])
        actor.tags.add('offline')
        actor.stunUntil = end + 5000
        finish(actor, context, end)
        expect(actor.hp).toBe(actor.maxHp)
        expect(actor.progression.prayerAvailableAt).toBe(end + 10000)
        expect(actor.abilities.availableAt.pray_woven).toBe(end + 10000)
    })
    it('cannot start if mandatory self healing is unaffordable', () => {
        const actor = abilityHero()
        actor.hp = 3
        actor.mana = 11
        actor.progression.constellations.opened.add('prayer.last_light')
        actor.progression.constellations.lowHpFromHostile = true
        actor.progression.constellations.hostileWound = 23
        const context = abilityContext([actor])
        cast(actor, context)
        expect(actor.abilities.casting).toBeNull()
        expect(actor.mana).toBe(11)
    })
    it('applies additive bonuses without increasing Domain ticks', () => {
        const actor = abilityHero()
        for (const id of [
            'prayer.focus',
            'prayer.concentration',
            'prayer.absolute_concentration',
            'prayer.hasty_harm',
            'prayer.martyr',
            'prayer.last_light',
        ]) {
            actor.progression.constellations.opened.add(id)
        }
        actor.hp = 1
        actor.progression.constellations.lowHpFromHostile = true
        actor.progression.constellations.hostileWound = 5
        expect(prayerParameters(actor).durationMs).toBe(600)
    })
    it('death terminates emergency prayer and preserves its cooldown', () => {
        const actor = abilityHero()
        actor.hp = 3
        actor.progression.constellations.opened.add('prayer.last_light')
        actor.progression.constellations.lowHpFromHostile = true
        actor.progression.constellations.hostileWound = 23
        const attacker = abilityHero('vanguard', 'undead')
        Object.assign(attacker, { faction: 'monsters' })
        const context = abilityContext([actor, attacker])
        cast(actor, context)
        resolveCharacterDamage({
            actor: attacker,
            target: actor,
            amount: 100,
            now: 1200,
            damageKind: 'physical',
            respawnDelayMs: 15000,
        })
        expect(actor.abilities.casting).toBeNull()
        expect(actor.progression.prayerAvailableAt).toBe(11200)
    })
})

function deadline(actor: ReturnType<typeof abilityHero>): number {
    const cast = actor.abilities.casting
    if (cast === null) {
        throw new Error('Expected active prayer')
    }
    return cast.completesAt
}

it('uses the common paid channel with exactly5MP and authoritative context recovery', () => {
    const actor = abilityHero()
    const corpse = abilityHero()
    corpse.applyDamage(corpse.hp, 0)
    const context = abilityContext([actor, corpse])
    actor.mana = 5
    expect(beginRevive(actor, corpse, 1000, context)).toBe(true)
    expect(actor.mana).toBe(0)
    expect(actor.abilities.casting?.plan?.targets).toEqual([
        { kind: 'revive', id: corpse.id },
    ])
    const result = advanceRevive(
        actor,
        (id) => (id === corpse.id ? corpse : undefined),
        4000,
        () => 0
    )
    expect(result.some((event) => event.kind === 'revive')).toBe(true)
    expect(actor.mana).toBe(0)
})

it('does not permit another ability while a due LastLight cast awaits resolution', () => {
    const actor = abilityHero()
    actor.hp = 3
    actor.abilities.known.add('barrier')
    actor.progression.constellations.opened.add('prayer.last_light')
    actor.progression.constellations.lowHpFromHostile = true
    actor.progression.constellations.hostileWound = 23
    const context = abilityContext([actor])
    cast(actor, context)
    const end = deadline(actor)
    const mana = actor.mana
    const events = handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'barrier' },
        { ...context, now: end + 1 }
    )
    expect(events[0]?.kind).toBe('notice')
    expect(actor.abilities.barrier).toBeNull()
    expect(actor.mana).toBe(mana)
    expect(actor.abilities.casting?.plan?.lastLight).toBe(true)
})
