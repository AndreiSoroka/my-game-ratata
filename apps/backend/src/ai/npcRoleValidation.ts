import type { GameCharacter } from '../game/character'
import {
    kaplyaSafetyActive,
    visibleKaplyaThreat,
} from '../game/companionSafety'
import { isConversationOnly, npcCanOfferService } from '../game/npcRoster'
import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiReply } from './types'

export function npcRoleProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    return (
        serviceOfferProblem(room, state, actor, reply) ??
        physicalRoleProblem(room, state, actor, reply, now)
    )
}

function serviceOfferProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    if (
        reply.offerService != null &&
        (state.config.role !== 'advisor' ||
            state.dialogue === undefined ||
            state.dialogue.system === true ||
            !npcCanOfferService(actor.id, reply.offerService) ||
            room.getCharacter(state.dialogue.senderId)?.controllerKind !==
                'network_player')
    ) {
        return problem(
            'service_unavailable',
            'Эта услуга недоступна в текущем разговоре.'
        )
    }
    return undefined
}

function takesWorldAction(reply: NpcAiReply): boolean {
    const decision = reply.decision?.type
    return (
        reply.companionOrder != null ||
        reply.taskAcceptance === 'accept' ||
        reply.taskAcceptance === 'replace' ||
        (decision !== undefined && decision !== 'speak' && decision !== 'wait')
    )
}

function physicalRoleProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    const changesWorld = takesWorldAction(reply)
    if (
        isConversationOnly(state.config.role, state.config.mode) &&
        (changesWorld || state.dialogue === undefined)
    ) {
        return problem(
            'dialogue_only',
            'Здесь доступен только ответ текущему собеседнику и предложение разрешённой услуги.'
        )
    }
    if (
        changesWorld &&
        actor.id === 'npc_magic_slime_1' &&
        (kaplyaSafetyActive(actor) ||
            visibleKaplyaThreat(actor, room, now) !== undefined)
    ) {
        return problem(
            'companion_safety',
            'Капля сейчас уходит от опасности или возвращается домой.'
        )
    }
    return undefined
}

function problem(code: string, detail: string): NpcReplyProblem {
    return { code: 'command_unavailable', reason: { code, detail } }
}
