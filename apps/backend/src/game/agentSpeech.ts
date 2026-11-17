import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { distance } from './math'
import { visibilityRadius } from './queries'
import { createSpeechEvent } from './speechReceipts'

export function agentSpeech(
    character: GameCharacter,
    decision: Extract<AgentDecision, { type: 'speak' }>,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (!character.soul.canSpeak) {
        return rejected('This creature cannot speak')
    }
    if (decision.targetId === undefined) {
        return accepted([createSpeechEvent(character, decision.text)])
    }
    const target = world.getCharacter(decision.targetId)
    if (!speechRecipientAvailable(character, target, world, now)) {
        return rejected('Speech recipient is unavailable or out of reach')
    }
    return accepted([
        createSpeechEvent(character, decision.text, {
            targetId: target.id,
            audienceIds: [target.id],
        }),
    ])
}

function speechRecipientAvailable(
    character: GameCharacter,
    target: GameCharacter | undefined,
    world: CompanionWorld,
    now: number
): target is GameCharacter {
    return (
        target !== undefined &&
        target.id !== character.id &&
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        (target.controllerKind !== 'network_player' || target.connected) &&
        target.locationId === character.locationId &&
        distance(character.position, target.position) <=
            visibilityRadius(character, target, 64, now) &&
        world
            .navigationFor(character)
            .hasLineOfSight(character.position, target.position)
    )
}

function accepted(events: AgentDecisionResult['events']): AgentDecisionResult {
    return { accepted: true, error: null, events }
}
function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
