import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { GraveSpawns } from '../src/game/graveSpawns'
import { createItemInstance } from '../src/game/inventory'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function setup() {
    const actor = abilityHero('arcanist'),
        target = abilityHero('vanguard')
    actor.facing = 'right'
    target.position = { x: 150, y: 100 }
    Object.assign(target, { faction: 'monsters' })
    const characters = [actor, target]
    const context = abilityContext(characters)
    const graves = new GraveSpawns()
    context.graves = {
        get: (id) => graves.get(id),
        list: (id) => graves.snapshot(id),
        damage: (id, amount, now) => graves.damage(id, amount, now),
        purify: (id, now) => graves.purify(id, now),
        contributePurification: (id: string, receiptId: string, at: number) =>
            graves.contributePurification(id, receiptId, at),
    }
    const attack = (
        now: number,
        targetId?: string,
        target?: WorldCombatTarget
    ) => ({
        actor,
        targets: characters,
        targetId,
        target,
        now,
        graves: context.graves,
        navigation: context.navigation,
        tileSize: 16,
        random: () => 0.5,
        respawnDelayMsFor: () => 15_000,
    })
    context.requestAbilityAttack = (_actor, targetId, id, now, target) =>
        attemptAbilityAttack(attack(now, targetId, target), id)
    const spark = (
        now = 1000,
        reference: { targetId?: string; target?: WorldCombatTarget } = {}
    ) =>
        handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId: 'spark', ...reference },
            { ...context, now }
        )
    return { actor, target, characters, context, graves, attack, spark }
}

it('uses a real melee weapon and no mana for the arcanist basic attack', () => {
    const f = setup(),
        sword = createItemInstance('simple_sword')
    f.actor.progression.skills.swordsmanship.unlocked = true
    f.actor.equipment.weapon = sword
    const mana = f.actor.mana,
        energy = f.actor.energy
    expect(f.actor.config.basicAttackKind).toBe('melee')
    expect(attemptAttack(f.attack(1000, f.target.id))).toEqual([])
    expect(f.actor.energy).toBe(energy)
    f.target.position.x = 112
    expect(attemptAttack(f.attack(1000, f.target.id))[0]).toMatchObject({
        kind: 'attack',
        targetId: f.target.id,
    })
    expect(f.actor.pendingAttack?.hitAt).toBe(1050)
    expect(f.actor.mana).toBe(mana)
    expect(resolvePendingAttackHit(f.attack(1050))).toContainEqual(
        expect.objectContaining({ kind: 'damage', damageKind: 'physical' })
    )
    expect(sword.durability).toBe(199)
    expect(f.actor.progression.skills.swordsmanship.practice).toBeGreaterThan(0)
})

it('casts forward Spark into empty space with its own costs and a server-pinned 80px trajectory', () => {
    const f = setup()
    f.target.position.x = 95
    const skills = structuredClone(f.actor.progression.skills)
    expect(f.spark()[0]).toEqual({
        kind: 'attack',
        actorId: f.actor.id,
        abilityId: 'spark',
        projectile: {
            origin: { x: 100, y: 100 },
            endpoint: { x: 180, y: 100 },
            halfWidth: 16,
        },
    })
    expect(f.actor.facing).toBe('right')
    expect(f.actor.mana).toBe(94)
    expect(f.actor.energy).toBe(95)
    expect(resolvePendingAttackHit(f.attack(1199))).toEqual([])
    expect(resolvePendingAttackHit(f.attack(1200))).toEqual([
        expect.objectContaining({
            kind: 'miss',
            hitQuality: 'miss',
            abilityId: 'spark',
        }),
    ])
    expect(f.actor.progression.skills).toEqual(skills)
})

it.each([
    { x: 180, y: 116, hit: true },
    { x: 180.01, y: 100, hit: false },
    { x: 150, y: 116.01, hit: false },
    { x: 99, y: 100, hit: false },
])('respects the untargeted Spark corridor at ($x,$y)', ({ x, y, hit }) => {
    const f = setup()
    f.target.position = { x, y }
    f.spark()
    const events = resolvePendingAttackHit(f.attack(1200))
    expect(events.some((event) => event.kind === 'damage')).toBe(hit)
})

it('stops Spark at walls and rejects missing resources before costs', () => {
    const f = setup()
    vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(false)
    expect(f.spark()[0]?.kind).toBe('attack')
    expect(resolvePendingAttackHit(f.attack(1200))).toEqual([
        expect.objectContaining({
            kind: 'miss',
            hitQuality: 'miss',
            abilityId: 'spark',
        }),
    ])
    const mana = f.actor.mana
    f.actor.energy = 0
    expect(f.spark(1800).every((event) => event.kind === 'notice')).toBe(true)
    expect(f.actor.mana).toBe(mana)
    expect(f.actor.pendingAttack).toBeUndefined()
})

it('hits only the nearest legal world or character target and never trains on stone', () => {
    const f = setup()
    f.graves.register(
        {
            id: 'near-grave',
            locationId: f.actor.locationId,
            position: { x: 120, y: 100 },
        },
        [],
        0
    )
    const skills = structuredClone(f.actor.progression.skills)
    f.spark()
    expect(resolvePendingAttackHit(f.attack(1200))).toContainEqual(
        expect.objectContaining({ kind: 'world_damage', amount: 1.25 })
    )
    expect(f.target.hp).toBe(f.target.maxHp)
    expect(f.actor.progression.skills).toEqual(skills)
    f.target.position.x = 110
    f.spark(1800)
    const events = resolvePendingAttackHit(f.attack(2000))
    expect(events.filter((event) => event.kind === 'damage')).toHaveLength(1)
    expect(events.some((event) => event.kind === 'world_damage')).toBe(false)
    expect(f.graves.get('near-grave')?.hp).toBe(98.75)
})

it('keeps magic usable with a broken weapon while basic attacks require repair', () => {
    const f = setup(),
        sword = createItemInstance('simple_sword')
    sword.durability = 0
    f.actor.equipment.weapon = sword
    f.target.position.x = 112
    expect(attemptAttack(f.attack(1000, f.target.id))).toEqual([])
    expect(f.spark(1000, { targetId: f.target.id })[0]?.kind).toBe('attack')
    expect(resolvePendingAttackHit(f.attack(1200))[0]?.kind).toBe('damage')
    expect(sword.durability).toBe(0)
})

it('repeats untargeted Spark and waits silently for mana without gaining practice', () => {
    const f = setup(),
        events: GameEventPayload[] = []
    f.target.position.x = 95
    const skills = structuredClone(f.actor.progression.skills)
    const world = {
        getCharacter: (id: string) =>
            f.characters.find((actor) => actor.id === id),
        navigationFor: () => f.context.navigation,
        abilityContextFor: (_actor: GameCharacter, now: number) => ({
            ...f.context,
            now,
        }),
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestAttack: () => undefined,
    }
    expect(
        setCharacterControl(
            f.actor,
            {
                type: 'auto_action',
                action: { kind: 'ability', abilityId: 'spark' },
            },
            world,
            1000
        )
    ).toBe(true)
    advanceCharacterControl(f.actor, world, 1000)
    resolvePendingAttackHit(f.attack(1200))
    advanceCharacterControl(f.actor, world, 1800)
    resolvePendingAttackHit(f.attack(2000))
    expect(events.filter((event) => event.kind === 'attack')).toHaveLength(2)
    f.actor.mana = 0
    advanceCharacterControl(f.actor, world, 2600)
    advanceCharacterControl(f.actor, world, 2650)
    expect(snapshotControl(f.actor).waiting).toBe('resources')
    expect(events.filter((event) => event.kind === 'notice')).toHaveLength(0)
    expect(f.actor.progression.skills).toEqual(skills)
    expect(f.actor.energy).toBe(100 - 2 * ABILITY_DEFINITIONS.spark.energy)
})
