import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
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
import { grantRetaliation } from '../src/game/crimeRelations'
import { createItemInstance } from '../src/game/inventory'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function setup() {
    const actor = abilityHero('ranger'),
        target = abilityHero('vanguard')
    actor.facing = 'right'
    target.position = { x: 150, y: 100 }
    grantRetaliation(actor, target, 60000)
    const characters = [actor, target]
    const context = abilityContext(characters)
    const attack = (now: number, targetId?: string) => ({
        actor,
        targets: characters,
        targetId,
        now,
        navigation: context.navigation,
        tileSize: 16,
        random: () => 0.9,
        respawnDelayMsFor: () => 15000,
    })
    context.requestAbilityAttack = (_actor, targetId, id, now) =>
        attemptAbilityAttack(attack(now, targetId), id)
    const shot = (now = 1000, targetId?: string) =>
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'shot',
                ...(targetId !== undefined ? { targetId } : {}),
            },
            { ...context, now }
        )
    return { actor, target, characters, context, attack, shot }
}
it('keeps ranger basic attacks in melee and Shot separate, with normal weapon wear', () => {
    const f = setup()
    const sword = createItemInstance('simple_sword')
    f.actor.equipment.weapon = sword
    const energy = f.actor.energy
    expect(f.actor.config.basicAttackKind).toBe('melee')
    expect(attemptAttack(f.attack(1000, f.target.id))).toEqual([])
    expect(f.actor.energy).toBe(energy)
    expect(f.shot(1000, f.target.id)[0]).toMatchObject({
        kind: 'attack',
        abilityId: 'shot',
        targetId: f.target.id,
    })
    expect(resolvePendingAttackHit(f.attack(1050))[0]?.kind).toBe('damage')
    expect(sword.durability).toBe(200)
    f.target.position.x = 112
    const melee = attemptAttack(f.attack(2000, f.target.id))
    expect(melee[0]).toMatchObject({ kind: 'attack', targetId: f.target.id })
    expect(melee[0]?.abilityId).toBeUndefined()
    expect(resolvePendingAttackHit(f.attack(2050))[0]?.kind).toBe('damage')
    expect(sword.durability).toBe(199)
})
it('fires toward current facing without selecting a nearer enemy behind the ranger', () => {
    const f = setup(),
        behind = abilityHero('vanguard')
    behind.position = { x: 95, y: 100 }
    grantRetaliation(f.actor, behind, 60000)
    f.characters.push(behind)
    const events = f.shot()
    expect(events[0]).toEqual({
        kind: 'attack',
        actorId: f.actor.id,
        abilityId: 'shot',
        projectile: {
            origin: { x: 100, y: 100 },
            endpoint: { x: 164, y: 100 },
        },
    })
    expect(f.actor.facing).toBe('right')
    expect(f.actor.energy).toBe(
        f.actor.config.resources.maxEnergy - ABILITY_DEFINITIONS.shot.energy
    )
    const hits = resolvePendingAttackHit(f.attack(1050))
    expect(hits).toContainEqual(
        expect.objectContaining({ kind: 'damage', targetId: f.target.id })
    )
    expect(behind.hp).toBe(behind.maxHp)
})
it.each(['behind', 'outside-width', 'beyond-range', 'wall'] as const)(
    'cannot hit an untargeted enemy %s',
    (reason) => {
        const f = setup()
        if (reason === 'behind') {
            f.target.position.x = 95
        }
        if (reason === 'outside-width') {
            f.target.position.y = 113
        }
        if (reason === 'beyond-range') {
            f.target.position.x = 165
        }
        if (reason === 'wall') {
            vi.spyOn(f.context.navigation, 'hasLineOfSight').mockReturnValue(
                false
            )
        }
        const before = structuredClone(f.actor.progression.skills)
        expect(f.shot()[0]?.kind).toBe('attack')
        expect(resolvePendingAttackHit(f.attack(1050))).toEqual([])
        expect(f.target.hp).toBe(f.target.maxHp)
        expect(f.actor.progression.skills).toEqual(before)
    }
)
it('still aims at an explicitly selected target and rejects unknown, depleted or cooling down shots', () => {
    const f = setup()
    f.target.position.x = 60
    expect(f.shot(1000, f.target.id)[0]?.targetId).toBe(f.target.id)
    expect(f.actor.facing).toBe('left')
    expect(resolvePendingAttackHit(f.attack(1050))[0]?.kind).toBe('damage')
    const energy = f.actor.energy
    expect(f.shot(1100).every((event) => event.kind === 'notice')).toBe(true)
    expect(f.actor.energy).toBe(energy)
    f.actor.energy = 0
    expect(f.shot(2000).every((event) => event.kind === 'notice')).toBe(true)
    f.actor.energy = 100
    f.actor.abilities.known.delete('shot')
    expect(f.shot(3000).every((event) => event.kind === 'notice')).toBe(true)
    expect(f.actor.energy).toBe(100)
})
it('approaches into melee for automatic basic attack but repeats empty forward Shot without training', () => {
    const f = setup(),
        events: GameEventPayload[] = []
    const world = {
        getCharacter: (id: string) =>
            f.characters.find((character) => character.id === id),
        navigationFor: () => f.context.navigation,
        abilityContextFor: (_actor: GameCharacter, now: number) => ({
            ...f.context,
            now,
        }),
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestAttack:
            vi.fn<(actor: GameCharacter, now?: number, id?: string) => void>(),
    }
    expect(
        setCharacterControl(
            f.actor,
            {
                type: 'auto_action',
                action: { kind: 'attack', targetId: f.target.id },
            },
            world,
            1000
        )
    ).toBe(true)
    advanceCharacterControl(f.actor, world, 1000)
    expect(snapshotControl(f.actor).waiting).toBe('range')
    expect(f.actor.hasPath()).toBe(true)
    expect(world.requestAttack).not.toHaveBeenCalled()
    f.target.position.x = 112
    advanceCharacterControl(f.actor, world, 1300)
    expect(world.requestAttack).toHaveBeenCalledOnce()
    f.target.position.x = 90
    const skills = structuredClone(f.actor.progression.skills)
    expect(
        setCharacterControl(
            f.actor,
            {
                type: 'auto_action',
                action: { kind: 'ability', abilityId: 'shot' },
            },
            world,
            2000
        )
    ).toBe(true)
    f.actor.facing = 'right'
    advanceCharacterControl(f.actor, world, 2000)
    resolvePendingAttackHit(f.attack(2050))
    advanceCharacterControl(f.actor, world, 2550)
    resolvePendingAttackHit(f.attack(2600))
    expect(events.filter((event) => event.kind === 'attack')).toHaveLength(2)
    expect(f.actor.facing).toBe('right')
    expect(f.target.hp).toBe(f.target.maxHp)
    expect(f.actor.progression.skills).toEqual(skills)
})
