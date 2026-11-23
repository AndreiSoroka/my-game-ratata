import type { GameCharacter } from '../game/character'
import type { CharacterEmotionSnapshot } from '../game/characterEmotions'
import type { CharacterTraits } from '../game/characterTraits'
import {
    opensWithWarning,
    speechWarningTrigger,
    warningOpenings,
} from '../game/npcWarningSpeech'
import type { GameRoom } from '../game/room'
import { savvaHumanTrust } from '../game/savvaTerritory'
import type {
    KnownSocialIncident,
    SocialRelationship,
    SocialReputation,
} from '../game/socialHistoryTypes'
import type { HeardSocialReaction } from '../game/societyDialogue'
import { replySpeech } from './dialogueResult'
import type { NpcAiActorState } from './runtimeState'
import { npcReplyNeedsTask } from './taskConsent'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiReply } from './types'

interface IncidentInContext extends KnownSocialIncident {
    actorName: string | undefined
    targetName: string | undefined
    sourceName: string | undefined
}

export interface NpcTemperamentContext {
    traits: CharacterTraits
    emotions: CharacterEmotionSnapshot
    reaction?: HeardSocialReaction
    warningOpenings?: readonly string[]
    speaker?: {
        relationship: SocialRelationship
        reputation: SocialReputation
    }
    knownIncidents: IncidentInContext[]
}

/** Each context projects only this living NPC's emotions, relationships and earned news. */
export function npcTemperamentContext(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): NpcTemperamentContext {
    const history = room.social.society.history
    const dialogue = state.dialogue
    const speakerId =
        dialogue?.ambiguous === true ? undefined : dialogue?.senderId
    const all = history
        .knownIncidents(actor.id, actor.locationId)
        .filter(({ kind }) => kind !== 'introduction' && kind !== 'request')
    const relevant =
        speakerId === undefined ? all : prioritizeSpeaker(all, speakerId)
    return {
        traits: actor.temperament.traits,
        emotions: actor.temperament.emotions.snapshot(now),
        ...(dialogue?.socialReaction === undefined
            ? {}
            : { reaction: dialogue.socialReaction }),
        ...warningContext(room, dialogue),
        ...(speakerId === undefined
            ? {}
            : {
                  speaker: {
                      relationship: speakerRelationship(
                          room,
                          actor,
                          speakerId,
                          now
                      ),
                      reputation: history.knownReputation(
                          actor.id,
                          actor.locationId,
                          speakerId
                      ),
                  },
              }),
        knownIncidents: relevant.slice(0, 6).map((known) => ({
            ...known,
            actorName: room.getCharacter(known.actorId)?.nickname,
            targetName: room.getCharacter(known.targetId)?.nickname,
            sourceName: room.getCharacter(known.heardFromId ?? known.witnessId)
                ?.nickname,
        })),
    }
}

function speakerRelationship(
    room: GameRoom,
    actor: GameCharacter,
    speakerId: string,
    now: number
): SocialRelationship {
    const relationship = room.social.society.history.relationship(
        actor.id,
        speakerId,
        now
    )
    const speaker = room.getCharacter(speakerId)
    return speaker === undefined
        ? relationship
        : {
              ...relationship,
              trust: Math.max(
                  -100,
                  relationship.trust + savvaHumanTrust(actor, speaker)
              ),
          }
}

function warningContext(
    room: GameRoom,
    dialogue: NpcAiActorState['dialogue']
): Pick<NpcTemperamentContext, 'warningOpenings'> {
    const trigger = speechWarningTrigger(dialogue?.socialReaction)
    return dialogue === undefined || trigger === undefined
        ? {}
        : {
              warningOpenings: warningOpenings(
                  trigger,
                  dialogue.language ?? room.localeFor(dialogue.senderId)
              ),
          }
}

function prioritizeSpeaker(
    incidents: KnownSocialIncident[],
    speakerId: string
) {
    const aboutSpeaker = (known: KnownSocialIncident) =>
        known.actorId === speakerId || known.targetId === speakerId
    return [
        ...incidents.filter(aboutSpeaker),
        ...incidents.filter((known) => !aboutSpeaker(known)),
    ]
}

export function socialReactionProblem(
    room: GameRoom,
    state: NpcAiActorState,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    const dialogue = state.dialogue
    const reaction = dialogue?.socialReaction
    const trigger = speechWarningTrigger(reaction)
    if (dialogue !== undefined && trigger !== undefined) {
        return warningReplyProblem(
            reply,
            trigger,
            dialogue.language ?? room.localeFor(dialogue.senderId)
        )
    }
    if (reaction === undefined || !claimsPhysicalRequest(reply)) {
        return undefined
    }
    if (
        reaction.action === 'help' ||
        reaction.action === 'talk' ||
        reaction.action === 'greet'
    ) {
        return undefined
    }
    return {
        code: 'command_unavailable',
        reason: {
            code: 'social_reaction',
            detail: 'Ты решил не принимать эту просьбу. Сформулируй свой ответ без обещания выполнить её.',
        },
    }
}

function warningReplyProblem(
    reply: NpcAiReply,
    trigger: import('../game/npcWarningSpeech').SpeechWarningTrigger,
    language: import('@my-game-ratata/contracts').GameLocale
): NpcReplyProblem | undefined {
    if (
        (reply.decision === null || reply.decision.type === 'speak') &&
        !claimsPhysicalRequest(reply) &&
        reply.offerService == null &&
        opensWithWarning(replySpeech(reply), trigger, language)
    ) {
        return undefined
    }
    const options = warningOpenings(trigger, language)
    return {
        code: 'command_unavailable',
        reason: {
            code: 'warning_required',
            detail: `Start the spoken warning with exactly one of these sentences: ${options.join(' / ')} You may add a short natural remark. Use no action other than speech.`,
        },
    }
}

function claimsPhysicalRequest(reply: NpcAiReply): boolean {
    return (
        npcReplyNeedsTask(reply) ||
        reply.taskAcceptance === 'accept' ||
        reply.taskAcceptance === 'replace'
    )
}
