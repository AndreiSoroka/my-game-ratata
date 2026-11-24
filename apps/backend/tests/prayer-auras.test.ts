import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { AdventureService } from '../src/game/adventure'
import type { GameCharacter } from '../src/game/character'
import type { PendingAttackHit } from '../src/game/characterState'
import { attemptAbilityAttack, attemptAttack } from '../src/game/combat'
import { applyAttackStun, resolveAttackDamage } from '../src/game/combatDamage'
import { defendContact } from '../src/game/combatDefense'
import { takeSparkInterruptions } from '../src/game/combatInterruption'
import { observeCombatEvent } from '../src/game/combatObservation'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { PartyService } from '../src/game/parties'
import {
    activePrayerAuras,
    bindPrayerAuraEnvironment,
    canPerceivePrayerCaster,
    type MotherPrayerAuraState,
    prayerAuraEffects,
    prayerDamageInterrupts,
} from '../src/game/prayerAuras'
import { createSnapshot, findVisibleTarget } from '../src/game/queries'
import { roomSnapshot } from '../src/game/roomSnapshot'
import { TheftService } from '../src/game/theft'
import { WorldLocations } from '../src/game/worldLocations'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { theftFixture } from './theftFixtures'

function channel(
    actor: GameCharacter,
    overrides: Partial<MotherPrayerAuraState> = {}
) {
    const state: MotherPrayerAuraState = {
        radius: 80,
        wardRank: 0,
        wardTargetIds: [],
        protection: false,
        blessing: false,
        domain: false,
        absolute: false,
        concentrationChance: 0,
        aurasEnabled: true,
        lastLight: false,
        ...overrides,
    }
    actor.abilities.casting = {
        mode: 'prayer',
        abilityId: 'pray',
        targetId: actor.id,
        receiptId: `${actor.id}:test`,
        startedAt: 0,
        completesAt: 10000,
        patron: 'hearth',
        intent: { mode: 'restore', targetId: actor.id },
        origin: { ...actor.position },
        locationId: actor.locationId,
        hpAtStart: actor.hp,
        mother: state,
    }
    return state
}

function fixture() {
    const source = abilityHero()
    const living = abilityHero('vanguard')
    const undead = abilityHero('vanguard', 'undead')
    living.position = { x: 120, y: 100 }
    undead.position = { x: 140, y: 100 }
    Object.assign(undead, { faction: 'monsters' })
    undead.reputation.peaceful = -100
    const characters = [source, living, undead]
    const context = abilityContext(characters)
    bindPrayerAuraEnvironment(characters, {
        characters: () => characters,
        navigationFor: () => context.navigation,
        sameParty: (a, b) => a !== b,
    })
    return { source, living, undead, characters, context }
}

const attack: PendingAttackHit = {
    canStun: true,
    damageMultiplier: 1,
    hitAt: 1000,
    targetEnergyDrain: 0,
}

it('projects only active aura IDs to their own character even when the aura source is hidden', () => {
    const { source, living, undead, characters, context } = fixture()
    channel(source, {
        wardRank: 4,
        wardTargetIds: [undead.id],
        protection: true,
        blessing: true,
        domain: true,
    })
    const state = {
        adventure: new AdventureService(),
        characters: new Map(characters.map((actor) => [actor.id, actor])),
        parties: new PartyService(),
        theft: new TheftService(),
        tick: 0,
        world: new WorldLocations(
            new NavigationService({
                ...context.navigation.grid,
                id: 'prayer-aura-snapshot-test',
            })
        ),
    }
    const forUndead = roomSnapshot(state, 1000, undead.locationId, undead.id)
    expect(forUndead.characters.map(({ id }) => id)).not.toContain(source.id)
    expect(
        forUndead.characters.find(({ id }) => id === undead.id)
    ).toMatchObject({
        prayerAuraEffects: [
            'weakened',
            'slowed',
            'feared',
            'prayer-blessing',
            'prayer-vulnerability',
        ],
    })
    const forLiving = roomSnapshot(state, 1000, living.locationId, living.id)
    expect(forLiving.characters.map(({ id }) => id)).toEqual(
        expect.arrayContaining([source.id, undead.id])
    )
    expect(
        forLiving.characters.find(({ id }) => id === living.id)
    ).toMatchObject({
        prayerAuraEffects: ['prayer-protection', 'prayer-blessing'],
    })
    expect(
        forLiving.characters.find(({ id }) => id === undead.id)
    ).not.toHaveProperty('prayerAuraEffects')
    expect(
        forLiving.characters.find(({ id }) => id === source.id)
    ).not.toHaveProperty('prayerAuraEffects')
    expect(
        roomSnapshot(
            state,
            10_000,
            undead.locationId,
            undead.id
        ).characters.find(({ id }) => id === undead.id)
    ).not.toHaveProperty('prayerAuraEffects')
})

describe('shared continuous prayer effects', () => {
    it('protects living enemies as well as friends, blesses party undead, and excludes its own source from advantage', () => {
        const { source, living, undead } = fixture()
        const state = channel(source, { protection: true, blessing: true })
        Object.assign(living, { faction: 'monsters' })
        expect(prayerAuraEffects(living, 1000)).toMatchObject({
            dodgeBonus: 0.1,
            advantage: true,
        })
        expect(prayerAuraEffects(undead, 1000)).toMatchObject({
            dodgeBonus: 0,
            advantage: true,
        })
        expect(prayerAuraEffects(source, 1000).advantage).toBe(false)
        state.aurasEnabled = false
        expect(prayerAuraEffects(living, 1000)).toMatchObject({
            dodgeBonus: 0,
            advantage: false,
        })
    })

    it('uses actual party membership and line of sight, with no stacking from overlapping fields', () => {
        const { source, living, undead, characters, context } = fixture()
        channel(source, { protection: true, blessing: true })
        channel(undead, { protection: true, blessing: true })
        bindPrayerAuraEnvironment(characters, {
            characters: () => characters,
            navigationFor: () => context.navigation,
            sameParty: () => false,
        })
        expect(prayerAuraEffects(living, 1000)).toMatchObject({
            dodgeBonus: 0.1,
            advantage: false,
        })
        source.position = { x: 80, y: 100 }
        undead.abilities.casting = null
        for (let y = 0; y < 32; y += 1) {
            context.navigation.grid.solid[y * 32 + 6] = true
        }
        expect(prayerAuraEffects(living, 1000).dodgeBonus).toBe(0)
    })

    it('caps dodge before the favorable double roll without rerolling damage amounts', () => {
        const { source, living } = fixture()
        channel(source, { protection: true, blessing: true })
        living.config.combat.dodgeChance = 0.94
        let draws = 0
        const rolls = [0.99, 0.94]
        expect(
            defendContact(
                source,
                living,
                attack,
                1000,
                () => rolls[draws++] ?? 0.99
            ).outcome
        ).toBe('dodge')
        expect(draws).toBe(2)
        living.config.combat.minDamage = 2
        living.config.combat.maxDamage = 8
        living.config.combat.critChance = 0.1
        const damageRolls = [0.5, 0.8, 0.05]
        draws = 0
        expect(
            resolveAttackDamage(
                living,
                attack,
                () => damageRolls[draws++] ?? 0.99,
                1000
            )
        ).toMatchObject({ critical: true })
        expect(draws).toBe(3)
    })

    it('uses an authored minimum roll without criticals and applies domain damage once before the barrier', () => {
        const { source, living, undead } = fixture()
        channel(source, {
            wardRank: 1,
            wardTargetIds: [undead.id],
            domain: true,
        })
        undead.config.combat.minDamage = 2
        undead.config.combat.maxDamage = 8
        undead.config.combat.critChance = 0.95
        undead.config.combat.damageMultiplier = 1
        expect(
            resolveAttackDamage(
                undead,
                { ...attack, damageMultiplier: 2 },
                () => 0,
                1000
            )
        ).toMatchObject({ amount: 4, critical: false })
        undead.mana = 5
        undead.abilities.barrier = {
            expiresAt: 2000,
            practiced: false,
        }
        const hp = undead.hp
        expect(
            resolveCharacterDamage({
                actor: living,
                target: undead,
                amount: 4,
                now: 1000,
                damageKind: 'physical',
                respawnDelayMs: 10000,
            })
        ).toMatchObject({ absorbed: 5, hpDamage: 1 })
        expect(undead.hp).toBe(hp - 1)
    })
})

describe('personal channel protection', () => {
    it('retains personal concentration while auras are suppressed and gives Absolute full stun immunity', () => {
        const { source, undead } = fixture()
        channel(source, { concentrationChance: 0.5, aurasEnabled: false })
        expect(prayerDamageInterrupts(source, 1000, () => 0.1)).toBe(false)
        expect(prayerDamageInterrupts(source, 1000, () => 0.9)).toBe(true)
        const damage = {
            actor: undead,
            target: source,
            amount: 1,
            now: 1000,
            damageKind: 'physical' as const,
            respawnDelayMs: 10000,
            random: () => 0.1,
        }
        resolveCharacterDamage(damage)
        expect(source.abilities.casting).not.toBeNull()
        expect(
            applyAttackStun(
                undead,
                source,
                { ...attack, abilityId: 'skeleton_strike' },
                1000,
                () => 0
            )
        ).toHaveLength(1)
        source.stunUntil = 0
        channel(source, { absolute: true, aurasEnabled: false })
        expect(
            applyAttackStun(
                undead,
                source,
                { ...attack, abilityId: 'skeleton_strike' },
                1000,
                () => 0
            )
        ).toEqual([])
        expect(source.stunUntil).toBe(0)
    })

    it('keeps Last Light channels and their fields while the source is an offline stunned Echo', () => {
        const { source, living } = fixture()
        channel(source, { lastLight: true, protection: true })
        source.tags.add('offline')
        source.stunUntil = 3000
        expect(activePrayerAuras(source, 1000)).toBeDefined()
        expect(prayerAuraEffects(living, 1000).dodgeBonus).toBe(0.1)
        expect(prayerDamageInterrupts(source, 1000)).toBe(false)
    })
})

describe('shared undead perception and fear', () => {
    it('hides the channeling caster from selected undead in queries, snapshots and event metadata', () => {
        const { source, undead, living, characters, context } = fixture()
        channel(source, { wardRank: 3, wardTargetIds: [undead.id] })
        expect(canPerceivePrayerCaster(undead, source, 1000)).toBe(false)
        expect(
            findVisibleTarget([source], context.navigation, undead, 200, 1000)
        ).toBeUndefined()
        expect(
            createSnapshot(
                characters,
                [],
                [],
                1,
                1000,
                context.navigation,
                undead.id
            ).characters.map((c) => c.id)
        ).not.toContain(source.id)
        expect(
            createSnapshot(
                characters,
                [],
                [],
                1,
                1000,
                context.navigation,
                living.id
            ).characters.map((c) => c.id)
        ).toContain(source.id)
        expect(
            observeCombatEvent(
                {
                    kind: 'damage',
                    actorId: source.id,
                    targetId: undead.id,
                    amount: 1,
                },
                {
                    observer: undead,
                    getCharacter: (id) => characters.find((c) => c.id === id),
                    navigation: context.navigation,
                    now: 1000,
                }
            )?.actorId
        ).toBeUndefined()
        const base = {
            actor: undead,
            targets: characters,
            now: 1000,
            tileSize: 16,
            navigation: context.navigation,
            respawnDelayMsFor: () => 10000,
        }
        expect(attemptAttack({ ...base, targetId: source.id })).toEqual([])
        expect(attemptAttack(base)).not.toEqual([])
    })
})

it.each(['network_player', 'scripted'] as const)(
    'slows and forces %s undead to leave while preventing reentry',
    (kind) => {
        const { source, undead, context } = fixture()
        Object.assign(undead, { controllerKind: kind })
        undead.abilities.known.add('spark')
        undead.mana = 6
        const spark = attemptAbilityAttack(
            {
                actor: undead,
                now: 1000,
                targets: [],
                tileSize: 16,
                respawnDelayMsFor: () => 10_000,
            },
            'spark'
        )[0]
        expect(spark?.phase).toBe('started')
        channel(source, {
            radius: 50,
            wardRank: 4,
            wardTargetIds: [undead.id],
        })
        undead.position = { x: 140, y: 100 }
        undead.setMoveInput({ x: -1, y: 0 })
        undead.lockAction(1000, 5000)
        advanceCharacter({
            character: undead,
            navigation: context.navigation,
            now: 2000,
            deltaMs: 1000,
        })
        expect(takeSparkInterruptions([undead])).toEqual([
            expect.objectContaining({
                kind: 'attack',
                phase: 'interrupted',
                actionId: spark?.actionId,
            }),
        ])
        expect(undead.position.x).toBeGreaterThan(140)
        expect(undead.position.x).toBeLessThanOrEqual(
            140 + undead.config.moveSpeed * 0.1
        )
        expect(
            attemptAttack({
                actor: undead,
                targets: [source],
                now: 2000,
                tileSize: 16,
                navigation: context.navigation,
                respawnDelayMsFor: () => 10000,
            })
        ).toEqual([])
        undead.position = { x: 160, y: 100 }
        undead.actionLockUntil = 0
        advanceCharacter({
            character: undead,
            navigation: context.navigation,
            now: 3000,
            deltaMs: 1000,
        })
        expect(undead.position.x).toBeGreaterThan(150)
    }
)

describe('opposed theft advantage', () => {
    it.each([
        [true, false, [0.1, 0.99, 0.99, 0], 'stolen'],
        [false, true, [0.99, 0.1], 'caught'],
        [true, true, [0.99, 0.99, 0], 'stolen'],
        [true, true, [0.1, 0.99], 'caught'],
    ] as const)(
        'handles thief=%s and victim=%s',
        (thiefBlessed, victimBlessed, rolls, expected) => {
            const f = theftFixture()
            const first = abilityHero()
            const second = abilityHero()
            f.characters.push(first, second)
            channel(first, { blessing: thiefBlessed })
            channel(second, { blessing: victimBlessed })
            bindPrayerAuraEnvironment(f.characters, {
                characters: () => f.characters,
                navigationFor: () => f.navigation,
                sameParty: (a, b) =>
                    (a === first.id && b === f.actor.id) ||
                    (a === second.id && b === f.victim.id),
            })
            f.attempt([...rolls])
            expect(
                f.service.snapshot(f.actor.id, f.actor.id, 1000).lastResult
                    ?.outcome
            ).toBe(expected)
        }
    )
})
