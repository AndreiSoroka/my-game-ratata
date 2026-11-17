import type {
    CompanionWaitMode,
    GameEventPayload,
    Vector2,
} from '@my-game-ratata/contracts'

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
    heardAnchor?: { locationId: string; position: Vector2 },
    modelSpeech?: string | null
): boolean {
    if (
        order === 'wait' &&
        heardAnchor !== undefined &&
        heardAnchor.locationId !== actor.locationId
    ) {
        return false
    }
    companions.rememberMeeting(requester, actor)
    const events = companions.handle(
        requester,
        {
            type: 'companion_request',
            targetId: actor.id,
            request: order,
            ...(waitMode === undefined ? {} : { waitMode }),
        },
        [actor, requester],
        now,
        {
            modelConsent: true,
            questCompleted: (id, questId) =>
                room.adventureForWorkers().hasCompletedQuest(id, questId),
            hasLineOfSight: (left, right) =>
                room
                    .navigationFor(left)
                    .hasLineOfSight(left.position, right.position),
        }
    )
    const accepted =
        order === 'dismiss'
            ? actor.soul.companion?.leaderId == null
            : actor.soul.companion?.leaderId === requester.id &&
              actor.soul.companion.order === order
    room.publishEvents(
        companionReplyEvents(
            events,
            actor.id,
            requester.id,
            accepted,
            modelSpeech
        )
    )
    if (accepted && order === 'wait' && heardAnchor !== undefined) {
        companions.setWaitAnchor(actor, requester.id, heardAnchor)
    }
    return accepted
}

function companionReplyEvents(
    events: GameEventPayload[],
    actorId: string,
    requesterId: string,
    accepted: boolean,
    modelSpeech: string | null | undefined
): GameEventPayload[] {
    if (!accepted || modelSpeech == null || modelSpeech.trim().length === 0) {
        return events
    }
    return events.filter(
        (event) =>
            event.kind !== 'chat' ||
            event.actorId !== actorId ||
            event.targetId !== requesterId
    )
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
