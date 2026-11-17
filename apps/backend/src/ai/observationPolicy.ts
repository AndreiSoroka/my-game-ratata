import type { AdventureDialogue } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { npcAiDecisionError } from './actions'
import type { NpcAiObservation, NpcAiTarget } from './observationTypes'
import type { NpcAiRole } from './types'

const roleConstraints: Record<NpcAiRole, string> = {
    city_coordinator:
        'Coordinate city help through validated quest proposals, finite municipal quest funding and existing worker requests. Cannot mint goods or refill funds.',
    companion:
        'Accept one requester at a time. Companion follow and consent use ordinary game rules.',
}

export function filterNpcAiTargets(
    actor: GameCharacter,
    role: NpcAiRole,
    targets: readonly NpcAiTarget[]
): NpcAiTarget[] {
    return targets.map((target) => ({
        ...target,
        commands: target.commands.filter(
            (decision) =>
                npcAiDecisionError(actor, role, decision) === undefined
        ),
    }))
}

export function filterNpcAiDialogue(
    actor: GameCharacter,
    role: NpcAiRole,
    dialogue: AdventureDialogue | null
): AdventureDialogue | null {
    return dialogue === null
        ? null
        : {
              ...dialogue,
              choices: dialogue.choices.filter(
                  (choice) =>
                      npcAiDecisionError(actor, role, {
                          type: 'dialogue_choice',
                          choiceId: choice.id,
                      }) === undefined
              ),
          }
}

export function npcAiCapabilities(
    role: NpcAiRole,
    targets: readonly NpcAiTarget[],
    dialogue: AdventureDialogue | null
): NonNullable<NpcAiObservation['capabilities']> {
    return {
        intentions: [
            ...new Set([
                'speak',
                'wait',
                'cancel_control',
                'quest_propose',
                'worker_quest_propose',
                ...targets.flatMap((target) =>
                    target.commands.map((command) => command.type)
                ),
                ...(dialogue === null ? [] : ['dialogue_choice']),
            ]),
        ],
        constraints: [
            'AI errands in this version stay within the city. Combat is refused by these peaceful NPC profiles.',
            roleConstraints[role],
            'May choose ordinary waypoints from earned visible information. No dedicated avoid-enemies routing or conditional danger-trigger intention is exposed to this AI controller. Shared combat and flee controllers exist elsewhere in the game.',
        ],
        navigation: {
            mapCollision: true,
            automaticEnemyAvoidance: false,
            conditionalDangerTriggers: false,
        },
    }
}

export function updateNpcAiSocialCapabilities(
    observation: NpcAiObservation
): void {
    const capabilities = observation.capabilities
    if (capabilities === undefined) {
        return
    }
    capabilities.intentions = capabilities.intentions.filter(
        (type) => !type.startsWith('exchange_')
    )
    const exchange = observation.social?.exchange
    if (exchange?.status === 'invited' && exchange.incoming) {
        capabilities.intentions.push('exchange_answer')
    }
    if (exchange?.status === 'active') {
        capabilities.intentions.push(
            'exchange_offer',
            'exchange_accept',
            'exchange_decline'
        )
    }
}
