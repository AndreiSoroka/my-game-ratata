import {
    ABILITY_DEFINITIONS,
    ASH_RULES,
    type CharacterFactionId,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { OnProjectileRelease } from '../src/game/abilityContext'
import { snapshotAbilities } from '../src/game/abilityState'
import {
    curseWithAshExhaustion,
    expireAshExhaustion,
    snapshotAshExhaustion,
} from '../src/game/ashExhaustion'
import { AshRites } from '../src/game/ashRites'
import { GameCharacter } from '../src/game/character'
import { observeCharacterCombat } from '../src/game/combatObservation'
import { CompanionService } from '../src/game/companions'
import { syncAbilityConstellations } from '../src/game/constellations'
import {
    effectiveMaxEnergy,
    effectiveMaxMana,
} from '../src/game/effectiveResources'
import { MagicCombat } from '../src/game/magicCombat'
import { setDeclaredHostility } from '../src/game/personalHostility'
import { cancelPrayerForMovement } from '../src/game/prayerCancellation'
import { abilityContext, abilityHero } from './abilityTestHelpers'

const abilityId = 'ash_exhaustion'
const beforeRelease = 29_000
const definition = ABILITY_DEFINITIONS[abilityId]
const releasedAt = beforeRelease + definition.windupMs
const contactAt = releasedAt + 1_000
const weapon = ASH_RULES.exhaustion

function enemy(
    id: string,
    x = 145,
    faction: CharacterFactionId = 'monsters'
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        faction,
        controllerKind: 'scripted',
        spawnPosition: { x, y: 100 },
    })
}

function fixture(
    random = () => 0,
    extras: GameCharacter[] = [],
    target = enemy('target')
) {
    const actor = abilityHero('vanguard')
    actor.progression.masteries.prayer_grave.level = 5
    actor.abilities.known.add('pray_grave')
    syncAbilityConstellations(actor)
    const characters = [actor, target, ...extras]
    const magic = new MagicCombat()
    const onProjectileRelease = vi.fn<OnProjectileRelease>()
    const getContext = (now: number) => ({
        ...baseContext,
        magic,
        now,
        onProjectileRelease,
    })
    const baseContext = abilityContext(characters, beforeRelease, random)
    const rites = new AshRites(
        () => {
            throw new Error(
                'The projectile uses location geometry from its ability context'
            )
        },
        new Map(characters.map((character) => [character.id, character])),
        new Map(),
        new CompanionService(),
        () => []
    )
    const cast = () =>
        handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId, targetId: target.id },
            { ...getContext(beforeRelease), useAshRite: rites.use }
        )
    return {
        actor,
        target,
        cast,
        navigation: baseContext.navigation,
        magic,
        onProjectileRelease,
        advanceCast: (now: number) =>
            rites.advanceExhaustionCasts(() => getContext(now)),
        advanceProjectile: (now: number) =>
            magic.advance(now, () => getContext(now)),
    }
}

function expectStarted(scenario: ReturnType<typeof fixture>) {
    expect(scenario.cast()).toMatchObject([
        { kind: 'cast', abilityId, phase: 'started', durationMs: 2_000 },
    ])
}

describe('Тленный сгусток', () => {
    it('pays on release, drains each resource on impact and learns from meaningful PvE damage', () => {
        const f = fixture(() => 0.9)
        const mana = f.actor.mana
        const { hp, mana: targetMana, energy } = f.target
        expectStarted(f)
        expect(snapshotAbilities(f.actor, beforeRelease).ashCasting).toEqual({
            abilityId,
            targetId: f.target.id,
            startedAt: beforeRelease,
            completesAt: releasedAt,
        })
        expect(f.advanceCast(releasedAt - 1)).toEqual([])
        expect(f.onProjectileRelease).not.toHaveBeenCalled()
        expect(f.actor.mana).toBe(mana)
        expect(f.advanceCast(releasedAt)).toMatchObject([
            { kind: 'cast', abilityId, phase: 'completed' },
            {
                kind: 'attack',
                abilityId,
                delivery: 'magic',
                damageKind: 'unholy',
            },
        ])
        expect(f.actor.mana).toBe(mana - 12)
        expect(f.actor.abilities.availableAt[abilityId]).toBe(
            releasedAt + 10_000
        )
        expect(f.magic.isWindingUp(f.actor)).toBe(false)
        expect(
            f.magic.effectsFor(f.actor.locationId, releasedAt)
        ).toMatchObject([{ abilityId, phase: 'flight' }])
        expect(f.target.hp).toBe(hp)
        const beforePractice =
            f.actor.progression.masteries.prayer_grave.experience
        expect(f.advanceProjectile(contactAt)).toContainEqual(
            expect.objectContaining({ kind: 'damage', abilityId, amount: 12 })
        )
        expect(f.target.hp).toBe(hp - 12)
        expect(f.target.mana).toBe(targetMana - 12)
        expect(f.target.energy).toBe(energy - 12)
        expect(snapshotAshExhaustion(f.target, contactAt)).toBeUndefined()
        expect(
            f.actor.progression.masteries.prayer_grave.experience
        ).toBeGreaterThan(beforePractice)
        expect(f.advanceProjectile(contactAt + 1)).toEqual([])
        expect(f.onProjectileRelease).toHaveBeenCalledExactlyOnceWith(
            f.actor,
            f.actor.position
        )
    })

    it('uses the Keeper’s mood at impact and rank at release, even through a barrier', () => {
        const f = fixture(() => 0.5)
        const { hp, mana } = f.target
        expectStarted(f)
        f.advanceCast(releasedAt)
        f.actor.progression.masteries.prayer_grave.level = 9
        syncAbilityConstellations(f.actor)
        f.target.abilities.barrier = {
            expiresAt: contactAt + 1,
            practiced: false,
        }
        expect(f.advanceProjectile(contactAt)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ kind: 'absorb', amount: 12 }),
                expect.objectContaining({
                    kind: 'status',
                    statusId: abilityId,
                    audienceIds: [f.target.id],
                }),
            ])
        )
        expect(f.target.maxHp).toBe(Math.floor(hp * 0.7 + 1e-10))
        expect(f.target.hp).toBe(f.target.maxHp)
        expect(f.target.mana).toBe(mana - 24)
        expect(snapshotAshExhaustion(f.target, contactAt)).toEqual({
            rank: 2,
            expiresAt: contactAt + weapon.durationMs,
        })
    })

    it('can hit a declared enemy without awarding PvE prayer mastery', () => {
        const f = fixture(undefined, [], enemy('target', 145, 'peaceful'))
        setDeclaredHostility(f.actor, f.target, true)
        const practice = f.actor.progression.masteries.prayer_grave.experience
        expectStarted(f)
        f.advanceCast(releasedAt)
        expect(f.advanceProjectile(contactAt)).toContainEqual(
            expect.objectContaining({ kind: 'damage', abilityId, amount: 12 })
        )
        expect(f.actor.progression.masteries.prayer_grave.experience).toBe(
            practice
        )
    })
})

describe('Подготовка и полёт Тленного сгустка', () => {
    it('projects the cast to an observer without revealing a hidden target', () => {
        const f = fixture()
        const observer = abilityHero('vanguard')
        observer.position.x = 350
        expectStarted(f)
        f.target.movement.mode = 'sneaking'
        const raw = f.actor.snapshot(beforeRelease)
        const observed = observeCharacterCombat(raw, f.actor, {
            observer,
            getCharacter: (id) => (id === f.target.id ? f.target : undefined),
            navigation: f.navigation,
            now: beforeRelease,
        })
        expect(raw.abilities?.ashCasting?.targetId).toBe(f.target.id)
        expect(observed.abilities?.ashCasting).toEqual({
            abilityId,
            startedAt: beforeRelease,
            completesAt: releasedAt,
        })
    })

    it.each(['damage', 'stun', 'movement', 'lost target'] as const)(
        'interrupts on %s without paying or starting a cooldown',
        (reason) => {
            const f = fixture()
            const at = beforeRelease + 100
            const { hp, mana } = f.actor
            expectStarted(f)
            if (reason === 'damage') {
                f.actor.applyDamage(1, at)
                f.actor.hp = hp
            } else if (reason === 'stun') {
                f.actor.stunUntil = releasedAt + 1
            } else if (reason === 'movement') {
                expect(
                    cancelPrayerForMovement(f.actor, { x: 1, y: 0 }, at)
                ).toMatchObject([
                    { kind: 'cast', abilityId, phase: 'interrupted' },
                ])
            } else {
                f.target.position.x +=
                    weapon.rangeCells * f.navigation.grid.tileWidth
            }
            const result = f.advanceCast(releasedAt)
            if (reason !== 'movement') {
                expect(result).toMatchObject([
                    { kind: 'cast', abilityId, phase: 'interrupted' },
                ])
            }
            expect(f.actor.mana).toBe(mana)
            expect(f.actor.abilities.availableAt[abilityId]).toBeUndefined()
            expect(f.onProjectileRelease).not.toHaveBeenCalled()
            expect(
                snapshotAbilities(f.actor, releasedAt).ashCasting
            ).toBeUndefined()
            expect(f.magic.effectsFor(f.actor.locationId, releasedAt)).toEqual(
                []
            )
        }
    )

    it('is stopped by walls and the first other body on the released trajectory', () => {
        const ally = abilityHero('vanguard')
        ally.position.x = 130
        const blocked = fixture(() => 0, [ally])
        const [allyHp, targetHp] = [ally.hp, blocked.target.hp]
        expectStarted(blocked)
        blocked.advanceCast(releasedAt)
        expect(blocked.advanceProjectile(contactAt)).toEqual([])
        expect([ally.hp, blocked.target.hp]).toEqual([allyHp, targetHp])

        const behind = enemy('behind', 185)
        const walled = fixture(() => 0, [behind])
        const before = behind.hp
        const { solid, width } = walled.navigation.grid
        solid[6 * width + 10] = true
        expectStarted(walled)
        walled.advanceCast(releasedAt)
        walled.target.position.y += 40
        expect(walled.advanceProjectile(contactAt)).toEqual([])
        expect(behind.hp).toBe(before)
        const [effect] = walled.magic.effectsFor(
            walled.actor.locationId,
            contactAt
        )
        expect(effect).toMatchObject({ abilityId, phase: 'impact' })
        if (effect !== undefined && 'phase' in effect) {
            expect(effect.position.x).toBeLessThan(160)
        }
    })
})

describe('Проклятие Тленного сгустка', () => {
    it.each([
        [1, 0.8],
        [2, 0.7],
        [3, 0.3],
    ] as const)(
        'applies exactly the rank %i reduction to the effective caps until game-time expiry',
        (rank, multiplier) => {
            const actor = abilityHero('vanguard')
            const original = [
                actor.maxHp,
                effectiveMaxMana(actor),
                effectiveMaxEnergy(actor),
            ] as const
            const expiresAt = contactAt + weapon.durationMs
            expect(curseWithAshExhaustion(actor, rank, contactAt)).toBe(
                expiresAt
            )
            expect(actor.maxHp).toBe(
                Math.floor(original[0] * multiplier + 1e-10)
            )
            expect(effectiveMaxMana(actor)).toBeCloseTo(
                original[1] * multiplier
            )
            expect(effectiveMaxEnergy(actor)).toBeCloseTo(
                original[2] * multiplier
            )
            const current = [actor.hp, actor.mana, actor.energy]
            expireAshExhaustion(actor, expiresAt - 1)
            expect(snapshotAshExhaustion(actor, expiresAt - 1)).toEqual({
                rank,
                expiresAt,
            })
            expireAshExhaustion(actor, expiresAt)
            expect(snapshotAshExhaustion(actor, expiresAt)).toBeUndefined()
            expect([
                actor.maxHp,
                effectiveMaxMana(actor),
                effectiveMaxEnergy(actor),
            ]).toEqual(original)
            expect([actor.hp, actor.mana, actor.energy]).toEqual(current)
        }
    )

    it('refreshes an equal rank, preserves a stronger rank, and clears the curse on death', () => {
        const actor = abilityHero('vanguard')
        curseWithAshExhaustion(actor, 1, contactAt)
        curseWithAshExhaustion(actor, 3, contactAt + 500)
        expect(
            curseWithAshExhaustion(actor, 2, contactAt + 1_000)
        ).toBeUndefined()
        expect(snapshotAshExhaustion(actor, contactAt + 1_000)).toEqual({
            rank: 3,
            expiresAt: contactAt + 500 + weapon.durationMs,
        })
        expect(curseWithAshExhaustion(actor, 3, contactAt + 2_000)).toBe(
            contactAt + 2_000 + weapon.durationMs
        )
        actor.applyDamage(actor.hp, contactAt + 2_001)
        expect(snapshotAshExhaustion(actor, contactAt + 2_001)).toBeUndefined()
        expect(actor.maxHp).toBe(actor.baseMaxHp)
    })
})
