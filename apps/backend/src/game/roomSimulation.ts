import type {
    GameEventPayload,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { getWorldLocationDefinition } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    advanceCharacterControl,
    rememberObservedCrossing,
} from './characterControl'
import { resolvePendingAttackHit } from './combat'
import type { CompanionService } from './companions'
import type { CharacterController } from './controllers'
import { recordMovementNoise } from './hearing'
import { advanceCharacter } from './movement'
import type { PartyService } from './parties'
import type { GameRoom } from './room'
import { resourceOccupants } from './roomEconomy'
import type { RoomLife } from './roomLife'
import { type RoomSocket, send } from './roomMessaging'
import { practiceStealthMovement } from './stealthPractice'
import type { TheftService } from './theft'
import { centerLocationId, type WorldLocations } from './worldLocations'

interface SimulationContext {
    companions: CompanionService
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    controllers: Map<string, CharacterController>
    deltaMs: number
    nicknames: Map<string, string>
    life: RoomLife
    now: number
    onEvents: (events: GameEventPayload[]) => void
    parties: PartyService
    theft: TheftService
    room: GameRoom
    snapshot: (
        now: number,
        locationId: string | undefined,
        playerId: string | undefined
    ) => WorldSnapshot
    world: WorldLocations
}

export function advanceRoomSimulation(context: SimulationContext): void {
    const { characters, controllers, room, now } = context
    room.adventureForWorkers().update(
        now,
        (id) => context.world.get(id).navigation,
        characters.values(),
        (id) => resourceOccupants(context.world, id)
    )
    for (const character of characters.values()) {
        context.companions.hasActiveLease(character, now, room)
    }
    const reacting = context.theft.update(room, characters.values(), now)
    for (const [id, controller] of controllers) {
        const character = characters.get(id)
        if (character !== undefined && !reacting.has(id)) {
            if (advanceCharacterControl(character, room, now)) {
                continue
            }
            controller.update(character, room, now)
        }
    }
    for (const character of characters.values()) {
        advanceWorldCharacter(character, context)
    }
    for (const character of characters.values()) {
        resolveWorldAttack(character, context)
    }
    context.life.advance(now, (actor, at) => room.abilityContextFor(actor, at))
    context.world.updateChestViews(characters, now)
    context.onEvents(context.parties.update(characters.values(), now))
    for (const [ws, id] of context.connections) {
        const locationId =
            id === undefined ? centerLocationId : characters.get(id)?.locationId
        send(ws, {
            snapshot: context.snapshot(now, locationId, id),
            type: 'snapshot',
        })
    }
}

function advanceWorldCharacter(
    character: GameCharacter,
    context: SimulationContext
): void {
    const { now, deltaMs, world, onEvents } = context
    const intent = movementIntent(character, now, deltaMs)
    const before = { ...character.position }
    const navigation = world.get(character.locationId).navigation
    const event = advanceCharacter({
        character,
        deltaMs,
        now,
        navigation,
        onNoise: (noise) =>
            recordMovementNoise(
                context.room,
                noise,
                context.characters.values()
            ),
    })
    if (event !== undefined) {
        onEvents([event])
    }
    onEvents(
        practiceStealthMovement(
            character,
            before,
            context.characters.values(),
            navigation,
            now
        )
    )
    if (
        !character.alive ||
        character.tags.has('offline') ||
        character.isActionLocked(now) ||
        character.stunUntil > now
    ) {
        return
    }
    const from = character.locationId
    const edge = { ...character.position }
    const notice = world.travel(character, intent)
    if (from !== character.locationId) {
        const previous = getWorldLocationDefinition(from)
        const next = getWorldLocationDefinition(character.locationId)
        if (previous !== undefined && next !== undefined) {
            rememberObservedCrossing(
                character,
                from,
                edge,
                {
                    x: next.column - previous.column,
                    y: next.row - previous.row,
                },
                context.characters.values(),
                navigation,
                now
            )
        }
    }
    if (notice !== undefined) {
        sendTravelNotice(character, notice, context)
    }
}

function movementIntent(
    character: GameCharacter,
    now: number,
    deltaMs: number
): Vector2 {
    if (
        character.movement.dashUntil > now - deltaMs &&
        character.movement.dashStartedAt < now
    ) {
        return character.movement.dashDirection
    }
    const input = character.getMoveInput()
    const point = character.nextPathPoint()
    return input.x !== 0 || input.y !== 0 || point === undefined
        ? input
        : {
              x: point.x - character.position.x,
              y: point.y - character.position.y,
          }
}

function sendTravelNotice(
    character: GameCharacter,
    notice: string,
    context: SimulationContext
): void {
    for (const [ws, id] of context.connections) {
        if (id === character.id) {
            send(ws, {
                type: 'event',
                serverTime: context.now,
                event: { kind: 'notice', actorId: id, text: notice },
            })
        }
    }
}

function resolveWorldAttack(
    character: GameCharacter,
    context: SimulationContext
): void {
    const { characters, world, now, onEvents } = context
    const location = world.get(character.locationId)
    const targets = [...characters.values()].filter(
        (target) =>
            target.locationId === character.locationId &&
            !target.tags.has('offline')
    )
    const hitEvents = resolvePendingAttackHit({
        actor: character,
        now,
        respawnDelayMsFor: resolveRespawnDelayMs,
        targets,
        navigation: location.navigation,
        tileSize: location.navigation.grid.tileWidth,
    })
    const lootEvents = location.inventory.dropLootForDeaths(hitEvents, (id) =>
        characters.get(id)
    )
    onEvents([...hitEvents, ...lootEvents])
}

export function resolveRespawnDelayMs(target: GameCharacter): number {
    return target.controllerKind === 'network_player' ? 5000 : 15000
}
