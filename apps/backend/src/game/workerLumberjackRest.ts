import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    characterClearance,
    insideTravelEdges,
    standingOccupancy,
} from './characterSpacing'
import { findActorPath } from './doorNavigation'
import { containsBuildingPoint } from './mapBuildings'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'
import { stop, WorkerFieldRoute } from './workerNavigation'

const restStops = [
    { id: 'plaza', name: 'на площади' },
    { id: 'shop', name: 'у лавки' },
    { id: 'guild', name: 'у гильдии' },
] as const
type RestStop = (typeof restStops)[number]

/** One destination per pause, with a reachable alternative when the space fills. */
export class WorkerLumberjackRest {
    private nextStop = 0
    private start: number | undefined
    private restingAt: { stop: RestStop; position: Vector2 } | undefined
    private readonly route = new WorkerFieldRoute()

    public resume(): void {
        this.start = undefined
        this.restingAt = undefined
    }

    public advance(
        actor: GameCharacter,
        room: GameRoom,
        cityId: string,
        now: number
    ): string {
        if (this.start === undefined) {
            this.start = this.nextStop
            this.nextStop = (this.nextStop + 1) % restStops.length
        }
        const navigation = room.navigationFor({ locationId: cityId })
        const occupied = standingOccupancy(actor, room.charactersFor(actor))
        const free = (point: Vector2) =>
            occupied.every(
                (position) => distance(position, point) >= characterClearance
            )
        if (
            this.restingAt === undefined ||
            !free(this.restingAt.position) ||
            navigation.isSolidTile(
                navigation.worldToTile(this.restingAt.position)
            )
        ) {
            this.restingAt = chooseRestStop(
                this.start,
                actor,
                navigation,
                cityId,
                free
            )
        }
        if (this.restingAt === undefined) {
            stop(actor)
            return ''
        }
        const { stop: place, position } = this.restingAt
        const arrived = this.route.advance(
            actor,
            room,
            { id: `lumberjack-rest-${place.id}`, locationId: cityId, position },
            3,
            now
        )
        if (!arrived && actor.locationId === cityId && !actor.hasPath()) {
            this.restingAt = undefined
        }
        return place.name
    }
}

function chooseRestStop(
    start: number,
    actor: GameCharacter,
    navigation: NavigationService,
    cityId: string,
    free: (point: Vector2) => boolean
) {
    const ordered = [...restStops.slice(start), ...restStops.slice(0, start)]
    for (const stop of ordered) {
        const origin = restOrigin(navigation, stop.id)
        const position =
            origin === undefined
                ? undefined
                : restPoint(actor, navigation, cityId, origin, free)
        if (position !== undefined) {
            return { stop, position }
        }
    }
    return undefined
}

function restOrigin(
    navigation: NavigationService,
    id: RestStop['id']
): Vector2 | undefined {
    const area = navigation.grid.cityAreas?.['plaza']
    if (id === 'plaza' && area !== undefined) {
        return { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    }
    return (
        navigation.grid.landmarks?.find((landmark) => landmark.kind === id)
            ?.position ?? navigation.grid.cityAnchors?.[`service.${id}`]
    )
}

function restPoint(
    actor: GameCharacter,
    navigation: NavigationService,
    cityId: string,
    origin: Vector2,
    free: (point: Vector2) => boolean
): Vector2 | undefined {
    const tile = navigation.worldToTile(origin)
    const offsets = [0, 1, -1, 2, -2]
    return offsets
        .flatMap((x) =>
            offsets.map((y) =>
                navigation.tileToWorld({ x: tile.x + x, y: tile.y + y })
            )
        )
        .sort((a, b) => distance(a, origin) - distance(b, origin))
        .find(
            (point) =>
                insideTravelEdges(point, navigation) &&
                free(point) &&
                !(navigation.grid.buildings ?? []).some(
                    (building) =>
                        containsBuildingPoint(building.bounds, point) ||
                        distance(building.entry, point) < characterClearance
                ) &&
                !navigation.isSolidTile(navigation.worldToTile(point)) &&
                (actor.locationId !== cityId ||
                    distance(actor.position, point) <= 3 ||
                    findActorPath(navigation, actor, point).length > 0)
        )
}
