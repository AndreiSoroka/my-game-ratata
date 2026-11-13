import type { AbilityClientMessage } from './abilities'
import type { CharacterControlCommand } from './control'
export type { CharacterControlCommand } from './control'
import type { ChestClientMessage } from './chests'
import type { PickupItemClientMessage } from './index'
import type { MovementClientMessage } from './movement'
import type { TheftClientMessage } from './theft'

export type SoulKind = 'spark' | 'echo'
export type ControlSource = 'human' | 'model' | 'script'
export type CompanionOrder = 'idle' | 'follow' | 'guard' | 'help'
export type CompanionRequest = 'follow' | 'guard' | 'help' | 'dismiss' | 'talk'

export interface SoulProfile {
    canSpeak: boolean
    controlSource: ControlSource
    kind: SoulKind
    personality: string
}

export interface CompanionSnapshot {
    canFight: boolean
    lastReply: string | null
    leaderId: string | null
    order: CompanionOrder
}

export interface SoulSnapshot extends SoulProfile {
    companion: CompanionSnapshot | null
}

export interface CompanionClientMessage {
    request: CompanionRequest
    targetId: string
    text?: string
    type: 'companion_request'
}

export type AgentDecision =
    | AbilityClientMessage
    | CharacterControlCommand
    | PickupItemClientMessage
    | ChestClientMessage
    | TheftClientMessage
    | MovementClientMessage
    | { type: 'move'; axis: { x: number; y: number } }
    | { type: 'move_to'; target: { x: number; y: number } }
    | { type: 'attack'; targetId: string }
    | { type: 'speak'; text: string }
    | { type: 'wait' }
