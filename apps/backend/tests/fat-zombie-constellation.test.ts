import type { CharacterArchetype } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import {
    type AttackContext,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { applyAttackStun } from '../src/game/combatDamage'
import { buildAttackZones } from '../src/game/combatGeometry'
import { generateConstellationLayout } from '../src/game/constellationLayout'
import {
    constellationCatalogFor,
    fullConstellationCatalog,
} from '../src/game/constellationNodes'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import {
    effectiveAttackEnergyCost,
    effectiveAttackPhases,
    effectiveCharacterStats,
    effectiveMoveSpeed,
} from '../src/game/effectiveParameters'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import {
    creditFatZombieKill,
    fatZombieConstellationSize,
    initializeFatZombieConstellation,
} from '../src/game/fatZombieConstellation'
import { fatZombieBonuses } from '../src/game/fatZombieModifiers'
import { fatZombieStars } from '../src/game/fatZombieStars'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { snapshotProgression } from '../src/game/progressionObservation'

function zombie() {
    return new GameCharacter({
        id: 'fat-zombie-test',
        nickname: 'Жирный зомби',
        archetype: 'fat_zombie',
        controllerKind: 'mob1',
        faction: 'monsters',
        locationId: 'dungeon-small-floor-2',
        spawnPosition: { x: 100, y: 100 },
    })
}

function target(archetype: CharacterArchetype = 'human') {
    const victim = new GameCharacter({
        id: `target-${archetype}`,
        nickname: 'Цель',
        archetype,
        controllerKind: 'network_player',
        faction: 'peaceful',
        locationId: 'dungeon-small-floor-2',
        spawnPosition: { x: 100, y: 110 },
    })
    victim.config.combat.dodgeChance = 0
    return victim
}

function lethalStrike(
    actor: GameCharacter,
    victim: GameCharacter,
    now: number
) {
    actor.energy = effectiveMaxEnergy(actor)
    victim.hp = 1
    const context: AttackContext = {
        actor,
        targetId: victim.id,
        targets: [victim],
        tileSize: 16,
        now,
        random: () => 0.99,
        respawnDelayMsFor: () => 1_000,
    }
    expect(attemptAttack(context)).toHaveLength(1)
    const hitAt = actor.pendingAttack?.hitAt
    if (hitAt === undefined) {
        throw new Error('Expected a pending ordinary attack')
    }
    const events = resolvePendingAttackHit({ ...context, now: hitAt })
    expect(events.filter(({ kind }) => kind === 'death')).toHaveLength(1)
    expect(victim.alive).toBe(false)
}

it('starts with connected, repeatable stars and unlocks two more per floor', () => {
    expect(fatZombieConstellationSize).toBe(25)
    for (let floor = 2; floor <= 5; floor += 1) {
        const minimum = 5 + 2 * (floor - 2)
        const seen = new Set<number>()
        for (let index = 0; index < 20; index += 1) {
            const seed = `test-world-${String(index)}`
            const first = zombie()
            const repeated = zombie()
            initializeFatZombieConstellation(first, seed, floor)
            initializeFatZombieConstellation(repeated, seed, floor)
            const opened = first.progression.constellations.opened
            expect(opened).toEqual(repeated.progression.constellations.opened)
            expect(opened.has('fat_zombie.root')).toBe(true)
            for (const star of fatZombieStars) {
                if (opened.has(star.id)) {
                    expect(
                        star.parents.every((parent) => opened.has(parent))
                    ).toBe(true)
                }
            }
            seen.add(opened.size)
        }
        expect(seen).toEqual(new Set([minimum, minimum + 1, minimum + 2]))
    }
})

it('grants one star per new living defeat and caps growth at 25', () => {
    const actor = zombie()
    const victim = target()
    initializeFatZombieConstellation(actor, 'test-world', 2)
    const opened = actor.progression.constellations.opened
    const initial = opened.size
    lethalStrike(actor, victim, 5_000)
    expect(opened.size).toBe(initial + 1)
    creditFatZombieKill(actor, victim)
    expect(opened.size).toBe(initial + 1)
    for (let index = 1; index <= 25; index += 1) {
        const now = (index + 1) * 5_000
        restoreCharacter(victim, now - 1, false)
        lethalStrike(actor, victim, now)
        expect(opened.size).toBe(Math.min(25, initial + index + 1))
    }
    expect(victim.deathSequence).toBe(26)
})

it('excludes undead defeats and exposes the graph in the debug atlas', () => {
    const actor = zombie()
    const skeleton = target('skeleton')
    initializeFatZombieConstellation(actor, 'test-world', 2)
    const initial = actor.progression.constellations.opened.size
    lethalStrike(actor, skeleton, 5_000)
    expect(actor.progression.constellations.opened.size).toBe(initial)
    const authored = fullConstellationCatalog.filter(
        ({ constellationId }) => constellationId === 'fat_zombie'
    )
    const layout = generateConstellationLayout(
        fullConstellationCatalog,
        'atlas-test',
        'blade',
        { forceFallback: true }
    )
    expect(authored).toHaveLength(25)
    expect(authored.every(({ id }) => layout.positions[id] !== undefined)).toBe(
        true
    )

    const human = target()
    prepareConstellationLayout(human)
    expect(constellationCatalogFor(human.archetype)).not.toContain(authored[0])
    expect(
        snapshotConstellations(human).paths.some(
            ({ id }) => id === 'fat_zombie'
        )
    ).toBe(false)
    expect(
        snapshotProgression(human, 1000).masteries.some(
            ({ id }) => id === 'fat_zombie'
        )
    ).toBe(false)
})

it('applies all bonuses through shared combat and recovery while keeping base HP and damage', () => {
    const actor = zombie()
    expect(effectiveAttackPhases(actor)).toEqual({
        cycleMs: 1450,
        windupMs: 450,
        movementMs: 900,
    })
    expect(fatZombieBonuses(actor).pushTiles).toBe(1.5)
    for (const star of fatZombieStars) {
        actor.progression.constellations.opened.add(star.id)
    }
    const stats = effectiveCharacterStats(actor)
    expect([actor.maxHp, stats.minDamage, stats.maxDamage]).toEqual([800, 2, 3])
    expect(stats.critChance).toBe(0)
    expect(effectiveMoveSpeed(actor)).toBe(64)
    expect(effectiveAttackEnergyCost(actor)).toBe(9)
    expect(effectiveMaxEnergy(actor)).toBe(140)
    expect(effectiveAttackPhases(actor)).toEqual({
        cycleMs: 1290,
        windupMs: 430,
        movementMs: 840,
    })
    expect(buildAttackZones(actor, 16)[0]).toMatchObject({
        maxY: 119.2,
        maxX: 113.6,
    })
    expect(fatZombieBonuses(actor).pushTiles).toBeCloseTo(2)

    actor.hp = 600
    actor.energy = 0
    actor.applyRegen(1_000, false, true, 1_000)
    expect(actor.hp).toBeCloseTo(600.42)
    expect(actor.energy).toBe(6)
    actor.applyRegen(1_000, true, true, 2_000)
    expect(actor.hp).toBeCloseTo(600.59)
    expect(actor.energy).toBe(8.5)

    const attacker = target('skeleton')
    const input = {
        actor: attacker,
        target: actor,
        now: 3_000,
        amount: 50,
        respawnDelayMs: 1_000,
    }
    expect(
        resolveCharacterDamage({ ...input, damageKind: 'physical' }).hpDamage
    ).toBeCloseTo(44)
    expect(
        resolveCharacterDamage({ ...input, damageKind: 'arcane' }).hpDamage
    ).toBe(50)
    expect(
        applyAttackStun(
            attacker,
            actor,
            {
                abilityId: 'skeleton_strike',
                canStun: true,
                damageMultiplier: 1,
                hitAt: 3_000,
                targetEnergyDrain: 0,
            },
            3_000,
            () => 0.99
        )
    ).toMatchObject([{ kind: 'status', expiresAt: 3_600 }])
})
