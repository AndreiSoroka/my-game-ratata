import type {
    AbilityClientMessage,
    CharacterControlCommand,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import {
    applyAgentDecision,
    type CompanionWorld,
    parseAgentDecision,
} from '../src/game/agentDecisions'
import type { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    type ControlWorld,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { advanceRevive } from '../src/game/characterLife'
import { PolicyController } from '../src/game/companionControllers'
import { CompanionService } from '../src/game/companions'
import type { GameRoom } from '../src/game/room'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function port(characters: GameCharacter[]) {
    const context = abilityContext(characters)
    const requestAbility = vi.fn(
        (actor: GameCharacter, message: AbilityClientMessage, now: number) =>
            handleAbilityCommand(actor, message, { ...context, now })
    )
    const requestControl = vi.fn<
        (
            actor: GameCharacter,
            message: CharacterControlCommand,
            now: number
        ) => boolean
    >(() => true)
    const world: CompanionWorld = {
        requestAbility,
        requestControl,
        charactersFor: () => characters,
        navigationFor: () => context.navigation,
        getCharacter: (id) => characters.find((actor) => actor.id === id),
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
    }
    return { world, requestAbility, requestControl, context }
}
it('agent ability requests use ordinary costs, cooldowns and pinned prayer targets', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    actor.hp -= 12
    const { world, requestAbility, context } = port([actor])
    const message = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'restore', targetId: actor.id },
    } as const
    expect(applyAgentDecision(actor, message, world, 1000).accepted).toBe(true)
    expect(actor.mana).toBe(35)
    expect(applyAgentDecision(actor, message, world, 2000).accepted).toBe(false)
    expect(actor.mana).toBe(35)
    expect(requestAbility).toHaveBeenCalledTimes(1)
    advanceRevive(
        actor,
        () => actor,
        4000,
        () => 0,
        { ...context, now: 4000 }
    )
    expect(actor.mana).toBe(35)
})
it.each(['human', 'unknown', 'dead', 'offline', 'stun'] as const)(
    'agent does not bypass %s capability restrictions',
    (reason) => {
        const actor = abilityHero(
            'arcanist',
            'humanoid',
            reason === 'human' ? 'network_player' : 'scripted'
        )
        if (reason === 'unknown') {
            actor.abilities.known.delete('barrier')
        }
        if (reason === 'dead') {
            actor.applyDamage(actor.hp, 0)
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        if (reason === 'stun') {
            actor.stunUntil = 2000
        }
        const { world, requestAbility } = port([actor])
        expect(
            applyAgentDecision(
                actor,
                { type: 'use_ability', abilityId: 'barrier' },
                world,
                1000
            ).accepted
        ).toBe(false)
        expect(requestAbility).not.toHaveBeenCalled()
        expect(actor.mana).toBe(70)
    }
)
it('a noncombat personality rejects actual attack targets while permitting a safe selected self-heal beside undead', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    Object.assign(actor, { id: 'npc_princess_1' })
    actor.abilities.known.add('spark')
    actor.progression.constellations.opened.add('prayer.harm')
    actor.hp -= 10
    const undead = abilityHero('vanguard', 'undead', 'mob1')
    const { world, requestAbility, requestControl } = port([actor, undead])
    for (const message of [
        { type: 'use_ability', abilityId: 'spark', targetId: undead.id },
        { type: 'auto_attack', targetId: undead.id },
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'harm', targetId: undead.id },
        },
    ]) {
        expect(applyAgentDecision(actor, message, world, 1000).accepted).toBe(
            false
        )
    }
    expect(requestAbility).not.toHaveBeenCalled()
    expect(requestControl).not.toHaveBeenCalled()
    expect(
        applyAgentDecision(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'restore', targetId: actor.id },
            },
            world,
            1000
        ).accepted
    ).toBe(true)
    expect(requestAbility).toHaveBeenCalledOnce()
    expect(actor.mana).toBe(35)
    expect(undead.hp).toBe(undead.maxHp)
})
it('allows a noncombat personality to devote a harmless prayer beside potential wave victims', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    Object.assign(actor, { id: 'npc_princess_1' })
    actor.progression.constellations.opened.add('prayer.harm')
    const undead = abilityHero('vanguard', 'undead', 'mob1')
    const { world, requestAbility } = port([actor, undead])
    const result = applyAgentDecision(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'devotion' },
        },
        world,
        1000
    )
    expect(result.accepted).toBe(true)
    expect(requestAbility).toHaveBeenCalledTimes(1)
    expect(result.events).toEqual([
        {
            kind: 'cast',
            actorId: actor.id,
            abilityId: 'pray',
            phase: 'completed',
        },
    ])
    expect(undead.hp).toBe(undead.maxHp)
    expect(actor.mana).toBe(40)
    expect(actor.progression.masteries.prayer.experience).toBe(0n)
})
it('shared control rejection propagates and wait, manual move and lease expiry cancel ongoing control', () => {
    const actor = abilityHero('vanguard', 'humanoid', 'scripted')
    const { world, requestControl } = port([actor])
    requestControl.mockReturnValueOnce(false)
    expect(
        applyAgentDecision(
            actor,
            { type: 'follow', targetId: 'missing' },
            world,
            1000
        ).accepted
    ).toBe(false)
    const service = new CompanionService()
    expect(
        service.decide(
            actor,
            { type: 'auto_attack', targetId: 'enemy' },
            world,
            1000
        ).accepted
    ).toBe(true)
    const fallback = { update: vi.fn() }
    const policy = new PolicyController(service, fallback)
    policy.update(actor, world as GameRoom, 6000)
    expect(requestControl).toHaveBeenLastCalledWith(
        actor,
        { type: 'cancel_control' },
        6000
    )
    expect(fallback.update).toHaveBeenCalledTimes(1)
    applyAgentDecision(
        actor,
        { type: 'move', axis: { x: 1, y: 0 } },
        world,
        6100
    )
    expect(requestControl).toHaveBeenLastCalledWith(
        actor,
        { type: 'cancel_control' },
        6100
    )
    applyAgentDecision(actor, { type: 'wait' }, world, 6200)
    expect(requestControl).toHaveBeenLastCalledWith(
        actor,
        { type: 'cancel_control' },
        6200
    )
})
it('parses the shared ability and control wire format without accepting state edits', () => {
    expect(
        parseAgentDecision({ type: 'use_ability', abilityId: 'pray' })
    ).toBeUndefined()
    expect(parseAgentDecision({ type: 'follow', targetId: 12 })).toBeUndefined()
    expect(parseAgentDecision({ type: 'follow', targetId: null })).toEqual({
        type: 'follow',
        targetId: null,
    })
    expect(parseAgentDecision({ type: 'cancel_control' })).toEqual({
        type: 'cancel_control',
    })
    expect(parseAgentDecision({ type: 'set_hp', amount: 999 })).toBeUndefined()
    expect(
        parseAgentDecision({ type: 'use_ability', abilityId: 'barrier' })
    ).toEqual({ type: 'use_ability', abilityId: 'barrier' })
})

it('agent automatic actions use the same authoritative controller and costs as player commands', () => {
    const actor = abilityHero('arcanist', 'humanoid', 'scripted')
    const { world, context } = port([actor])
    const publishEvents = vi.fn()
    const controls: ControlWorld = {
        ...world,
        abilityContextFor: (_actor, now) => ({ ...context, now }),
        publishEvents,
    }
    world.requestControl = (character, message, now) =>
        setCharacterControl(character, message, controls, now)
    const decision = {
        type: 'auto_action',
        action: { kind: 'ability', abilityId: 'barrier' },
    } as const
    expect(parseAgentDecision(decision)).toEqual(decision)
    expect(applyAgentDecision(actor, decision, world, 1000).accepted).toBe(true)
    expect(actor.mana).toBe(70)
    expect(snapshotControl(actor).action).toEqual(decision.action)
    advanceCharacterControl(actor, controls, 1000)
    expect(actor.mana).toBe(58)
    expect(publishEvents).toHaveBeenCalledOnce()
    expect(
        applyAgentDecision(
            actor,
            { type: 'auto_action', action: null },
            world,
            1001
        ).accepted
    ).toBe(true)
    expect(snapshotControl(actor).mode).toBe('none')
    advanceCharacterControl(actor, controls, 20000)
    expect(actor.mana).toBe(58)
    expect(
        parseAgentDecision({
            type: 'auto_action',
            action: { kind: 'item', id: 'food' },
        })
    ).toBeUndefined()
})
