import type { PrayerActionId, PrayerIntent } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { AbilityContext } from '../src/game/abilityContext'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { applyAttackStun } from '../src/game/combatDamage'
import { advanceCharacter } from '../src/game/movement'
import { PartyService } from '../src/game/parties'
import { validatePrayerChannel } from '../src/game/prayer'
import {
    bindPrayerAuraEnvironment,
    canPerceivePrayerCaster,
    hasPrayerAdvantage,
    prayerAuraEffects,
} from '../src/game/prayerAuras'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

function start(
    actor: GameCharacter,
    context: AbilityContext,
    intent: PrayerIntent,
    abilityId: PrayerActionId = 'pray'
) {
    expect(
        handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId, intent },
            context
        )[0]?.phase
    ).toBe('started')
    const cast = actor.abilities.casting
    if (cast === null) {
        throw new Error('Expected a paid channel')
    }
    return cast
}

function finish(actor: GameCharacter, context: AbilityContext, now: number) {
    return advanceRevive(
        actor,
        (id) => context.characters.find((target) => target.id === id),
        now,
        context.random,
        { ...context, now }
    )
}

function invite(
    party: PartyService,
    leader: GameCharacter,
    target: GameCharacter,
    characters: GameCharacter[]
) {
    party.handle(
        leader,
        { type: 'party_invite', targetId: target.id },
        characters,
        30000
    )
    const invitation = party.snapshot(target.id).invitations[0]
    if (invitation === undefined) {
        throw new Error('Missing party invitation')
    }
    party.handle(
        target,
        { type: 'party_answer', invitationId: invitation.id, accept: true },
        characters,
        30000
    )
    expect(party.sameParty(leader.id, target.id)).toBe(true)
}

function enableWoven(actor: GameCharacter, rank = 2) {
    actor.abilities.known.add('pray_woven')
    for (const id of ['prayer.area', `prayer.targets${String(rank)}`]) {
        actor.progression.constellations.opened.add(id)
    }
}

describe('real prayer fields during resolved effects', () => {
    it('keeps Domain vulnerability on its final Kara even when lifecycle processes a late deadline', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.aura_domain')
        actor.progression.constellations.opened.add('prayer.harm')
        const target = abilityHero('vanguard', 'undead')
        Object.assign(target, { faction: 'monsters' })
        const context = abilityContext([actor, target], 30000, () => 0)
        const cast = start(actor, context, {
            mode: 'harm',
            targetId: target.id,
        })
        const hp = target.hp
        const events = finish(actor, context, cast.completesAt + 50)
        expect(events).toContainEqual(
            expect.objectContaining({
                kind: 'damage',
                amount: 9,
                targetId: target.id,
            })
        )
        expect(target.hp).toBe(hp - 9)
        expect(actor.mana).toBe(115)
        expect(masteryExperience(actor)).toBe(prayerXp(70))
    })

    it('lets the protection field give a living enemy the same real dodge check', () => {
        const source = abilityHero()
        source.progression.constellations.opened.add('prayer.aura_protection')
        const attacker = abilityHero('vanguard')
        const target = abilityHero('vanguard')
        Object.assign(target, { faction: 'monsters' })
        target.position = { x: 100, y: 112 }
        target.config.combat.dodgeChance = 0
        const context = abilityContext([source, attacker, target], 30000)
        start(source, context, { mode: 'devotion' })
        const attackContext = {
            actor: attacker,
            targets: context.characters,
            targetId: target.id,
            now: 30100,
            navigation: context.navigation,
            tileSize: 16,
            respawnDelayMsFor: () => 15000,
            random: () => 0.05,
        }
        expect(attemptAttack(attackContext)[0]?.kind).toBe('attack')
        const pending = attacker.pendingAttack
        if (pending === undefined) {
            throw new Error('Expected a pending hit')
        }
        const events = resolvePendingAttackHit({
            ...attackContext,
            now: pending.hitAt,
        })
        expect(events).toContainEqual(
            expect.objectContaining({
                kind: 'miss',
                targetId: target.id,
                text: 'Уклонение',
            })
        )
        expect(target.hp).toBe(target.maxHp)
    })
})

describe('real party prayer checks', () => {
    it('expires outgoing blessing at the exact deadline before or after lifecycle releases its source', () => {
        const source = abilityHero()
        source.progression.constellations.opened.add('prayer.aura_blessing')
        const recipient = abilityHero()
        const characters = [source, recipient]
        const context = abilityContext(characters, 30000)
        const party = new PartyService()
        invite(party, source, recipient, characters)
        bindPrayerAuraEnvironment(characters, {
            characters: () => characters,
            navigationFor: () => context.navigation,
            sameParty: (a, b) => party.sameParty(a, b),
        })
        const cast = start(source, context, { mode: 'devotion' })
        expect(hasPrayerAdvantage(recipient, cast.completesAt - 1)).toBe(true)
        expect(hasPrayerAdvantage(recipient, cast.completesAt)).toBe(false)
        finish(source, context, cast.completesAt)
        expect(hasPrayerAdvantage(recipient, cast.completesAt)).toBe(false)
    })

    it('uses actual party membership for a shared favorable prayer sample and separate Angelic checks', () => {
        const source = abilityHero()
        const actor = abilityHero()
        const first = abilityHero()
        const second = abilityHero()
        const characters = [source, actor, first, second]
        const party = new PartyService()
        invite(party, source, actor, characters)
        source.progression.constellations.opened.add('prayer.aura_blessing')
        // The source begins later, so its field survives the other caster's deadline.
        const context = abilityContext(characters, 30000)
        bindPrayerAuraEnvironment(characters, {
            characters: () => characters,
            navigationFor: () => context.navigation,
            sameParty: (a, b) => party.sameParty(a, b),
        })
        enableWoven(actor)
        actor.progression.constellations.opened.add('prayer.revive_angelic')
        first.applyDamage(first.hp, 30000)
        second.applyDamage(second.hp, 30000)
        const samples = [0.9, 0, 0.9, 0.1, 0.9, 0.9]
        let index = 0
        const random = vi.fn(() => samples[index++] ?? 0.99)
        const actualContext = { ...context, random }
        const cast = start(
            actor,
            actualContext,
            { mode: 'revive', targetId: first.id },
            'pray_woven'
        )
        start(source, { ...context, now: 30100 }, { mode: 'devotion' })
        expect(hasPrayerAdvantage(source, 30100)).toBe(false)
        expect(hasPrayerAdvantage(actor, 30100)).toBe(true)
        const events = finish(actor, actualContext, cast.completesAt)
        expect(events.filter((event) => event.kind === 'revive')).toHaveLength(
            2
        )
        expect(first.hp).toBe(Math.ceil(first.maxHp * 1.5))
        expect(second.hp).toBe(1)
        // Success uses two samples once, then Angelic uses two samples per soul.
        // Later random star allocations are not included in these first six samples.
        expect(random.mock.calls.length).toBeGreaterThanOrEqual(6)
        expect(actor.mana).toBe(110)
    })
})

describe('channel target perception revalidation', () => {
    it('interrupts an undead caster when its explicitly pinned recipient becomes unseen during the channel', () => {
        const caster = abilityHero('cleric', 'undead')
        const recipient = abilityHero()
        recipient.hp -= 10
        for (const id of ['prayer.ward1', 'prayer.ward2', 'prayer.ward3']) {
            recipient.progression.constellations.opened.add(id)
        }
        const context = abilityContext([caster, recipient], 30000)
        start(caster, context, { mode: 'restore', targetId: recipient.id })
        start(
            recipient,
            { ...context, now: 30100 },
            { mode: 'ward', targetId: caster.id }
        )
        expect(canPerceivePrayerCaster(caster, recipient, 30101)).toBe(false)
        expect(validatePrayerChannel(caster, 30101, context)).toContainEqual(
            expect.objectContaining({ phase: 'interrupted' })
        )
        expect(caster.abilities.casting).toBeNull()
        expect(caster.mana).toBe(115)
        expect(masteryExperience(caster)).toBe(prayerXp(0))
    })

    it('uses the ordinary spell action random source for concentration resistance', () => {
        const caster = abilityHero()
        caster.hp = 10
        for (const id of ['prayer.focus', 'prayer.concentration']) {
            caster.progression.constellations.opened.add(id)
        }
        const attacker = abilityHero('arcanist')
        attacker.abilities.known.add('fireball')
        Object.assign(attacker, { faction: 'monsters' })
        const random = vi.fn(() => 0.1)
        const context = abilityContext([caster, attacker], 30000, random)
        start(caster, context, { mode: 'restore', targetId: caster.id })
        const unrelated = vi.spyOn(Math, 'random').mockReturnValue(0.9)
        try {
            const events = handleAbilityCommand(
                attacker,
                {
                    type: 'use_ability',
                    abilityId: 'fireball',
                    targetId: caster.id,
                },
                { ...context, now: 30100 }
            )
            expect(events).toContainEqual(
                expect.objectContaining({ kind: 'damage', targetId: caster.id })
            )
            expect(caster.abilities.casting).not.toBeNull()
            expect(random).toHaveBeenCalledTimes(1)
        } finally {
            unrelated.mockRestore()
        }
    })
})

describe('pending personal protection and fractional damage', () => {
    it('retains Absolute protection after the deadline until resolution, while outgoing auras expire', () => {
        const actor = abilityHero()
        actor.hp = 20
        for (const id of [
            'prayer.focus',
            'prayer.concentration',
            'prayer.absolute_concentration',
            'prayer.aura_protection',
        ]) {
            actor.progression.constellations.opened.add(id)
        }
        const attacker = abilityHero('vanguard', 'undead')
        Object.assign(attacker, { faction: 'monsters' })
        const neighbor = abilityHero()
        const context = abilityContext([actor, attacker, neighbor], 30000)
        const cast = start(actor, context, {
            mode: 'restore',
            targetId: actor.id,
        })
        const hitAt = cast.completesAt + 50
        expect(prayerAuraEffects(neighbor, hitAt).dodgeBonus).toBe(0)
        resolveCharacterDamage({
            actor: attacker,
            target: actor,
            amount: 0.25,
            damageKind: 'physical',
            now: hitAt,
            respawnDelayMs: 15000,
        })
        expect(actor.hp).toBe(19.75)
        expect(actor.abilities.casting).toBe(cast)
        expect(
            applyAttackStun(
                attacker,
                actor,
                {
                    abilityId: 'skeleton_strike',
                    canStun: true,
                    damageMultiplier: 1,
                    hitAt,
                    targetEnergyDrain: 0,
                },
                hitAt,
                () => 0
            )
        ).toEqual([])
        expect(finish(actor, context, hitAt)).toContainEqual(
            expect.objectContaining({ phase: 'completed' })
        )
    })

    it('preserves fractional ordinary damage and multiplies it once inside a real Domain field', () => {
        const actor = abilityHero()
        actor.progression.constellations.opened.add('prayer.aura_domain')
        const attacker = abilityHero('vanguard')
        const target = abilityHero('vanguard', 'undead')
        Object.assign(target, { faction: 'monsters' })
        const context = abilityContext([actor, attacker, target], 30000)
        const input = {
            actor: attacker,
            target,
            amount: 0.25,
            damageKind: 'physical' as const,
            now: 30000,
            respawnDelayMs: 15000,
        }
        expect(resolveCharacterDamage(input).hpDamage).toBe(0.25)
        start(actor, context, { mode: 'devotion' })
        expect(resolveCharacterDamage({ ...input, now: 30100 }).hpDamage).toBe(
            0.375
        )
        expect(target.hp).toBe(target.maxHp - 0.625)
    })
})

it('blocks a channelled Kara when Ward4 makes a trapped undead unable to attack anyone', () => {
    const actor = abilityHero('cleric', 'undead')
    const source = abilityHero()
    const target = abilityHero('vanguard', 'undead')
    Object.assign(target, { faction: 'monsters' })
    actor.progression.constellations.opened.add('prayer.harm')
    for (const id of [
        'prayer.ward1',
        'prayer.ward2',
        'prayer.ward3',
        'prayer.ward4',
    ]) {
        source.progression.constellations.opened.add(id)
    }
    const context = abilityContext([actor, source, target], 1000)
    start(actor, context, { mode: 'harm', targetId: target.id })
    start(
        source,
        { ...context, now: 1500 },
        { mode: 'ward', targetId: actor.id }
    )
    // Real collision prevents the forced escape from displacing the channelled actor.
    for (const [x, y] of [
        [5, 6],
        [7, 6],
        [6, 5],
        [6, 7],
    ] as const) {
        context.navigation.grid.solid[y * 32 + x] = true
    }
    const position = { ...actor.position }
    advanceCharacter({
        character: actor,
        navigation: context.navigation,
        now: 2000,
        deltaMs: 50,
    })
    expect(actor.position).toEqual(position)
    expect(source.abilities.casting?.completesAt).toBe(4500)
    expect(prayerAuraEffects(actor, 4000).feared).toBe(true)
    const events = finish(actor, context, 4000)
    expect(events).toContainEqual(
        expect.objectContaining({ phase: 'completed' })
    )
    expect(events.filter((event) => event.kind === 'damage')).toEqual([])
    expect(target.hp).toBe(target.maxHp)
    expect(masteryExperience(actor)).toBe(prayerXp(0))
})
