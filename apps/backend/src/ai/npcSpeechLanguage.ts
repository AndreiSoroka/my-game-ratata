import {
    type AgentDecision,
    detectSpeechLanguage,
    type GameLocale,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import type { NpcAiObservation } from './observationTypes'
import type { NpcAiActorState } from './runtimeState'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiContext, NpcAiReply } from './types'

export function npcSpeechLanguageContext(
    room: GameRoom,
    state: NpcAiActorState,
    observation: NpcAiObservation,
    actor: GameCharacter,
    now: number
): Pick<
    NpcAiContext,
    'speechLanguage' | 'speechLanguagesByTarget' | 'questOfferLanguage'
> {
    const speechLanguage = currentSpeechLanguage(room, state)
    return speechLanguage === undefined
        ? {
              speechLanguage: 'ru',
              speechLanguagesByTarget: audiblePlayerLanguages(
                  room,
                  observation,
                  actor,
                  now
              ),
          }
        : {
              speechLanguage,
              questOfferLanguage: room.localeFor(
                  state.dialogue?.senderId ??
                      state.task?.requesterId ??
                      state.task?.targetId ??
                      ''
              ),
          }
}

function audiblePlayerLanguages(
    room: GameRoom,
    observation: NpcAiObservation,
    actor: GameCharacter,
    now: number
): NonNullable<NpcAiContext['speechLanguagesByTarget']> {
    return Object.fromEntries(
        observation.targets.flatMap((entry) => {
            if (entry.kind !== 'character') {
                return []
            }
            const target = room.getCharacter(entry.id)
            return target?.controllerKind === 'network_player' &&
                canHearSpeech(target, actor, room.navigationFor(actor), now)
                ? [[target.id, room.localeFor(target.id)]]
                : []
        })
    )
}

function currentSpeechLanguage(
    room: GameRoom,
    state: NpcAiActorState
): GameLocale | undefined {
    if (state.dialogue !== undefined) {
        return (
            state.dialogue.language ?? room.localeFor(state.dialogue.senderId)
        )
    }
    const task = state.task
    if (task?.language !== undefined) {
        return task.language
    }
    const partnerId = task?.requesterId ?? task?.targetId
    return partnerId == null ? undefined : room.localeFor(partnerId)
}

/** Autonomous targeted speech uses only a currently audible recipient's locale. */
export function replySpeechLanguage(
    room: GameRoom,
    state: NpcAiActorState,
    reply: NpcAiReply,
    now: number
): GameLocale {
    const current = currentSpeechLanguage(room, state)
    if (current !== undefined) {
        return current
    }
    const targetId = directSpeechTarget(reply.decision)
    const target =
        targetId === undefined ? undefined : room.getCharacter(targetId)
    const speaker = state.actor
    return target?.controllerKind === 'network_player' &&
        speaker !== undefined &&
        canHearSpeech(target, speaker, room.navigationFor(speaker), now)
        ? room.localeFor(target.id)
        : 'ru'
}

function directSpeechTarget(
    decision: AgentDecision | null
): string | undefined {
    switch (decision?.type) {
        case 'speak':
        case 'quest_propose':
        case 'worker_quest_propose':
        case 'quest_invitation_answer':
        case 'propose_follow':
        case 'start_following':
            return decision.targetId
        default:
            return undefined
    }
}

export function npcSpeechLanguageProblem(
    reply: NpcAiReply,
    expected: GameLocale
): NpcReplyProblem | undefined {
    const spoken = [
        reply.speech,
        reply.decision?.type === 'speak' ? reply.decision.text : undefined,
    ]
    const mismatched = spoken.some((text) => {
        const actual = text == null ? undefined : detectSpeechLanguage(text)
        return actual !== undefined && actual !== expected
    })
    if (!mismatched) {
        return undefined
    }
    const name = expected === 'en' ? 'English' : 'Russian'
    return {
        code: 'speech_language',
        reason: {
            code: 'speech_language',
            detail: `Rewrite the spoken reply in ${name}. Keep its meaning and the structured decision unchanged.`,
        },
    }
}
