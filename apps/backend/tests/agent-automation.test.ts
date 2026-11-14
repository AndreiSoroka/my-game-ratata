import type { AutomationCommand } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import {
    applyAgentDecision,
    type CompanionWorld,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'

function setup(human = false) {
    const actor = new GameCharacter({
        id: 'worker',
        nickname: 'Worker',
        archetype: 'human',
        controllerKind: human ? 'network_player' : 'scripted',
        spawnPosition: { x: 40, y: 40 },
    })
    const navigation = new NavigationService({
        id: 'automation-test',
        width: 10,
        height: 10,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(100).fill(false),
        solidLayerNames: [],
    })
    const requestAutomation = vi.fn<
        NonNullable<CompanionWorld['requestAutomation']>
    >(() => ({ accepted: true, error: null, events: [] }))
    const world: CompanionWorld = {
        navigationFor: () => navigation,
        getCharacter: () => undefined,
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
        requestAutomation,
    }
    return { actor, world, requestAutomation }
}

it('dispatches validated NPC scenario intentions with the server-resolved actor', () => {
    const { actor, world, requestAutomation } = setup()
    const command: AutomationCommand = {
        type: 'scenario_start',
        scenarioId: 'work',
    }
    expect(applyAgentDecision(actor, command, world, 1000).accepted).toBe(true)
    expect(requestAutomation).toHaveBeenCalledExactlyOnceWith(
        actor,
        command,
        1000
    )
})

it.each(['human', 'detached-human', 'offline', 'dead', 'injection'] as const)(
    'preserves %s control protection',
    (reason) => {
        const { actor, world, requestAutomation } = setup(
            reason === 'human' || reason === 'detached-human'
        )
        if (reason === 'detached-human') {
            actor.soul.kind = 'echo'
            actor.soul.controlSource = 'script'
        }
        if (reason === 'offline') {
            actor.tags.add('offline')
        }
        if (reason === 'dead') {
            actor.alive = false
        }
        const command = {
            type: 'scenario_start',
            scenarioId: 'work',
            ...(reason === 'injection' ? { ownerId: 'another' } : {}),
        }
        expect(applyAgentDecision(actor, command, world, 1000).accepted).toBe(
            false
        )
        expect(requestAutomation).not.toHaveBeenCalled()
    }
)

it('returns shared service rejection without pretending execution succeeded', () => {
    const { actor, world, requestAutomation } = setup()
    requestAutomation.mockReturnValue({
        accepted: false,
        error: 'Scenario is missing',
        events: [],
    })
    expect(
        applyAgentDecision(
            actor,
            { type: 'scenario_start', scenarioId: 'missing' },
            world,
            1000
        )
    ).toMatchObject({ accepted: false, error: 'Scenario is missing' })
    delete world.requestAutomation
    expect(
        applyAgentDecision(actor, { type: 'scenario_stop' }, world, 1000)
    ).toMatchObject({
        accepted: false,
        error: 'Automation service unavailable',
    })
})
