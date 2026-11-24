import type { GameEventPayload } from './events'
import type { MapSummary, WorldSnapshot } from './index'
import type { MotionPongServerMessage } from './motionProbe'
import type { PlantTreePreview } from './planting'
import type { ContractProtocolVersion } from './service'
import type { SnapshotPatch } from './snapshotPatchTypes'
import type { SpeechTranslation } from './social'

export interface WorldInitServerMessage {
    streamId: number
    seq: number
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
    streamId: number
    seq: number
    snapshot: WorldSnapshot
    type: 'snapshot'
}

export interface SnapshotDeltaServerMessage {
    type: 'snapshot_delta'
    streamId: number
    baseSeq: number
    seq: number
    tick: number
    serverTime: number
    stepMs: number
    patch?: SnapshotPatch
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
    | MotionPongServerMessage
    | SnapshotServerMessage
    | SnapshotDeltaServerMessage
    | SpeechTranslationServerMessage
    | WorldInitServerMessage
