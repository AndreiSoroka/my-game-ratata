import type { ExchangeSnapshot } from './exchange'
import type { LocalizedMessage } from './locales'
import type { GameLocale } from './locales'
import type { NpcQuestSocialSnapshot } from './npcQuests'

export const PUBLIC_SPEECH_RADIUS = 80

export type SpeechChannel = 'say' | 'whisper'

export interface SpeechFocus {
    key: string
    id: string
    kind: string
    name: string
    position: import('./index').Vector2
    details: Record<string, unknown>
}

export interface SpeechActivityCommand {
    type: 'speech_activity'
    active: boolean
    channel: SpeechChannel
    targetId?: string
    activityId: string
}

export interface SpeechActivitySnapshot {
    actorId: string
    id: string
    kind: 'typing' | 'thinking'
}

export type NpcRequestState =
    | 'heard'
    | 'queued'
    | 'thinking'
    | 'accepted'
    | 'declined'
    | 'started'
    | 'completed'
    | 'failed'
    | 'undelivered'
    | 'cancelled'

export interface NpcRequestStatus {
    id: string
    npcId: string
    state: NpcRequestState
    reason?: string
    reasonMessage?: LocalizedMessage
    /** Original request, projected only to its author. */
    request?: string
    at: number
}

export interface CharacterInteractions {
    aiDialogue: boolean
    whisper: boolean
    exchange: boolean
    /** Which companion actions this viewer can request. */
    companionRequests?: 'available' | 'occupied' | 'own'
}

export type WhisperClientMessage =
    | { type: 'whisper_open'; targetId: string }
    | { type: 'whisper'; targetId: string; text: string }
    | { type: 'whisper_close' }

export interface PrivateSpeechSnapshot {
    id: string
    senderId: string
    text: string
    textMessage?: LocalizedMessage
    at: number
    language?: GameLocale
    /** Present only in the receiving player's projection. */
    translation?: SpeechTranslation
}

export interface SpeechTranslation {
    locale: GameLocale
    text: string
}

export interface HeardPrivateSpeech extends PrivateSpeechSnapshot {
    partnerId: string
    partnerName: string
    senderName: string
}

export interface WhisperSnapshot {
    partnerId: string
    partnerName: string
    available: boolean
    messages: PrivateSpeechSnapshot[]
}

export interface SocialSnapshot extends NpcQuestSocialSnapshot {
    privateMessages?: HeardPrivateSpeech[]
    speechActivity?: SpeechActivitySnapshot[]
    requestStatuses?: NpcRequestStatus[]
    exchange?: ExchangeSnapshot | null
    whisper?: WhisperSnapshot | null
}

export interface ChatClientMessage {
    targetId?: string
    focusKey?: string
    text: string
    type: 'chat'
}
