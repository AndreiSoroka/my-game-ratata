import type {
    AdventureDialogue,
    CharacterSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { npcAiDecisionError } from './actions'
import type { NpcAiObservation, NpcAiTarget } from './observationTypes'
import type { NpcAiRole } from './types'

const roleConstraints: Record<NpcAiRole, string> = {
    advisor:
        'Answer questions from own learned knowledge. Dialogue only: never control movement, combat or property.',
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
                ...(role === 'advisor'
                    ? []
                    : [
                          'worker_quest_propose',
                          'quest_invitation_answer',
                          'guide',
                          'quest_offer_revise',
                          'quest_turn_in_request',
                          'quest_inquire',
                      ]),
                ...targets.flatMap((target) =>
                    target.commands.map((command) => command.type)
                ),
                ...(dialogue === null ? [] : ['dialogue_choice']),
            ]),
        ],
        constraints: [
            role === 'companion'
                ? 'May guide a consenting requester to known locations and landmarks across the region through ordinary roads and borders. Plain waypoints stay on the current map; regional guide selects validated adjacent exits. Following remains available. Combat still follows this character’s capabilities and peaceful personality.'
                : 'City coordinators stay within the city; advisors explain without travelling. Combat is refused by these peaceful NPC profiles.',
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
    if (
        observation.targets.some(
            (target) =>
                target.kind === 'character' &&
                target.details['exchangeAvailable'] === true
        )
    ) {
        capabilities.intentions.push('exchange_invite')
    }
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

export function characterSocialDetails(
    actor: GameCharacter,
    target: CharacterSnapshot
) {
    return {
        reputationWithMe: target.reputation[actor.faction] ?? 0,
        exchangeAvailable: target.interactions?.exchange === true,
    }
}
