import type {
    AgentDecision,
    ChestClientMessage,
    ChestContainerSnapshot,
    GameEventPayload,
    MovementClientMessage,
    TheftClientMessage,
} from '@my-game-ratata/contracts'

import {
    applyAgentInventory,
    isInventoryDecision,
    isInventoryDecisionType,
    parseInventoryDecision,
} from './agentInventory'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { companionProfiles } from './companionProfiles'
import { canTargetByFaction } from './factions'
import {
    cancelMovementMode,
    handleMovementCommand,
    movementActionAllowed,
} from './movementActions'
import type { NavigationService } from './navigation'
import { isTheftCommand, isTheftCommandType } from './theftCommands'
import type { PickupRequest } from './worldPickup'

export interface CompanionWorld {
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
    requestAttack(character: GameCharacter, now?: number): void
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
    if (isInventoryDecision(decision)) {
        return applyAgentInventory(character, decision, world, now)
    }
    if (isTheftCommand(decision)) {
        return agentTheft(character, decision, world, now)
    }
    switch (decision.type) {
        case 'movement_mode':
        case 'dash':
            return agentMovement(character, decision, now)
        case 'move':
            character.setMoveInput(decision.axis)
            return accepted()
        case 'move_to':
            return agentMoveTo(character, decision.target, world)
        case 'attack':
            return agentAttack(character, decision.targetId, world, now)
        case 'speak':
            return agentSpeech(character, decision.text)
        case 'wait':
            cancelMovementMode(character)
            character.setMoveInput({ x: 0, y: 0 })
            character.clearPath()
            return accepted()
    }
}

function agentAttack(
    actor: GameCharacter,
    targetId: string,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    const target = world.getCharacter(targetId)
    if (companionProfiles[actor.id]?.canFight === false) {
        return rejected('This personality refuses combat')
    }
    if (
        target === undefined ||
        !target.alive ||
        target.tags.has('offline') ||
        target.locationId !== actor.locationId ||
        !canTargetByFaction(actor, target)
    ) {
        return rejected('Target is not a hostile character in this location')
    }
    const facing = actor.facing
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (
        !isTargetInAttackRange(
            actor,
            target,
            world.navigationFor(actor).grid.tileWidth
        )
    ) {
        actor.facing = facing
        return rejected('Target is outside attack reach')
    }
    world.requestAttack(actor, now)
    return accepted()
}

export function parseAgentDecision(input: unknown): AgentDecision | undefined {
    if (input === null || typeof input !== 'object') {
        return undefined
    }
    const record = input as Record<string, unknown>
    if (isTheftCommandType(record['type'])) {
        return parseTheft(record['type'], record['targetId'])
    }
    if (isInventoryDecisionType(record['type'])) {
        return parseInventoryDecision(record)
    }
    switch (record['type']) {
        case 'wait':
            return { type: 'wait' }
        case 'dash':
            return { type: 'dash' }
        case 'movement_mode':
            return parseMovementMode(record['mode'])
        case 'attack':
            return parseAttack(record['targetId'])
        case 'speak':
            return parseSpeech(record['text'])
        case 'move':
            return parseVector('move', record['axis'])
        case 'move_to':
            return parseVector('move_to', record['target'])
        default:
            return undefined
    }
}

function parseAttack(targetId: unknown): AgentDecision | undefined {
    return typeof targetId === 'string' &&
        targetId.length > 0 &&
        targetId.length <= 100
        ? { targetId, type: 'attack' }
        : undefined
}

function parseSpeech(text: unknown): AgentDecision | undefined {
    return typeof text === 'string' &&
        text.trim().length > 0 &&
        text.length <= 160
        ? { text: text.trim(), type: 'speak' }
        : undefined
}

function parseVector(
    type: 'move' | 'move_to',
    point: unknown
): AgentDecision | undefined {
    if (point === null || typeof point !== 'object') {
        return undefined
    }
    const vector = point as Record<string, unknown>
    const x = vector['x']
    const y = vector['y']
    if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return undefined
    }
    if (type === 'move' && (Math.abs(x) > 1 || Math.abs(y) > 1)) {
        return undefined
    }
    return type === 'move'
        ? { axis: { x, y }, type }
        : { target: { x, y }, type }
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
    world: CompanionWorld
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
    character.setPath(navigation.findPathWorld(character.position, target))
    return accepted()
}

function accepted(events: GameEventPayload[] = []): AgentDecisionResult {
    return { accepted: true, error: null, events }
}

function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}

function parseMovementMode(mode: unknown): MovementClientMessage | undefined {
    return mode === 'sneaking' || mode === 'walking'
        ? { type: 'movement_mode', mode }
        : undefined
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

function parseTheft(
    type: TheftClientMessage['type'],
    targetId: unknown
): TheftClientMessage | undefined {
    return typeof targetId === 'string' &&
        targetId.length > 0 &&
        targetId.length <= 100
        ? { type, targetId }
        : undefined
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
