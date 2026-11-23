import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import { speechRadius } from './dialogueResult'
import { stopNpcSelfTravelEscort } from './guide'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
import type { NpcAiEvent } from './types'

export function withdrawNpcCompanion(
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    actor: GameCharacter,
    requesterId: string,
    now: number
): boolean {
    if (stopNpcSelfTravelEscort(state.guide, requesterId)) {
        if (state.dialogue?.senderId === requesterId) {
            sessions.cancelInference(state, now)
        }
        companions.recordFollowRefusal(actor, requesterId)
        return true
    }
    if (actor.soul.companion?.leaderId !== requesterId) {
        return false
    }
    sessions.cancel(state, now)
    companions.recordFollowRefusal(actor, requesterId)
    return companions.releaseAssistance(requesterId, actor)
}

export function respectSpokenFollowRefusal(
    room: GameRoom,
    companions: CompanionService,
    states: Iterable<NpcAiActorState>,
    requester: GameCharacter,
    event: Extract<NpcAiEvent, { kind: 'message' }>,
    targetId: string | undefined,
    withdraw: (npcId: string) => boolean
): void {
    if (
        event.system === true ||
        requester.controllerKind !== 'network_player' ||
        !isExplicitFollowRefusal(event.text, targetId !== undefined)
    ) {
        return
    }
    for (const state of states) {
        const npc = state.actor
        if (
            npc === undefined ||
            (targetId !== undefined && npc.id !== targetId) ||
            !canHearSpeech(
                npc,
                requester,
                room.navigationFor(npc),
                event.at,
                speechRadius(event)
            )
        ) {
            continue
        }
        if (
            !withdraw(npc.id) &&
            companions.hasFollowProposal(npc, requester.id, event.at)
        ) {
            companions.recordFollowRefusal(npc, requester.id)
        }
    }
}

function isExplicitFollowRefusal(speech: string, addressed: boolean): boolean {
    const text = speech
        .trim()
        .toLowerCase()
        .replace(/[.!…]+$/u, '')
    const direct = addressed ? text.replace(/^[^,]+,\s*/u, '') : text
    return [
        'не следуй за мной',
        'не иди за мной',
        "don't follow me",
        'do not follow me',
    ].includes(direct)
}
