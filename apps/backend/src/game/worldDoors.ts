import {
    authoredRussian,
    DOOR_INTERACTION_RANGE,
    type DoorAction,
    doorApproachPoints,
    type GameEventPayload,
    type Vector2,
    type WorldObjectClientMessage,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import { available } from './crimeRules'
import { canAutoOpenDoors } from './doorNavigation'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { occupied } from './resourcePlacement'
import { withWorldSound } from './worldSound'

type Door = NonNullable<ReturnType<NavigationService['door']>>
type DoorRefusal =
    | 'world.outOfReach'
    | 'world.doorUnavailable'
    | 'world.doorOccupied'
    | 'world.doorLocked'
interface DoorResult {
    error?: DoorRefusal
    events: GameEventPayload[]
}

const knockIntervalMs = 700
const lastKnock = new WeakMap<GameCharacter, Map<string, number>>()
const effects = {
    knock: 'doorKnock',
    open: 'doorOpen',
    close: 'doorClose',
} as const

export function requestDoorInteraction(
    actor: GameCharacter,
    state: PlayerAdventure,
    message: WorldObjectClientMessage,
    characters: readonly GameCharacter[],
    navigation: NavigationService | undefined,
    now: number
): AdventureActionResult | undefined {
    const door = navigation?.door(message.objectId)
    const action = message.doorAction
    if (door === undefined && action === undefined) {
        return undefined
    }
    const result: DoorResult =
        navigation === undefined || door === undefined || action === undefined
            ? { error: 'world.doorUnavailable', events: [] }
            : applyDoorAction(actor, navigation, door, action, now, characters)
    if (result.error !== undefined) {
        setAuthoredNotice(state, result.error)
        return {
            accepted: false,
            error: authoredRussian(result.error),
            events: [],
        }
    }
    if (state.notice !== null) {
        setNotice(state, null)
    }
    return { accepted: true, error: null, events: result.events }
}

export function openPathDoor(
    actor: GameCharacter,
    navigation: NavigationService,
    waypoint: Vector2,
    now: number
): GameEventPayload[] | undefined {
    const door = navigation.doorAt(waypoint)
    if (door?.state !== 'closed' || !canAutoOpenDoors(actor)) {
        return undefined
    }
    return applyDoorAction(actor, navigation, door, 'open', now).events
}

function applyDoorAction(
    actor: GameCharacter,
    navigation: NavigationService,
    door: Door,
    action: DoorAction,
    now: number,
    characters: readonly GameCharacter[] = []
): DoorResult {
    if (!canUseDoor(actor, navigation, door, now)) {
        return { error: 'world.outOfReach', events: [] }
    }
    if (door.state === 'locked') {
        return knockDoor(actor, door, action, now)
    }
    if (action === 'knock') {
        return { error: 'world.doorUnavailable', events: [] }
    }
    if (action === 'close' && door.state === 'open') {
        if (occupied(door.bounds, [actor, ...characters], door.locationId)) {
            return { error: 'world.doorOccupied', events: [] }
        }
        navigation.setDoorState(door.id, 'closed')
        clearBlockedPaths(navigation, door, characters)
        return doorSound(actor, door, action)
    }
    return action === 'open' && navigation.setDoorState(door.id, 'open')
        ? doorSound(actor, door, action)
        : { events: [] }
}

function canUseDoor(
    actor: GameCharacter,
    navigation: NavigationService,
    door: Door,
    now: number
): boolean {
    return (
        actor.locationId === door.locationId &&
        available(actor) &&
        actor.stunUntil <= now &&
        !actor.isActionLocked(now) &&
        doorApproachPoints(door.bounds, door.state).some(
            (point) =>
                distance(actor.position, point) <= DOOR_INTERACTION_RANGE &&
                navigation.hasLineOfSight(actor.position, point)
        )
    )
}

function clearBlockedPaths(
    navigation: NavigationService,
    door: Door,
    characters: readonly GameCharacter[]
) {
    for (const character of characters) {
        if (
            character.locationId === door.locationId &&
            !canAutoOpenDoors(character) &&
            character
                .remainingPath()
                .some((point) => navigation.doorAt(point)?.id === door.id)
        ) {
            character.clearPath()
        }
    }
}

function doorSound(
    actor: GameCharacter,
    door: Door,
    action: DoorAction
): DoorResult {
    const { x, y, width, height } = door.bounds
    const position = { x: x + width / 2, y: y + height / 2 }
    return {
        events: [
            withWorldSound(
                {
                    kind: 'door_interact',
                    actorId: actor.id,
                    objectId: door.id,
                    locationId: door.locationId,
                },
                effects[action],
                door.locationId,
                position,
                { sourceBounds: door.bounds }
            ),
        ],
    }
}

function knockDoor(
    actor: GameCharacter,
    door: Door,
    action: DoorAction,
    now: number
): DoorResult {
    if (action !== 'knock') {
        return { error: 'world.doorLocked', events: [] }
    }
    const times = lastKnock.get(actor) ?? new Map<string, number>()
    if (now - (times.get(door.id) ?? -Infinity) < knockIntervalMs) {
        return { events: [] }
    }
    times.set(door.id, now)
    lastKnock.set(actor, times)
    return doorSound(actor, door, 'knock')
}
