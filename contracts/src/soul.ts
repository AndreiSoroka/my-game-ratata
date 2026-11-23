import type { AbilityClientMessage } from './abilities'
import type { AdventureClientMessage } from './adventure'
import type { CharacterControlCommand } from './control'
export type { CharacterControlCommand } from './control'
import type { ChestClientMessage } from './chests'
import type { ExchangeClientMessage } from './exchange'
import type { PickupItemClientMessage } from './index'
import type {
    EquipmentActionClientMessage,
    InventoryActionClientMessage,
} from './index'
import type { MovementClientMessage } from './movement'
import type { NpcQuestDecision } from './npcQuests'
import type { AutomationCommand } from './scenarios'
import type { TheftClientMessage } from './theft'

export type SoulKind = 'spark' | 'echo'
export type ControlSource = 'human' | 'model' | 'script'
export type CompanionOrder = 'idle' | 'follow' | 'guard' | 'help' | 'wait'
export type CompanionWaitMode = 'until_request' | 'until_return'
export type CompanionRequest =
    'follow' | 'guard' | 'help' | 'dismiss' | 'talk' | 'wait'
export const COMPANION_REQUEST_RANGE = 64

/** Authored willingness to accept a scenario; evaluated by the server. */
export type AssistancePolicy =
    | { kind: 'always' }
    | { kind: 'never' }
    | { kind: 'met' }
    | { kind: 'quest_completed'; questId: string }
    | { kind: 'all'; conditions: AssistancePolicy[] }
    | { kind: 'any'; conditions: AssistancePolicy[] }

export interface SoulSnapshot {
    canSpeak: boolean
    controlSource: ControlSource
    kind: SoulKind
}

export interface CompanionClientMessage {
    request: CompanionRequest
    targetId: string
    text?: string
    waitMode?: CompanionWaitMode
    type: 'companion_request'
}

export type AgentDecision =
    | ExchangeClientMessage
    | NpcQuestDecision
    | AutomationCommand
    | AdventureClientMessage
    | InventoryActionClientMessage
    | EquipmentActionClientMessage
    | AbilityClientMessage
    | import('./magic').UsePortalCommand
    | CharacterControlCommand
    | PickupItemClientMessage
    | ChestClientMessage
    | TheftClientMessage
    | MovementClientMessage
    | { type: 'move'; axis: { x: number; y: number } }
    | { type: 'move_to'; target: { x: number; y: number }; append?: boolean }
    | { type: 'guide'; targetKey: string }
    | { type: 'travel_to'; targetKey: string; inviteEscort: boolean }
    | { type: 'leave_companion' }
    | { type: 'propose_follow'; targetId: string }
    | { type: 'start_following'; targetId: string }
    | {
          type: 'attack'
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { type: 'speak'; text: string; targetId?: string }
    | { type: 'wait' }
