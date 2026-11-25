import type { AgentDecision } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import type { CompanionWorld } from '../src/game/agentDecisions'
import { CompanionService } from '../src/game/companions'
import { canPerformSkillAction } from '../src/game/skillProgression'
import { trainingCombatFixture } from './trainingCombatFixture'

it('rejects model control, automation and skill intentions before leasing a training target', () => {
    const f = trainingCombatFixture()
    const service = new CompanionService()
    const requestAutomation = vi.fn<
        NonNullable<CompanionWorld['requestAutomation']>
    >(() => ({ accepted: true, error: null, events: [] }))
    const requestAttack = vi.fn<CompanionWorld['requestAttack']>()
    const world: CompanionWorld = {
        requestAutomation,
        requestAttack,
        findVisibleTarget: () => undefined,
        getCharacter: (id) => f.characters.find((entry) => entry.id === id),
        navigationFor: () => f.context.navigation,
    }
    const decisions: AgentDecision[] = [
        { type: 'move', axis: { x: 1, y: 0 } },
        { type: 'move_to', target: { x: 120, y: 120 } },
        { type: 'attack', targetId: f.actor.id },
        { type: 'use_ability', abilityId: 'barrier' },
        {
            type: 'scenario_save',
            scenario: {
                id: 'dummy-work',
                name: 'Work',
                repeat: 1,
                sequences: [],
                reactions: [],
                main: [{ id: 'wait', kind: 'wait', durationMs: 1000 }],
            },
        },
        { type: 'scenario_start', scenarioId: 'dummy-work' },
        { type: 'speak', text: 'Hello' },
    ]
    for (const decision of decisions) {
        expect(service.decide(f.dummy, decision, world, 1000)).toMatchObject({
            accepted: false,
            error: 'Training targets do not accept controller intentions',
            events: [],
        })
    }
    expect(service.hasActiveLease(f.dummy, 1000)).toBe(false)
    expect(f.dummy.soul.controlSource).toBe('script')
    expect(f.dummy.soul.kind).toBe('echo')
    expect(requestAutomation).not.toHaveBeenCalled()
    expect(requestAttack).not.toHaveBeenCalled()
    expect(f.dummy.hasPath()).toBe(false)
    expect(f.dummy.getMoveInput()).toEqual({ x: 0, y: 0 })
})

it('cannot assign a scenario to a typed training target even if speech metadata changes', () => {
    const f = trainingCombatFixture()
    f.dummy.soul.canSpeak = true
    const service = new CompanionService()
    expect(canPerformSkillAction(f.dummy, 1000)).toBe(false)
    expect(
        service.canAssist(
            f.actor,
            f.dummy,
            { questCompleted: () => true, hasLineOfSight: () => true },
            1000
        ).accepted
    ).toBe(false)
    expect(
        service.claimAssistance(
            f.actor,
            f.dummy,
            { questCompleted: () => true, hasLineOfSight: () => true },
            1000
        ).accepted
    ).toBe(false)
    expect(service.hasConsent(f.actor.id, f.dummy)).toBe(false)
})
