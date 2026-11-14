import type {
    AbilityClientMessage,
    AdventureClientMessage,
    AgentDecision,
    CharacterControlCommand,
    ChestClientMessage,
    ChestContainerSnapshot,
    EquipmentActionClientMessage,
    GameEventPayload,
    InventoryActionClientMessage,
    MovementClientMessage,
    TheftClientMessage,
} from '@my-game-ratata/contracts'

import {
    applyAgentAbility,
    applyAgentControl,
    isAgentAbility,
    isAgentControl,
} from './agentCapabilities'
import { applyAgentAttack } from './agentCombat'
import { parseAgentDecision } from './agentDecisionParsing'
import { applyAgentInventory, isInventoryDecision } from './agentInventory'
export { parseAgentDecision } from './agentDecisionParsing'
import type { GameCharacter } from './character'
import { isAdventureCommand } from './extraCommands'
import {
    cancelMovementMode,
    handleMovementCommand,
    movementActionAllowed,
} from './movementActions'
import type { NavigationService } from './navigation'
import { cancelPrayerCast, cancelPrayerForMovement } from './prayerCancellation'
import { isTheftCommand } from './theftCommands'
import type { PickupRequest } from './worldPickup'

export interface CompanionWorld {
    requestAdventure?(
        actor: GameCharacter,
        message: AdventureClientMessage,
        now: number
    ): AgentDecisionResult
    requestInventoryAction?(
        actor: GameCharacter,
        message: InventoryActionClientMessage | EquipmentActionClientMessage,
        now: number
    ): AgentDecisionResult
    charactersFor?(actor: GameCharacter): readonly GameCharacter[]
    requestAbility?(
        actor: GameCharacter,
        message: AbilityClientMessage,
        now: number
    ): GameEventPayload[]
    requestControl?(
        actor: GameCharacter,
        message: CharacterControlCommand,
        now: number
    ): boolean

    requestPickup?: PickupRequest
    chestActions?: {
        handle(
            actor: GameCharacter,
            message: ChestClientMessage,
            now: number
        ): GameEventPayload[]
        snapshot(
            actor: GameCharacter,
            now: number
        ): ChestContainerSnapshot | null
    }
    requestTheft?(
        actor: GameCharacter,
        message: TheftClientMessage,
        now: number
    ): GameEventPayload[]
    findVisibleTarget(
        character: GameCharacter,
        radius: number
    ): GameCharacter | undefined
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(character: GameCharacter): NavigationService
    requestAttack(
        character: GameCharacter,
        now?: number,
        targetId?: string,
        target?: import('@my-game-ratata/contracts').WorldCombatTarget
    ): void
}

export interface AgentDecisionResult {
    chest?: ChestContainerSnapshot | null
    accepted: boolean
    error: string | null
    events: GameEventPayload[]
}

export function applyAgentDecision(
    character: GameCharacter,
    input: unknown,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    const decision = parseAgentDecision(input)
    if (decision === undefined) {
        return rejected('Invalid agent decision')
    }
    const unavailable = unavailableReason(character)
    if (unavailable !== undefined) {
        return rejected(unavailable)
    }
    const shared = applySharedDecision(character, decision, world, now)
    if (shared !== undefined) {
        return shared
    }
    switch (decision.type) {
        case 'movement_mode':
        case 'dash':
            return agentMovement(character, decision, now)
        case 'move':
            cancelAgentControl(character, world, now)
            character.setMoveInput(decision.axis)
            return accepted(
                cancelPrayerForMovement(character, decision.axis, now)
            )
        case 'move_to':
            return agentMoveTo(character, decision.target, world, now)
        case 'attack':
            return applyAgentAttack(character, decision, world, now)
        case 'speak':
            return agentSpeech(character, decision.text)
        case 'wait':
            cancelAgentControl(character, world, now)
            cancelMovementMode(character)
            character.setMoveInput({ x: 0, y: 0 })
            character.clearPath()
            return accepted(cancelPrayerCast(character, now))
        default:
            return rejected('Unsupported agent decision')
    }
}

function unavailableReason(character: GameCharacter): string | undefined {
    if (
        !character.alive ||
        character.tags.has('offline') ||
        character.tags.has('state.retired')
    ) {
        return 'Character is not available'
    }
    if (
        character.controllerKind === 'network_player' ||
        character.soul.controlSource === 'human'
    ) {
        return 'Human control cannot be replaced'
    }
    return undefined
}

function agentMoveTo(
    character: GameCharacter,
    target: { x: number; y: number },
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    const navigation = world.navigationFor(character)
    if (
        target.x < 0 ||
        target.y < 0 ||
        target.x > navigation.summary.worldWidth ||
        target.y > navigation.summary.worldHeight
    ) {
        return rejected('Destination is outside this location')
    }
    cancelAgentControl(character, world, now)
    character.setPath(navigation.findPathWorld(character.position, target))
    return accepted(cancelPrayerCast(character, now))
}

function accepted(events: GameEventPayload[] = []): AgentDecisionResult {
    return { accepted: true, error: null, events }
}

function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}

function agentMovement(
    character: GameCharacter,
    decision: MovementClientMessage,
    now: number
): AgentDecisionResult {
    return movementActionAllowed(character, decision, now)
        ? accepted(handleMovementCommand(character, decision, now))
        : rejected(
              'Movement action is unavailable: check energy, cooldown and control effects'
          )
}

function agentTheft(
    character: GameCharacter,
    decision: TheftClientMessage,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    return world.requestTheft === undefined
        ? rejected('Theft service unavailable')
        : accepted(world.requestTheft(character, decision, now))
}
function agentSpeech(
    character: GameCharacter,
    text: string
): AgentDecisionResult {
    return character.soul.canSpeak
        ? accepted([{ actorId: character.id, kind: 'chat', text }])
        : rejected('This creature cannot speak')
}

function applySharedDecision(
    actor: GameCharacter,
    decision: AgentDecision,
    world: CompanionWorld,
    now: number
): AgentDecisionResult | undefined {
    if (
        decision.type === 'inventory_action' ||
        decision.type === 'equipment_action'
    ) {
        return (
            world.requestInventoryAction?.(actor, decision, now) ??
            rejected('Inventory service unavailable')
        )
    }
    if (isAdventureCommand(decision)) {
        return (
            world.requestAdventure?.(actor, decision, now) ??
            rejected('Adventure service unavailable')
        )
    }
    if (isInventoryDecision(decision)) {
        return applyAgentInventory(actor, decision, world, now)
    }
    if (isTheftCommand(decision)) {
        return agentTheft(actor, decision, world, now)
    }
    if (isAgentAbility(decision)) {
        return applyAgentAbility(actor, decision, world, now)
    }
    if (isAgentControl(decision)) {
        return applyAgentControl(actor, decision, world, now)
    }
    return undefined
}

function cancelAgentControl(
    actor: GameCharacter,
    world: CompanionWorld,
    now: number
): void {
    world.requestControl?.(actor, { type: 'cancel_control' }, now)
}
