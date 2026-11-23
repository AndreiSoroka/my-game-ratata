import {
    ABILITY_DEFINITIONS,
    type CreatureType,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    prayerAbilityIds,
    profileForPrayer,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { prayerParameters } from '../game/prayerParameters'
import type { GameRoom } from '../game/room'
import {
    attemptSavvaPersuasion,
    savvaPersuasionContext,
} from '../game/savvaTerritory'
import { canUseResurrection } from '../game/skillProgression'
import type { NpcAiActorState } from './runtimeState'
import type { TurnInformation } from './turnInformation'
import type {
    NpcAiContext,
    NpcAiEvent,
    NpcAiReply,
    SavvaPersuasionResult,
} from './types'

export interface LearnedPrayerFact {
    abilityId: PrayerAbilityId
    name: string
    resourceRestored: ReturnType<typeof profileForPrayer>['resource']
    restores: readonly CreatureType[]
    resurrects: readonly CreatureType[]
    purifiesGraves: boolean
    harmUnlocked: boolean
}

export function savvaDialogueFacts(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): Pick<NpcAiContext, 'savvaPersuasion' | 'learnedPrayers'> {
    if (state.config.role !== 'necromancer') {
        return {}
    }
    return {
        learnedPrayers: prayerAbilityIds
            .filter((id) => actor.abilities.known.has(id))
            .map((id) => learnedPrayerFact(actor, id)),
        ...(savvaPersuasionOffer(room, actor, state.dialogue, now) === undefined
            ? {}
            : { savvaPersuasion: { stage: 'available' } }),
    }
}

function learnedPrayerFact(
    actor: GameCharacter,
    id: PrayerAbilityId
): LearnedPrayerFact {
    const profile = profileForPrayer(id)
    return {
        abilityId: id,
        name: ABILITY_DEFINITIONS[id].name,
        resourceRestored: profile.resource,
        restores: profile.restoreTypes,
        resurrects: canUseResurrection(actor, id) ? profile.reviveTypes : [],
        purifiesGraves: PRAYER_SCHOOL_DEFINITIONS[id].canPurify,
        harmUnlocked: prayerParameters(actor, 0, id).harm,
    }
}

export function savvaPersuasionOffer(
    room: GameRoom,
    actor: GameCharacter,
    event: Extract<NpcAiEvent, { kind: 'message' }> | undefined,
    now: number
) {
    if (
        actor.npcIdentityProfile?.key !== 'savva' ||
        event?.channel !== 'say' ||
        event.nearby !== 'addressed' ||
        event.ambiguous === true ||
        event.system === true ||
        event.legacy === true
    ) {
        return undefined
    }
    const speaker = room.getCharacter(event.senderId)
    const offer =
        speaker === undefined
            ? undefined
            : savvaPersuasionContext(actor, speaker, room, now)
    return speaker === undefined || offer === undefined
        ? undefined
        : { episode: offer.episode, event, speaker }
}

/** The model classifies speech. Only a still-current simulation turn may roll. */
export function prepareSavvaPersuasion(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    current: () => boolean,
    now: number
): (() => Promise<SavvaPersuasionResult | undefined>) | undefined {
    const offer = savvaPersuasionOffer(room, actor, state.dialogue, now)
    if (offer === undefined) {
        return undefined
    }
    const { event, speaker, episode } = offer
    return () =>
        new Promise((resolve) => {
            state.pendingPersuasion = (at) => {
                if (
                    !current() ||
                    state.dialogue !== event ||
                    room.getCharacter(speaker.id) !== speaker
                ) {
                    resolve(undefined)
                    return
                }
                resolve(
                    attemptSavvaPersuasion(
                        actor,
                        speaker,
                        room,
                        at,
                        episode,
                        event.id
                    )
                )
            }
        })
}

export async function narrateSavvaPersuasion(
    input: NpcAiContext,
    information: TurnInformation,
    decide: (input: NpcAiContext) => Promise<NpcAiReply>,
    aborted: Promise<never>,
    valid: (input: NpcAiContext, reply: NpcAiReply) => boolean
): Promise<NpcAiReply> {
    if (
        input.savvaPersuasion?.stage !== 'available' ||
        information.attemptPersuasion === undefined
    ) {
        throw new Error('Persuasion is unavailable')
    }
    if (information.reserveCall?.() !== true) {
        throw new Error('Persuasion call budget exhausted')
    }
    const result = await Promise.race([
        information.attemptPersuasion(),
        aborted,
    ])
    assertPersuasionCurrent(information)
    const narration = narrationContext(input, information, result)
    const reply = await decide(narration).catch(() => undefined)
    assertPersuasionCurrent(information)
    const fallback = savvaPersuasionFallback(narration, result)
    if (
        reply === undefined ||
        reply.informationRequest != null ||
        typeof reply.speech !== 'string' ||
        reply.speech.trim() === '' ||
        !valid(narration, reply)
    ) {
        return fallback
    }
    return { ...fallback, speech: reply.speech }
}

function assertPersuasionCurrent(information: TurnInformation): void {
    if (information.current?.() === false) {
        throw new Error('Persuasion turn was cancelled')
    }
}

function narrationContext(
    input: NpcAiContext,
    information: TurnInformation,
    result: SavvaPersuasionResult | undefined
): NpcAiContext {
    const scope = information.scope?.() ?? input.knowledgeScope
    return {
        ...input,
        ...information.refreshContext?.(),
        savvaPersuasion:
            result === undefined
                ? { stage: 'unavailable' }
                : { stage: 'resolved', ...result },
        ...(scope === undefined
            ? {}
            : {
                  knowledgeScope: {
                      ...scope,
                      canSearch: false,
                      lookupsRemaining: 0,
                  },
              }),
    }
}

function savvaPersuasionFallback(
    input: NpcAiContext,
    result: SavvaPersuasionResult | undefined
): NpcAiReply {
    const speech =
        input.speechLanguage === 'en'
            ? result === undefined
                ? 'I have heard you. We can speak of this another time.'
                : result.success
                  ? 'Very well. I will stop treating every living human as an enemy.'
                  : 'Your words do not change my mind.'
            : result === undefined
              ? 'Я тебя услышал. Поговорим об этом в другой раз.'
              : result.success
                ? 'Хорошо. Я перестану считать каждого живого человека врагом.'
                : 'Твои слова не изменили моего решения.'
    return {
        decision: null,
        memory: input.memory,
        done: true,
        waitMs: 0,
        speech,
    }
}
