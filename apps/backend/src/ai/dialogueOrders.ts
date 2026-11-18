import type { CompanionWaitMode, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { NpcAiReply } from './types'

export function applyNpcCompanionOrder(
    room: GameRoom,
    companions: CompanionService,
    actor: GameCharacter,
    requester: GameCharacter,
    order: NonNullable<NpcAiReply['companionOrder']>,
    now: number,
    waitMode?: CompanionWaitMode,
    heardAnchor?: { locationId: string; position: Vector2 }
): boolean {
    if (
        order === 'wait' &&
        heardAnchor !== undefined &&
        heardAnchor.locationId !== actor.locationId
    ) {
        return false
    }
    const result = companions.applyModelOrder(
        requester,
        actor,
        {
            type: 'companion_request',
            targetId: actor.id,
            request: order,
            ...(waitMode === undefined ? {} : { waitMode }),
        },
        now,
        npcAssistanceContext(room)
    )
    const accepted = result.accepted
    if (accepted && order === 'wait' && heardAnchor !== undefined) {
        companions.setWaitAnchor(actor, requester.id, heardAnchor)
    }
    return accepted
}

export function consumeNpcWait(
    room: GameRoom,
    companions: CompanionService,
    actor: GameCharacter,
    requester: GameCharacter,
    now: number
): void {
    companions.consumeWaitForAcceptedTask(
        actor,
        requester,
        {
            modelConsent: true,
            questCompleted: (id, questId) =>
                room.adventureForWorkers().hasCompletedQuest(id, questId),
            hasLineOfSight: (left, right) =>
                room
                    .navigationFor(left)
                    .hasLineOfSight(left.position, right.position),
        },
        now
    )
}

export function npcAssistanceContext(room: GameRoom) {
    return {
        modelConsent: true,
        conversation: true,
        questCompleted: (id: string, questId: string) =>
            room.adventureForWorkers().hasCompletedQuest(id, questId),
        hasLineOfSight: (left: GameCharacter, right: GameCharacter) =>
            room
                .navigationFor(left)
                .hasLineOfSight(left.position, right.position),
    }
}
