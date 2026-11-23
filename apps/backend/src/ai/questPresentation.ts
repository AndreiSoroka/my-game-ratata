import type { AgentDecision, NpcQuestDecision } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { NpcQuestDecisionContext } from '../game/npcQuestTypes'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import { createSpeechEvent } from '../game/speechReceipts'
import type { NpcAiDiagnostics } from './diagnostics'
import { replySpeech, speechRadius } from './dialogueResult'
import { attributeNpcSpeech } from './memorySpeechAttribution'
import { completeNpcGreeting } from './npcBackgroundSpeech'
import { replySpeechLanguage } from './npcSpeechLanguage'
import type { NpcAiActorState } from './runtimeState'
import { rememberNpcReply } from './sessionMemory'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>
type Presentation = Extract<
    NpcQuestDecision,
    {
        type:
            'quest_propose' | 'worker_quest_propose' | 'quest_invitation_answer'
    }
>

export function completeNpcBackgroundPresentation(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number,
    finish: (accepted: boolean) => void
): boolean {
    if (completeNpcGreeting(room, state, reply, now)) {
        finish(true)
        return true
    }
    const accepted = completeBackgroundQuestPresentation(
        room,
        diagnostics,
        state,
        actor,
        reply,
        now
    )
    if (accepted === undefined) {
        return false
    }
    finish(accepted)
    return true
}

export function isQuestPresentation(
    decision: AgentDecision | null
): decision is Presentation {
    return (
        decision !== null &&
        [
            'quest_propose',
            'worker_quest_propose',
            'quest_invitation_answer',
        ].includes(decision.type)
    )
}

/** Provenance comes from an actual heard event, never model-supplied permission fields. */
export function npcQuestExecutionContext(
    state: NpcAiActorState,
    reply: NpcAiReply,
    event: Heard | undefined = state.dialogue
): NpcQuestDecisionContext {
    const fresh =
        event !== undefined && event.system !== true && event.ambiguous !== true
    const introduction = replySpeech(reply)?.slice(
        0,
        event?.legacy === true ? 160 : 400
    )
    return {
        autonomous: !fresh,
        ...(introduction === undefined ? {} : { introduction }),
        ...(fresh
            ? {
                  freshDialogueTargetId: event.senderId,
                  freshDialogueMessageId: event.id,
                  freshDialogueAt: event.at,
              }
            : {}),
    }
}

/** Identical preflight and commit checks cover dialogue and autonomous invitations. */
export function npcQuestPresentationProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    if (!isQuestPresentation(reply.decision)) {
        return questRevisionProblem(room, actor, reply.decision, now)
    }
    const decision = reply.decision
    const context = npcQuestExecutionContext(state, reply)
    if (
        state.config.mode === 'dialogue_only' ||
        state.dialogue?.ambiguous === true
    ) {
        return unavailable(
            'quest_context',
            'Сейчас нельзя предложить договор этому собеседнику.'
        )
    }
    if (context.introduction === undefined) {
        return unavailable(
            'quest_speech_required',
            'Нужна собственная короткая реплика: сначала пригласи обсудить задание, а в ответ на согласие или прямую просьбу представь условия. Не показывай молча окно.'
        )
    }
    const target = room.getCharacter(decision.targetId)
    const radius =
        state.dialogue === undefined ? 80 : speechRadius(state.dialogue)
    if (
        target === undefined ||
        !canHearSpeech(target, actor, room.navigationFor(actor), now, radius)
    ) {
        return unavailable(
            'quest_contact',
            'Адресат не услышит реплику; предложение сейчас не доставляется.'
        )
    }
    const error = room.social.quests.previewDecision(
        actor,
        decision,
        now,
        context
    )
    return error === undefined
        ? undefined
        : unavailable('quest_presentation', error)
}

/** Background tasks have no requester. Address the actual validated proposal recipient. */
function publishQuestInvitationSpeech(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: Presentation,
    reply: NpcAiReply,
    now: number
): void {
    const text = replySpeech(reply)
    if (text !== null) {
        room.publishEvents([
            attributeNpcSpeech(
                {
                    ...createSpeechEvent(actor, text.slice(0, 400)),
                    language: replySpeechLanguage(room, state, reply, now),
                },
                decision.targetId
            ),
        ])
    }
}

/** Resolve a proposal and deliver its question as one simulation-owned operation. */
export function completeBackgroundQuestPresentation(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): boolean | undefined {
    if (!isQuestPresentation(reply.decision)) {
        return undefined
    }
    const result = room.social.decide(
        actor,
        reply.decision,
        now,
        npcQuestExecutionContext(state, reply)
    )
    diagnostics.record({
        actorId: actor.id,
        taskId: state.task?.id ?? '',
        request: state.task?.request ?? '',
        category: result.accepted ? 'action_completed' : 'action_rejected',
        action: reply.decision,
        reason: result.error ?? 'invitation_delivered',
        at: now,
    })
    room.publishEvents(result.events)
    if (result.accepted) {
        publishQuestInvitationSpeech(
            room,
            state,
            actor,
            reply.decision,
            reply,
            now
        )
        rememberNpcReply(state, reply.memory)
    }
    return result.accepted
}

function unavailable(code: string, detail: string): NpcReplyProblem {
    return { code: 'command_unavailable', reason: { code, detail } }
}

function questRevisionProblem(
    room: GameRoom,
    actor: GameCharacter,
    decision: AgentDecision | null,
    now: number
): NpcReplyProblem | undefined {
    if (decision?.type !== 'quest_offer_revise') {
        return undefined
    }
    const error = room.social.quests.previewDecision(actor, decision, now)
    return error === undefined
        ? undefined
        : unavailable('quest_revision', error)
}
