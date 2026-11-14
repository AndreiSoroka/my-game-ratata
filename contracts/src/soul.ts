import type { AbilityClientMessage } from './abilities'
import type { AdventureClientMessage } from './adventure'
import type { CharacterControlCommand } from './control'
export type { CharacterControlCommand } from './control'
import type { ChestClientMessage } from './chests'
import type { PickupItemClientMessage } from './index'
import type {
    EquipmentActionClientMessage,
    InventoryActionClientMessage,
} from './index'
import type { MovementClientMessage } from './movement'
import type { AutomationCommand } from './scenarios'
import type { TheftClientMessage } from './theft'

export type SoulKind = 'spark' | 'echo'
export type ControlSource = 'human' | 'model' | 'script'
export type CompanionOrder = 'idle' | 'follow' | 'guard' | 'help'
export type CompanionRequest = 'follow' | 'guard' | 'help' | 'dismiss' | 'talk'

/** Authored willingness to accept a scenario; evaluated by the server. */
export type AssistancePolicy =
    | { kind: 'always' }
    | { kind: 'never' }
    | { kind: 'met' }
    | { kind: 'quest_completed'; questId: string }
    | { kind: 'all'; conditions: AssistancePolicy[] }
    | { kind: 'any'; conditions: AssistancePolicy[] }

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
    | AutomationCommand
    | AdventureClientMessage
    | InventoryActionClientMessage
    | EquipmentActionClientMessage
    | AbilityClientMessage
    | CharacterControlCommand
    | PickupItemClientMessage
    | ChestClientMessage
    | TheftClientMessage
    | MovementClientMessage
    | { type: 'move'; axis: { x: number; y: number } }
    | { type: 'move_to'; target: { x: number; y: number }; append?: boolean }
    | {
          type: 'attack'
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { type: 'speak'; text: string }
    | { type: 'wait' }
