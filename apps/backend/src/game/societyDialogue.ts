import type { GameCharacter } from './character'
import type {
    ReactionAction,
    ReactionRequest,
    ReactionTrigger,
} from './characterReactions'
import type { NpcConflict } from './npcConflict'
import { afterNpcSpokenName } from './npcSpeechNames'
import type { GameRoom } from './room'
import type { NpcHeardSpeech } from './roomNpcConversations'
import { savvaHumanTrust } from './savvaTerritory'
import type { SocialHistory } from './socialHistory'
import { canHearSpeech } from './socialSpeech'

export interface HeardSocialReaction {
    trigger: ReactionTrigger
    action: ReactionAction
}

export type SpeechConflicts = Pick<
    NpcConflict,
    'apply' | 'availableForSpeech' | 'hasPhysicalReaction'
>
const minorSpeechWindowMs = 30_000
interface RecentSpeechScene {
    incidentId: string
    until: number
}
const recentSpeechScenes = new WeakMap<
    GameCharacter,
    Map<string, RecentSpeechScene>
>()

interface SpeechScene {
    npc: GameCharacter
    speaker: GameCharacter
    event: NpcHeardSpeech
    trigger: ReactionTrigger
    incidentId: string
}

/** Classify addressed utterances conservatively. Claims within player prose never establish facts. */
export function socialSpeechTrigger(text: string): ReactionTrigger | undefined {
    const line = text.normalize('NFC').toLowerCase().replaceAll('ё', 'е').trim()
    if (
        /^(?:пожалуйста[,\s]|прошу (?:тебя|вас)(?![\p{L}])|(?:помоги(?:те)?|проводи(?:те)?|покажи(?:те)?|отведи(?:те)?|иди(?:те)?)\s|сама? иди(?:\s|[.!?]*$)|please\s|(?:could|would) you (?:please|help|show|take|walk|go|follow)\b)/u.test(
            line
        )
    ) {
        return 'request'
    }
    if (/[«»“”"]/u.test(line)) {
        return undefined
    }
    if (
        /^(?:привет|здравствуй(?:те)?|добрый (?:день|вечер)|доброе утро|hello|hi|hey)[.!\s]*$/u.test(
            line
        )
    ) {
        return 'meeting'
    }
    if (
        /^(?:я (?:тебя|вас) (?:убью|ударю|изобью)|i(?:'ll| will) (?:kill|hit|hurt) you)(?![\p{L}])/u.test(
            line
        )
    ) {
        return 'threat'
    }
    if (
        /^(?:ты (?:дурак|дура|идиот|идиотка|ничтожество)|(?:you're|you are) (?:an idiot|a fool))(?![\p{L}])/u.test(
            line
        )
    ) {
        return 'insult'
    }
    return undefined
}

export function chooseHeardSocialReaction(
    room: GameRoom,
    history: SocialHistory,
    npc: GameCharacter,
    event: NpcHeardSpeech,
    conflicts?: SpeechConflicts
): HeardSocialReaction | undefined {
    if (!isCharacterizedSpeech(npc, event)) {
        return undefined
    }
    const speaker = room.getCharacter(event.senderId)
    const trigger = socialSpeechTrigger(addressedWords(npc, event.text))
    if (
        speaker === undefined ||
        trigger === undefined ||
        (event.nearby === 'broadcast' && trigger !== 'meeting')
    ) {
        return undefined
    }
    history.noteMeeting(npc.id, speaker.id)
    const incidentId =
        trigger === 'meeting'
            ? JSON.stringify(['met', speaker.id, npc.id, npc.locationId])
            : `speech:${event.id}:${npc.id}`
    const priorScene = rememberSpeechScene(npc, event, trigger, incidentId)
    const scene: SpeechScene = { npc, speaker, event, trigger, incidentId }
    if (recordRepeatedProvocation(room, history, scene, priorScene)) {
        return { trigger, action: 'ignore' }
    }
    recordSpeechIncident(room, history, scene)
    const relationship = history.relationship(npc.id, speaker.id, event.at)
    const reputation = history.knownReputation(
        npc.id,
        npc.locationId,
        speaker.id
    )
    const request: ReactionRequest = {
        incidentId: priorScene ?? incidentId,
        trigger,
        sourceId: speaker.id,
        severity: trigger === 'insult' ? 20 : 55,
        available: dialogueActions(trigger, conflicts, npc, speaker, event.at),
        context: {
            ...relationship,
            ...reputation,
            trust: Math.max(
                -100,
                relationship.trust + savvaHumanTrust(npc, speaker)
            ),
            healthFraction: npc.hp / Math.max(1, npc.maxHp),
            threat: trigger === 'threat' ? 45 : 0,
        },
    }
    return { trigger, action: npc.temperament.react(request, event.at).action }
}

function recordRepeatedProvocation(
    room: GameRoom,
    history: SocialHistory,
    scene: SpeechScene,
    priorScene: string | undefined
): boolean {
    const { npc, speaker, event, trigger, incidentId } = scene
    if (priorScene === undefined || trigger === 'request') {
        return false
    }
    if (isPublicSpeech(event)) {
        recordSpeechIncident(room, history, {
            ...scene,
            incidentId: priorScene,
        })
    }
    npc.temperament.emotions.observe(
        { incidentId, trigger, sourceId: speaker.id },
        20,
        event.at
    )
    return true
}

function rememberSpeechScene(
    npc: GameCharacter,
    event: NpcHeardSpeech,
    trigger: ReactionTrigger,
    incidentId: string
): string | undefined {
    if (trigger !== 'insult' && trigger !== 'threat' && trigger !== 'request') {
        return undefined
    }
    const now = event.at
    const recently =
        recentSpeechScenes.get(npc) ?? new Map<string, RecentSpeechScene>()
    const key = JSON.stringify([
        event.senderId,
        event.locationId,
        trigger,
        trigger === 'request'
            ? [requestWords(npc, event), event.focus?.key]
            : undefined,
    ])
    const prior = recently.get(key)
    if (prior !== undefined && prior.until > now) {
        return prior.incidentId
    }
    for (const [source, { until }] of recently) {
        if (until <= now) {
            recently.delete(source)
        }
    }
    recently.set(key, { incidentId, until: now + minorSpeechWindowMs })
    recentSpeechScenes.set(npc, recently)
    return undefined
}

function requestWords(npc: GameCharacter, event: NpcHeardSpeech): string {
    return addressedWords(npc, event.text)
        .normalize('NFC')
        .trim()
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[.!?…]+$/u, '')
        .replace(/\s+/gu, ' ')
}

function isCharacterizedSpeech(
    npc: GameCharacter,
    event: NpcHeardSpeech
): boolean {
    return (
        npc.controllerKind !== 'network_player' &&
        npc.soul.controlSource !== 'human' &&
        event.system !== true &&
        event.ambiguous !== true &&
        event.legacy !== true &&
        !event.id.startsWith('request:')
    )
}

function addressedWords(npc: GameCharacter, speech: string): string {
    return (
        afterNpcSpokenName(npc.id, npc.nickname, speech)?.replace(
            /^[\s,!?:.…—-]+/u,
            ''
        ) ?? speech
    )
}

function dialogueActions(
    trigger: ReactionTrigger,
    conflicts: SpeechConflicts | undefined,
    npc: GameCharacter,
    speaker: GameCharacter,
    now: number
): ReactionAction[] {
    switch (trigger) {
        case 'meeting':
            return ['greet', 'talk', 'ignore']
        case 'request':
            return ['help', 'decline']
        case 'insult':
        case 'threat':
            return [
                'talk',
                'ignore',
                ...(conflicts?.availableForSpeech(
                    npc,
                    speaker,
                    now,
                    trigger
                ) ?? ['warn', 'wait']),
            ]
        default:
            return ['talk']
    }
}

function recordSpeechIncident(
    room: GameRoom,
    history: SocialHistory,
    { npc, speaker, event, trigger, incidentId }: SpeechScene
): void {
    if (trigger === 'meeting') {
        history.record(
            {
                id: incidentId,
                kind: 'introduction',
                actorId: speaker.id,
                targetId: npc.id,
                locationId: npc.locationId,
                at: event.at,
                visibility: 'participants',
                severity: 1,
            },
            [npc.id]
        )
        return
    }
    if (trigger !== 'threat' && trigger !== 'insult') {
        return
    }
    const publicSpeech = isPublicSpeech(event)
    const navigation = room.navigationFor(speaker)
    const witnesses = publicSpeech
        ? room
              .charactersFor(speaker)
              .filter((observer) =>
                  canHearSpeech(observer, speaker, navigation, event.at)
              )
        : [npc]
    history.record(
        {
            id: incidentId,
            kind: trigger,
            actorId: speaker.id,
            targetId: npc.id,
            locationId: npc.locationId,
            at: event.at,
            ...(publicSpeech ? {} : { visibility: 'participants' as const }),
            severity: trigger === 'threat' ? 3 : 1,
        },
        witnesses.map((witness) => witness.id)
    )
}

function isPublicSpeech(event: NpcHeardSpeech): boolean {
    return event.channel === 'say' && event.nearby === 'addressed'
}
