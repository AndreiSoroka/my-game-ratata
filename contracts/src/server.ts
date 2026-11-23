import type { GameEventPayload } from './events'
import type { MapSummary, WorldSnapshot } from './index'
import type { PlantTreePreview } from './planting'
import type { ContractProtocolVersion } from './service'
import type { SpeechTranslation } from './social'

export interface WorldInitServerMessage {
    map: MapSummary
    playerId: string
    protocolVersion: ContractProtocolVersion
    snapshot: WorldSnapshot
    tickMs: number
    type: 'world_init'
}

export interface GameEventServerMessage {
    event: GameEventPayload
    serverTime: number
    type: 'event'
}

export interface SnapshotServerMessage {
    snapshot: WorldSnapshot
    type: 'snapshot'
}

export interface SpeechTranslationServerMessage extends SpeechTranslation {
    type: 'speech_translation'
    actorId: string
    speechId: number
}

export interface ErrorServerMessage {
    code: string
    message: string
    type: 'error'
}

export type ServerMessage =
    | PlantTreePreview
    | ErrorServerMessage
    | GameEventServerMessage
    | SnapshotServerMessage
    | SpeechTranslationServerMessage
    | WorldInitServerMessage
