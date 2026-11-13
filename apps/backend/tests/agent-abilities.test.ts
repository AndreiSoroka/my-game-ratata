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
    const { world, requestAbility } = port([actor])
    const message = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'restore', targetId: actor.id },
    } as const
    expect(applyAgentDecision(actor, message, world, 1000).accepted).toBe(true)
    expect(actor.mana).toBe(115)
    expect(applyAgentDecision(actor, message, world, 2000).accepted).toBe(false)
    expect(actor.mana).toBe(115)
    expect(requestAbility).toHaveBeenCalledTimes(2)
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
        expect(actor.mana).toBe(100)
    }
)
it('a noncombat personality cannot use attack abilities, autoattack or harmful prayer collateral', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    Object.assign(actor, { id: 'npc_princess_1' })
    actor.abilities.known.add('spark')
    actor.progression.skills.miracles.level = 3
    actor.hp -= 10
    const undead = abilityHero('vanguard', 'undead', 'mob1')
    const { world, requestAbility, requestControl } = port([actor, undead])
    for (const message of [
        { type: 'use_ability', abilityId: 'spark', targetId: undead.id },
        { type: 'auto_attack', targetId: undead.id },
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', targetId: actor.id },
        },
    ]) {
        expect(applyAgentDecision(actor, message, world, 1000).accepted).toBe(
            false
        )
    }
    expect(requestAbility).not.toHaveBeenCalled()
    expect(requestControl).not.toHaveBeenCalled()
    undead.position.x += 100
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
})
it('allows a noncombat personality to devote a harmless prayer beside potential wave victims', () => {
    const actor = abilityHero('cleric', 'humanoid', 'scripted')
    Object.assign(actor, { id: 'npc_princess_1' })
    actor.progression.skills.miracles.level = 3
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
    expect(actor.mana).toBe(120)
    expect(actor.progression.skills.faith.practice).toBe(0)
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
