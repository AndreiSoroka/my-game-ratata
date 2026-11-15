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
import { requestNpcAttack, trySkeletonStrike } from '../src/game/npcAbilities'
import type { GameRoom } from '../src/game/room'
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
    expect(actor.mana).toBe(120)
    published.push(
        ...advanceRevive(
            actor,
            (id) => context.characters.find((target) => target.id === id),
            4000,
            () => 0,
            { ...context, now: 4000 }
        )
    )
    expect(actor.mana).toBe(115)
    expect(wounded.hp).toBeGreaterThan(wounded.maxHp - 12)
    expect(published).toContainEqual(
        expect.objectContaining({ kind: 'heal', targetId: wounded.id })
    )
    controller.update(actor, world as GameRoom, 3999)
    expect(actor.mana).toBe(115)
})
it('support policy will not silently burn a friendly bystander and never takes over a human', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    actor.hp -= 10
    actor.progression.constellations.opened.add('prayer.harm')
    const undead = abilityHero('vanguard', 'undead')
    const { world } = npcWorld([actor, undead])
    const request = vi.spyOn(world, 'requestAbility')
    const controller = new ClericController()
    controller.update(actor, world as GameRoom, 1000)
    expect(request).not.toHaveBeenCalled()
    undead.position.x += 100
    actor.soul.controlSource = 'human'
    controller.update(actor, world as GameRoom, 1000)
    expect(request).not.toHaveBeenCalled()
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
