import assert from 'node:assert/strict'

import { expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import { snapshotControl } from '../src/game/characterControl'
import type { WorldChest } from '../src/game/chestInteraction'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { hasDirectRetaliationRight } from '../src/game/crimeRelations'
import { creditsDefeat } from '../src/game/damageEvents'
import { createItemInstance } from '../src/game/inventory'
import {
    grantPersonalHostility,
    hasDeclaredHostility,
    hasGroupHostility,
    hasPersonalHostility,
    revokePersonalHostility,
    setDeclaredHostility,
    setGroupHostility,
} from '../src/game/personalHostility'
import { WorldDeathLoot } from '../src/game/worldDeathLoot'
import { bladeDuel } from './bladeCombatFixture'
import { registerConflictFixture } from './npcConflictFixtures'
import {
    enlistScenarioCompanion,
    joinScenarioRoom,
    openCompanionScenarioRoom,
} from './scenarioRoomHelpers'

const setup = registerConflictFixture()

it('projects a private declaration, permits a real socket attack, and cancels the same target’s repeat on unset', () => {
    const { game, player } = setup()
    const victim = joinScenarioRoom(game, 'Personal target', 'cleric')
    victim.actor.position = { x: 80, y: 80 }
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const targetId = victim.actor.id
    const targetFor = (viewerId: string, observedId: string) =>
        game
            .snapshot(game.gameplayNow(), player.actor.locationId, viewerId)
            .characters.find(({ id }) => id === observedId)

    player.send({ type: 'attack', targetId })
    expect(player.actor.pendingAttack).toBeUndefined()
    player.send({ type: 'set_personal_hostility', targetId, hostile: true })
    expect(targetFor(player.actor.id, targetId)).toMatchObject({
        relationship: 'hostile',
        personalHostile: true,
    })
    expect(targetFor(victim.actor.id, player.actor.id)?.relationship).toBe(
        'friendly'
    )
    expect(player.actor.pendingAttack).toBeUndefined()
    expect(victim.actor.hp).toBe(victim.actor.maxHp)
    expect(player.actor.tags.has('city.blacklisted')).toBe(false)

    const experience = player.actor.progression.masteries.blade.experience
    player.send({ type: 'attack', targetId })
    vi.advanceTimersByTime(500)
    expect(victim.actor.hp).toBeLessThan(victim.actor.maxHp)
    expect(player.actor.progression.masteries.blade.experience).toBe(experience)
    expect(
        hasDirectRetaliationRight(
            victim.actor,
            player.actor,
            game.gameplayNow()
        )
    ).toBe(true)
    expect(
        hasDirectRetaliationRight(
            player.actor,
            victim.actor,
            game.gameplayNow()
        )
    ).toBe(false)
    player.send({ type: 'auto_attack', targetId })
    expect(snapshotControl(player.actor)).toMatchObject({
        mode: 'attack',
        targetId,
    })
    player.send({ type: 'set_personal_hostility', targetId, hostile: false })
    expect(snapshotControl(player.actor).mode).toBe('none')
    expect(
        targetFor(player.actor.id, targetId)?.personalHostile
    ).toBeUndefined()
    expect(targetFor(victim.actor.id, player.actor.id)?.relationship).toBe(
        'hostile'
    )
})

it('rejects marking yourself, a distant target, and a target behind a wall', () => {
    const { game, player, merchant } = setup()
    const declare = (targetId: string) =>
        player.send({ type: 'set_personal_hostility', targetId, hostile: true })
    declare(player.actor.id)
    expect(hasDeclaredHostility(player.actor, player.actor)).toBe(false)
    merchant.position.x = 121
    declare(merchant.id)
    expect(hasDeclaredHostility(player.actor, merchant)).toBe(false)
    merchant.position.x = 80
    vi.spyOn(
        game.navigationFor(player.actor),
        'hasLineOfSight'
    ).mockReturnValue(false)
    declare(merchant.id)
    expect(hasDeclaredHostility(player.actor, merchant)).toBe(false)
})

it('keeps a declaration with the same living identity when it reconnects', () => {
    const { game, player, merchant } = setup()
    player.send({
        type: 'set_personal_hostility',
        targetId: merchant.id,
        hostile: true,
    })
    game.handleClose(player.socket)
    const returning = joinScenarioRoom(game, player.actor.nickname)
    expect(returning.actor).toBe(player.actor)
    expect(hasDeclaredHostility(returning.actor, merchant)).toBe(true)
})

it('allows a silent NPC to respond to a marked attacker through its attack matrix', () => {
    const { player, merchant, game } = setup()
    merchant.soul.canSpeak = false
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const react = vi.spyOn(merchant.temperament, 'react')
    player.send({
        type: 'set_personal_hostility',
        targetId: merchant.id,
        hostile: true,
    })
    expect(react).not.toHaveBeenCalled()
    player.send({ type: 'attack', targetId: merchant.id })
    vi.advanceTimersByTime(100)
    expect(react).toHaveBeenCalledWith(
        expect.objectContaining({
            trigger: 'attack',
            sourceId: player.actor.id,
        }),
        expect.any(Number),
        undefined
    )
    expect(
        hasDirectRetaliationRight(merchant, player.actor, game.gameplayNow())
    ).toBe(true)
})

it('releases a willing NPC companion when its leader lands a real attack', async () => {
    const game = openCompanionScenarioRoom()
    try {
        const leader = joinScenarioRoom(game, 'Companion leader')
        const helper = await enlistScenarioCompanion(game, leader)
        leader.actor.position = {
            x: helper.position.x - 6,
            y: helper.position.y,
        }
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const react = vi.spyOn(helper.temperament, 'react')
        leader.send({
            type: 'set_personal_hostility',
            targetId: helper.id,
            hostile: true,
        })
        expect(helper.soul.companion?.leaderId).toBe(leader.actor.id)
        leader.send({ type: 'attack', targetId: helper.id })
        await vi.advanceTimersByTimeAsync(150)
        expect(helper.hp).toBeLessThan(helper.maxHp)
        expect(helper.soul.companion?.leaderId).toBeNull()
        const request = react.mock.calls[0]?.[0]
        expect(request).toMatchObject({
            trigger: 'attack',
            sourceId: leader.actor.id,
        })
        expect(request?.available).toContain('attack')
    } finally {
        game.stop()
    }
})

it('keeps directed group and independently expiring pair motives', () => {
    const { actor, target } = bladeDuel()
    setGroupHostility(actor, 'living_humans', true)
    expect(hasGroupHostility(actor, target)).toBe(true)
    expect(hasGroupHostility(target, actor)).toBe(false)
    target.lich = true
    expect(hasGroupHostility(actor, target)).toBe(false)
    grantPersonalHostility(actor, target, 'territory', 2000)
    grantPersonalHostility(actor, target, 'conflict', 3000)
    revokePersonalHostility(actor, target, 'territory')
    expect(hasPersonalHostility(actor, target, 1500, 'territory')).toBe(false)
    expect(hasPersonalHostility(actor, target, 2999, 'conflict')).toBe(true)
    expect(hasPersonalHostility(actor, target, 3000)).toBe(false)
})

it('hits an unmarked friendly in an area attack while excluding the caster and targets behind walls', () => {
    const { actor, navigation, attack } = bladeDuel()
    const ally = friendly('ally', 112)
    const obscured = friendly('blocked', 88)
    actor.equipment.weapon = createItemInstance('simple_sword')
    actor.abilities.known.add('circular_swing')
    vi.spyOn(navigation, 'hasLineOfSight').mockImplementation(
        (_from, to) => to !== obscured.position
    )
    const context = {
        ...attack,
        targetId: undefined,
        targets: [actor, ally, obscured],
    }
    expect(attemptAbilityAttack(context, 'circular_swing')).toHaveLength(1)
    const now = actor.pendingAttack?.hitAt
    assert(now !== undefined)
    const events = resolvePendingAttackHit({ ...context, now })
    expect(
        events
            .filter(({ kind }) => kind === 'damage')
            .map(({ targetId }) => targetId)
    ).toEqual([ally.id])
    expect(actor.progression.masteries.blade.experience).toBe(0n)
})

it('keeps defeat credit and damage practice off for a pacified opponent on repeated hits', () => {
    const { actor, target, attack } = bladeDuel()
    target.reputation.peaceful = 20
    setDeclaredHostility(actor, target, true)
    expect(attemptAttack(attack)).toHaveLength(1)
    resolvePendingAttackHit({ ...attack, now: 1050 })
    expect(target.hp).toBeLessThan(target.maxHp)
    expect(hasDirectRetaliationRight(target, actor, 1050)).toBe(true)
    const second = resolveCharacterDamage({
        actor,
        target,
        amount: target.hp,
        now: 2000,
        damageKind: 'physical',
        respawnDelayMs: 15_000,
    })
    expect(second.trainableDamage).toBe(0)
    const death = second.events.find(({ kind }) => kind === 'death')
    assert(death !== undefined)
    expect(creditsDefeat(death)).toBe(false)
})

it('leaves carried belongings but does not mint a quest trophy for a friendly defeat', () => {
    const { actor } = bladeDuel()
    const target = new GameCharacter({
        id: 'pacified-slime',
        nickname: 'Pacified slime',
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        reputation: { peaceful: 20 },
        spawnPosition: { x: 100, y: 112 },
    })
    const food = createItemInstance('food')
    target.inventory = [food]
    const { events } = resolveCharacterDamage({
        actor,
        target,
        amount: target.hp,
        now: 1000,
        damageKind: 'physical',
        respawnDelayMs: 15_000,
    })
    const containers = new Map<string, WorldChest>()
    const loot = new WorldDeathLoot(target.locationId, containers)
    loot.resolve(events, (id) => (id === target.id ? target : undefined))
    expect([...containers.values()].flatMap((chest) => chest.contents)).toEqual(
        [food]
    )
})

function friendly(id: string, y: number): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 100, y },
    })
}
