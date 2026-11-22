import type {
    AbilityClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { CompanionWorld } from '../src/game/agentDecisions'
import type { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { ClericController } from '../src/game/clericController'
import {
    attemptAttack,
    isTargetInAttackRange,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { createItemInstance, inventoryCapacity } from '../src/game/inventory'
import { requestNpcAttack, trySkeletonStrike } from '../src/game/npcAbilities'
import type { GameRoom } from '../src/game/room'
import { createInventoryRequester } from '../src/game/roomEconomy'
import { createSkeleton } from '../src/game/spawns'
import { WorldLocations } from '../src/game/worldLocations'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function npcWorld(characters: GameCharacter[]) {
    const context = abilityContext(characters)
    const published: GameEventPayload[] = []
    const world: CompanionWorld & {
        publishEvents: (events: GameEventPayload[]) => void
    } = {
        charactersFor: () => characters,
        navigationFor: () => context.navigation,
        getCharacter: (id) => characters.find((actor) => actor.id === id),
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
        requestAbility: (actor, message, now) =>
            handleAbilityCommand(actor, message, { ...context, now }),
        publishEvents: (events) => {
            published.push(...events)
        },
    }
    return { world, published, context }
}
it('scripted support priest submits the same paid contextual prayer and respects cooldown', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    const wounded = abilityHero()
    wounded.hp -= 12
    const { world, published, context } = npcWorld([actor, wounded])
    const controller = new ClericController()
    controller.update(actor, world as GameRoom, 1000)
    expect(actor.mana).toBe(35)
    published.push(
        ...advanceRevive(
            actor,
            (id) => context.characters.find((target) => target.id === id),
            4000,
            () => 0,
            { ...context, now: 4000 }
        )
    )
    expect(actor.mana).toBe(35)
    expect(wounded.hp).toBeGreaterThan(wounded.maxHp - 12)
    expect(published).toContainEqual(
        expect.objectContaining({ kind: 'heal', targetId: wounded.id })
    )
    controller.update(actor, world as GameRoom, 3999)
    expect(actor.mana).toBe(35)
})
it('chooses a safe basic prayer over mixed harm and never takes over a human', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    actor.hp -= 10
    actor.progression.constellations.opened.add('prayer.harm')
    actor.abilities.known.add('pray_woven')
    for (const id of ['prayer.area', 'prayer.targets1']) {
        actor.progression.constellations.opened.add(id)
    }
    const undead = abilityHero('vanguard', 'undead')
    const { world, context } = npcWorld([actor, undead])
    const request = vi.spyOn(world, 'requestAbility')
    const controller = new ClericController()
    controller.update(actor, world as GameRoom, 1000)
    expect(request).toHaveBeenCalledExactlyOnceWith(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: actor.id },
        },
        1000
    )
    const hp = undead.hp
    advanceRevive(
        actor,
        () => undefined,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(undead.hp).toBe(hp)
    expect(actor.hp).toBeGreaterThan(actor.maxHp - 10)
    actor.soul.controlSource = 'human'
    controller.update(actor, world as GameRoom, 5000)
    expect(request).toHaveBeenCalledTimes(1)
})
it('skeleton policy only chooses a heavy-strike intention and leaves combat mutation to the common port', () => {
    const actor = abilityHero('vanguard', 'undead', 'mob1')
    const target = abilityHero()
    const { world, published } = npcWorld([actor, target])
    const request = vi.fn<
        (
            actor: GameCharacter,
            message: AbilityClientMessage,
            now: number
        ) => GameEventPayload[]
    >(() => [
        {
            kind: 'attack',
            actorId: actor.id,
            targetId: target.id,
            abilityId: 'skeleton_strike',
        },
    ])
    world.requestAbility = request
    const before = target.hp
    expect(trySkeletonStrike(actor, target, world, 1000)).toBe(true)
    expect(request).toHaveBeenLastCalledWith(
        actor,
        {
            type: 'use_ability',
            abilityId: 'skeleton_strike',
            targetId: target.id,
        },
        1000
    )
    expect(target.hp).toBe(before)
    expect(published).toHaveLength(1)
    actor.abilities.availableAt.skeleton_strike = 9000
    expect(trySkeletonStrike(actor, target, world, 2000)).toBe(false)
    actor.abilities.availableAt.skeleton_strike = 0
    actor.energy = 23
    expect(trySkeletonStrike(actor, target, world, 2000)).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
})

it('stows a broken sword when the skeleton has bag space and resumes ordinary melee', () => {
    const target = abilityHero()
    const { world, context, published } = npcWorld([target])
    const locations = new WorldLocations(context.navigation)
    const { character: actor } = createSkeleton(context.navigation)
    const sword = actor.equipment.weapon
    if (sword === undefined) {
        throw new Error('Expected a skeleton with its starting sword')
    }
    const now = Date.now()
    sword.durability = 0
    actor.abilities.availableAt.skeleton_strike = now + 8000
    target.position = { x: actor.position.x, y: actor.position.y + 16 }
    actor.inventory = Array.from({ length: inventoryCapacity }, () =>
        createItemInstance('boots')
    )
    const attack = {
        actor,
        now,
        targets: [target],
        targetId: target.id,
        tileSize: context.navigation.grid.tileWidth,
        navigation: context.navigation,
        respawnDelayMsFor: () => 0,
        random: () => 0.5,
    }
    world.requestInventoryAction = createInventoryRequester(() => locations)
    world.requestAttack = () => {
        published.push(...attemptAttack(attack))
    }

    requestNpcAttack(actor, target, world, now)
    expect(actor.equipment.weapon).toBe(sword)
    expect(actor.inventory).toHaveLength(inventoryCapacity)
    expect(published).toEqual([])

    actor.inventory.pop()
    requestNpcAttack(actor, target, world, now)
    expect(actor.equipment.weapon).toBeUndefined()
    expect(actor.inventory.at(-1)).toBe(sword)
    expect(actor.snapshot(now).visualId).toBe('skeleton_swordless')
    expect(isTargetInAttackRange(actor, target, attack.tileSize)).toBe(true)
    expect(published.map(({ kind }) => kind)).toEqual(['item_equip', 'attack'])
    expect(
        resolvePendingAttackHit({ ...attack, now: now + 500 })
    ).toContainEqual(
        expect.objectContaining({ kind: 'damage', actorId: actor.id })
    )
})

it('a refusal to fight blocks both a special strike and its ordinary-attack fallback', () => {
    const actor = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(actor, { id: 'npc_princess_1' })
    const target = abilityHero()
    const { world } = npcWorld([actor, target])
    const ability = vi.spyOn(world, 'requestAbility')
    const basic = vi.spyOn(world, 'requestAttack')
    requestNpcAttack(actor, target, world, 1000)
    expect(ability).not.toHaveBeenCalled()
    expect(basic).not.toHaveBeenCalled()
})
